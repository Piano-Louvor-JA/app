import { describe, expect, it, vi } from 'vitest'

import {
  descriptionExcerpt,
  fetchOnlineVideoInfo,
  fetchSiteLinkInfo,
  linkInfoDraftPatch,
  linkInfoNotes,
} from '../link-info'

const ID = '0GnC-QzIpyo'
const desktopInfo = {
  title: 'Quarteto Athus - Deus o Pode',
  channel: 'Eder Bomfim',
  description: 'Canção belíssima',
  durationMs: 303_000,
}
const videoInfo = {
  title: 'Quarteto Athus - Deus o Pode',
  source: 'Eder Bomfim',
  description: 'Canção belíssima',
  durationMs: 303_000,
}
const label = (name: string) => `Canal: ${name}`

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response
}

describe('fetchOnlineVideoInfo', () => {
  it('YouTube no desktop: dados completos da página do vídeo, sem oEmbed', async () => {
    const fetch = vi.fn()
    const get = vi.fn(async () => desktopInfo)
    expect(await fetchOnlineVideoInfo(`https://youtu.be/${ID}`, { fetch, ytInfo: { get } })).toEqual(videoInfo)
    expect(get).toHaveBeenCalledWith(ID)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('YouTube sem desktop (ou se a página falhar): oEmbed com título e canal', async () => {
    const fetch = vi.fn(async () => jsonResponse({ title: ' Vox - Hino ', author_name: 'Vox Brasil' }))
    const expected = { title: 'Vox - Hino', source: 'Vox Brasil', description: '', durationMs: 0 }
    expect(await fetchOnlineVideoInfo(`https://www.youtube.com/watch?v=${ID}`, { fetch })).toEqual(expected)
    expect(fetch).toHaveBeenCalledWith(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}&format=json`,
    )

    const failing = { get: vi.fn(async () => { throw new Error('ipc') }) }
    expect(await fetchOnlineVideoInfo(`https://youtu.be/${ID}`, { fetch, ytInfo: failing })).toEqual(expected)
    const empty = { get: vi.fn(async () => null) }
    expect(await fetchOnlineVideoInfo(`https://youtu.be/${ID}`, { fetch, ytInfo: empty })).toEqual(expected)
  })

  it('Vimeo: oEmbed com descrição e duração', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ title: 'Arautos do Rei', author_name: 'Canal', description: 'Ao vivo', duration: 245 }),
    )
    expect(await fetchOnlineVideoInfo('https://vimeo.com/123456', { fetch })).toEqual({
      title: 'Arautos do Rei', source: 'Canal', description: 'Ao vivo', durationMs: 245_000,
    })
    expect(fetch).toHaveBeenCalledWith(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent('https://vimeo.com/123456')}`,
    )
  })

  it('sem dados: site comum, link inválido, erro HTTP, sem título, falha de rede', async () => {
    const fetch = vi.fn(async () => jsonResponse({ title: 'x' }))
    expect(await fetchOnlineVideoInfo('https://exemplo.com/pagina', { fetch })).toBeNull()
    expect(await fetchOnlineVideoInfo('', { fetch })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    const yt = `https://youtu.be/${ID}`
    expect(await fetchOnlineVideoInfo(yt, { fetch: async () => jsonResponse({}, false) })).toBeNull()
    expect(await fetchOnlineVideoInfo(yt, { fetch: async () => jsonResponse({ title: 1, duration: 'x' }) })).toBeNull()
    expect(await fetchOnlineVideoInfo(yt, { fetch: async () => { throw new Error('offline') } })).toBeNull()
  })

  it('usa o fetch global quando não recebe um', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ title: 'Global' }))
    expect((await fetchOnlineVideoInfo('https://vimeo.com/1'))?.title).toBe('Global')
    spy.mockRestore()
  })
})

describe('fetchSiteLinkInfo', () => {
  const page = { title: 'Igreja Adventista do Sétimo Dia', siteName: 'Adventistas', description: 'Portal oficial' }

  it('pede a página ao desktop com o link normalizado', async () => {
    const get = vi.fn(async () => page)
    expect(await fetchSiteLinkInfo('adventistas.org/pt', { siteInfo: { get } })).toEqual({
      title: page.title, source: 'Adventistas', description: 'Portal oficial', durationMs: 0,
    })
    expect(get).toHaveBeenCalledWith('https://adventistas.org/pt')
  })

  it('sem desktop, link inválido, sem título ou falha: sem dados', async () => {
    const get = vi.fn(async () => page)
    expect(await fetchSiteLinkInfo('https://adventistas.org')).toBeNull()
    expect(await fetchSiteLinkInfo('   ', { siteInfo: { get } })).toBeNull()
    expect(get).not.toHaveBeenCalled()
    expect(await fetchSiteLinkInfo('https://x.org', { siteInfo: { get: async () => null } })).toBeNull()
    expect(await fetchSiteLinkInfo('https://x.org', { siteInfo: { get: async () => ({ ...page, title: '' }) } })).toBeNull()
    expect(
      await fetchSiteLinkInfo('https://x.org', { siteInfo: { get: async () => { throw new Error('ipc') } } }),
    ).toBeNull()
  })
})

describe('anotações do link', () => {
  it('trecho da descrição: tira linhas de link e hashtags, corta em palavra inteira', () => {
    expect(descriptionExcerpt('Linha 1\n\nhttps://x.com/a\n#hino #louvor\n  Linha 2  ')).toBe('Linha 1\nLinha 2')
    expect(descriptionExcerpt('')).toBe('')
    expect(descriptionExcerpt('palavra '.repeat(10), 30)).toBe('palavra palavra palavra…')
    expect(descriptionExcerpt('a'.repeat(50), 20)).toBe(`${'a'.repeat(19)}…`)
  })

  it('origem e trecho separados por linha em branco; só o que existir, sem repetir', () => {
    expect(linkInfoNotes(videoInfo, label)).toBe('Canal: Eder Bomfim\n\nCanção belíssima')
    expect(linkInfoNotes({ ...videoInfo, description: '' }, label)).toBe('Canal: Eder Bomfim')
    expect(linkInfoNotes({ ...videoInfo, source: '' }, label)).toBe('Canção belíssima')
    expect(linkInfoNotes({ ...videoInfo, source: '', description: '' }, label)).toBe('')
    expect(linkInfoNotes({ ...videoInfo, source: 'hinario.org', description: 'hinario.org' }, label)).toBe('hinario.org')
  })
})

describe('linkInfoDraftPatch', () => {
  it('preenche título, anotações e duração quando os campos estão vazios', () => {
    expect(linkInfoDraftPatch({ name: ' ', subtitle: '' }, videoInfo, label)).toEqual({
      name: videoInfo.title,
      subtitle: 'Canal: Eder Bomfim\n\nCanção belíssima',
      durationMs: 303_000,
    })
  })

  it('não sobrescreve o que o usuário digitou; duração desconhecida fica como está', () => {
    expect(
      linkInfoDraftPatch({ name: 'Abertura', subtitle: 'Minha nota' }, { ...videoInfo, durationMs: 0 }, label),
    ).toEqual({})
  })

  it('troca o que o próprio preenchimento pôs quando o link muda', () => {
    const autoFilled = { name: 'Vídeo antigo', subtitle: 'Canal: Antigo' }
    expect(linkInfoDraftPatch(autoFilled, videoInfo, label, autoFilled)).toEqual({
      name: videoInfo.title,
      subtitle: 'Canal: Eder Bomfim\n\nCanção belíssima',
      durationMs: 303_000,
    })
  })

  it('sem origem nem descrição não mexe nas anotações', () => {
    expect(
      linkInfoDraftPatch({ name: '', subtitle: '' }, { ...videoInfo, source: '', description: '' }, label),
    ).toEqual({ name: videoInfo.title, durationMs: 303_000 })
  })
})
