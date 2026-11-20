// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { decodeHtmlEntities, fetchSiteInfo, parseSiteInfo, registerSiteInfoIpc } from '../site-info.mjs'

const PAGE = `<!doctype html><html><head>
<meta charset="utf-8">
<title>  Igreja   Adventista
 do Sétimo Dia </title>
<meta name="description" content="Descrição comum">
<meta property="og:title" content="Igreja Adventista do Sétimo Dia" />
<meta property='og:description' content='Portal oficial &#x2014; crenças &amp; esperança'>
<meta property="og:site_name" content="Adventistas">
</head><body>corpo</body></html>`

function htmlResponse(body, headers = { 'content-type': 'text/html; charset=UTF-8' }, status = 200) {
  return new Response(body, { status, headers })
}

describe('dados da página para o item de site', () => {
  it('decodifica entidades nomeadas, decimais e hexadecimais', () => {
    expect(decodeHtmlEntities('a &amp; b &quot;c&quot; &#064;x &#x1F64F; &nbsp;&copy; &#0; &#x110000;')).toBe(
      'a & b "c" @x 🙏  &copy; &#0; &#x110000;',
    )
    expect(decodeHtmlEntities(undefined)).toBe('')
  })

  it('prefere Open Graph; cai para <title>, description e twitter', () => {
    expect(parseSiteInfo(PAGE)).toEqual({
      title: 'Igreja Adventista do Sétimo Dia',
      siteName: 'Adventistas',
      description: 'Portal oficial — crenças & esperança',
    })
    expect(parseSiteInfo('<title>Hinario</title><meta name="description" content="hinario.org">')).toEqual({
      title: 'Hinario', siteName: '', description: 'hinario.org',
    })
    expect(
      parseSiteInfo('<meta name=twitter:title content=Curto><meta name="twitter:description" content="Linha 1\n  Linha 2">'),
    ).toEqual({ title: 'Curto', siteName: '', description: 'Linha 1\nLinha 2' })
    expect(parseSiteInfo('<meta property="og:title" content=" "><title>Reserva</title>')?.title).toBe('Reserva')
    expect(parseSiteInfo('<meta name="description" content="sem título"><meta content="x"><meta property="og:title">')).toBeNull()
    expect(parseSiteInfo(undefined)).toBeNull()
  })

  it('busca a página com identificação de prévia e completa o nome do site pelo domínio', async () => {
    const fetch = vi.fn(async () => htmlResponse(PAGE.replace(/<meta property="og:site_name"[^>]*>/, '')))
    expect(await fetchSiteInfo('https://www.adventistas.org/pt/', { fetch })).toEqual({
      title: 'Igreja Adventista do Sétimo Dia',
      siteName: 'adventistas.org',
      description: 'Portal oficial — crenças & esperança',
    })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://www.adventistas.org/pt/')
    expect(init.headers['User-Agent']).toMatch(/link preview/)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('respeita o charset da página (latin1) pelo cabeçalho ou pela meta tag', async () => {
    const latin1 = Buffer.from('<head><title>Hinário Adventista</title></head>', 'latin1')
    const viaHeader = await fetchSiteInfo('http://hinos.test/', {
      fetch: async () => htmlResponse(latin1, { 'content-type': 'text/html; charset=ISO-8859-1' }),
    })
    expect(viaHeader?.title).toBe('Hinário Adventista')
    const viaMeta = await fetchSiteInfo('http://hinos.test/', {
      fetch: async () => htmlResponse(Buffer.concat([Buffer.from('<meta charset="windows-1252">'), latin1]), {}),
    })
    expect(viaMeta?.title).toBe('Hinário Adventista')
    const unknown = await fetchSiteInfo('http://hinos.test/', {
      fetch: async () => htmlResponse('<title>Ok</title>', { 'content-type': 'text/html; charset=nao-existe' }),
    })
    expect(unknown?.title).toBe('Ok')
    const undeclared = await fetchSiteInfo('http://hinos.test/', {
      fetch: async () => htmlResponse(Buffer.from('<title>Hinário</title>'), {}),
    })
    expect(undeclared?.title).toBe('Hinário')
  })

  it('lê só até o fim do <head>, mesmo com a página em vários pedaços', async () => {
    const cancel = vi.fn(() => { throw new Error('já fechado') })
    let pulls = 0
    const body = new ReadableStream({
      pull(controller) {
        pulls += 1
        if (pulls === 1) controller.enqueue(new TextEncoder().encode('<head><title>Primeiro</title></he'))
        else if (pulls === 2) controller.enqueue(new TextEncoder().encode('ad><body>'))
        else controller.enqueue(new TextEncoder().encode('x'.repeat(1024)))
      },
      cancel,
    })
    const info = await fetchSiteInfo('https://longa.test/', { fetch: async () => htmlResponse(body) })
    expect(info?.title).toBe('Primeiro')
    expect(pulls).toBeLessThanOrEqual(4)
    expect(cancel).toHaveBeenCalled()
  })

  it('título e meta tags depois do </head> (como no YouTube) ainda são lidos', async () => {
    const parts = [
      '<head><script>x</script></head><body>',
      '<div>', `<title>Rede Novo Tempo - YouTube</title>`,
      '<meta property="og:title" content="Rede Novo Tempo"><meta property="og:site_name" content="YouTube">',
    ]
    let pulls = 0
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(parts[pulls] ?? 'x'.repeat(1024)))
        pulls += 1
      },
    })
    expect(await fetchSiteInfo('https://www.youtube.com/@NovoTempo', { fetch: async () => htmlResponse(body) })).toEqual({
      title: 'Rede Novo Tempo', siteName: 'YouTube', description: '',
    })
    expect(pulls).toBeLessThanOrEqual(5)
  })

  it('para no limite de tamanho quando o <head> não fecha', async () => {
    const chunk = new TextEncoder().encode(`<title>Gigante</title>${'x'.repeat(512 * 1024)}`)
    let pulls = 0
    const body = new ReadableStream({ pull(controller) { pulls += 1; controller.enqueue(chunk) } })
    expect((await fetchSiteInfo('https://gigante.test/', { fetch: async () => htmlResponse(body) }))?.title).toBe('Gigante')
    expect(pulls).toBeLessThanOrEqual(6)
  })

  it('null para link inválido, protocolo não web, erro HTTP, conteúdo que não é HTML, sem título e falha de rede', async () => {
    const fetch = vi.fn()
    expect(await fetchSiteInfo('nao é link', { fetch })).toBeNull()
    expect(await fetchSiteInfo(undefined, { fetch })).toBeNull()
    expect(await fetchSiteInfo('file:///etc/passwd', { fetch })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(await fetchSiteInfo('https://x.test/', { fetch: async () => htmlResponse('', undefined, 404) })).toBeNull()
    expect(
      await fetchSiteInfo('https://x.test/a.pdf', { fetch: async () => htmlResponse('%PDF', { 'content-type': 'application/pdf' }) }),
    ).toBeNull()
    expect(await fetchSiteInfo('https://x.test/', { fetch: async () => htmlResponse('<p>nada</p>') })).toBeNull()
    expect(await fetchSiteInfo('https://x.test/', { fetch: async () => htmlResponse(null) })).toBeNull()
    expect(await fetchSiteInfo('https://x.test/', { fetch: async () => { throw new Error('offline') } })).toBeNull()
  })

  it('IPC site-info:get', async () => {
    let handler
    registerSiteInfoIpc({ handle: (channel, fn) => { expect(channel).toBe('site-info:get'); handler = fn } }, {
      fetch: async () => htmlResponse(PAGE),
    })
    expect((await handler({}, 'https://adventistas.org'))?.siteName).toBe('Adventistas')
    expect(await handler({}, null)).toBeNull()
  })
})
