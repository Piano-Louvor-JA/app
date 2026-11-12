/**
 * Testes da página do Pregador (/speaker) — speakerPageHtml() no palco-server.
 *
 * RF6: preview full-area (flex:1, min-height:0, 100dvh) — sem aspect-ratio fixo.
 * RF7/i18n: dicionário SPEAKER_I18N completo nos 3 idiomas; TODO texto visível
 * do template pt-BR vem do dicionário (data-i18n), nada hardcoded.
 * Tokens: cores/raios do CSS vêm interpoladas de SPEAKER_TOKENS (design system).
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const serverUrl = pathToFileURL(path.resolve(process.cwd(), 'electron/palco-server.mjs')).href
const { speakerPageHtml, SPEAKER_I18N } = await import(serverUrl)

const html = speakerPageHtml()

describe('speakerPageHtml — RF6 preview full-area', () => {
  it('CSS usa layout flexível full-height (100dvh + flex:1 + min-height:0)', () => {
    expect(html).toContain('min-height:100dvh')
    expect(html).toContain('.preview{flex:1')
    expect(html).toContain('min-height:0')
    // RF6: aspect-ratio fixo (miniatura) REMOVIDO
    expect(html).not.toContain('aspect-ratio:16/9')
  })

  it('escala o iframe por largura E altura (sem estourar o box)', () => {
    expect(html).toContain('Math.min(box.clientWidth/1280,box.clientHeight/720)')
  })

  it('controles ficam no rodapé, depois do preview', () => {
    const previewIdx = html.indexOf('class="preview"')
    const footerIdx = html.indexOf('<footer>')
    const navIdx = html.indexOf('slide:prev')
    expect(previewIdx).toBeGreaterThan(-1)
    expect(footerIdx).toBeGreaterThan(previewIdx)
    expect(navIdx).toBeGreaterThan(footerIdx)
  })
})

describe('SPEAKER_I18N — RF7 i18n completo', () => {
  it('tem exatamente pt-BR, en, es', () => {
    expect(Object.keys(SPEAKER_I18N).sort()).toEqual(['en', 'es', 'pt-BR'])
  })

  it('todos os idiomas têm as mesmas chaves', () => {
    const base = Object.keys(SPEAKER_I18N['pt-BR']).sort()
    for (const lang of ['en', 'es']) {
      expect(Object.keys(SPEAKER_I18N[lang]).sort()).toEqual(base)
    }
  })

  it('todo data-i18n do template existe no dicionário', () => {
    const used = [...html.matchAll(/data-i18n(?:-attr)?="[^:"]*(?::([a-zA-Z]+))?"/g)]
      .map((m) => m[1] ?? m[0].split('"')[1])
    expect(used.length).toBeGreaterThan(0)
    for (const key of used) {
      expect(SPEAKER_I18N['pt-BR'][key]).toBeTruthy()
    }
  })
})

describe('speakerPageHtml — design tokens (RF-tokens)', () => {
  it('cores do CSS vêm dos tokens do design system', () => {
    expect(html).toContain('--bg:#131313')
    expect(html).toContain('--primary:#E0895A')
    expect(html).toContain('--radius-sm:8px 0 8px 0')
  })

  it('não usa cores hardcoded antigas (#111/#2867d8/#333)', () => {
    expect(html).not.toContain('#111')
    expect(html).not.toContain('#2867d8')
    expect(html).not.toContain('background:#333')
  })

  it('sem palcoPort no link, usa o WS ao lado da porta da própria página (nada fixo em 7080/7081)', () => {
    expect(html).toContain('String((Number(location.port)||47080)+1)')
    expect(html).toContain('http://192.168.x.x:47080/speaker')
    expect(html).not.toMatch(/\b708[01]\b/)
  })

  it('runtime troca idioma via ?lang= (pickLang no script)', () => {
    expect(html).toContain('pickLang')
    expect(html).toContain("q.get('lang')")
    expect(html).toContain('navigator.language')
  })
})


it('pregador usa a nova porta remota padrão sem alterar o HTTP da Transmissão', () => {
  expect(html).toContain("localStorage.getItem(storagePrefix+'remotePort')||'48080'")
  expect(html).toContain('47080/speaker?remotePort=48080')
})

// Executa o script real servido ao celular, incluindo os pushes incrementais.
describe('prévia dos slides vizinhos', () => {
  it('mostra anterior/próximo, mantém a galeria e limpa ao trocar a apresentação', async () => {
    const { JSDOM } = await import('jsdom')
    const dom = new JSDOM(html, { url: 'http://localhost:47080/speaker?token=TEST', runScripts: 'outside-only' })
    const sockets = []
    dom.window.WebSocket = class { constructor() { sockets.push(this) } close() {} }
    dom.window.eval(dom.window.document.querySelector('script').textContent)
    const push = slide => sockets[0].onmessage({ data: JSON.stringify({ type: 'state', slide }) })
    const image = id => dom.window.document.querySelector(id)
    const previews = ['data:image/jpeg;base64,AA==', 'data:image/jpeg;base64,BB==', 'data:image/jpeg;base64,CC==']
    push({ index: 1, total: 3, galleryKey: 'a', previews: previews.map(p => p.split(',')[1]) })
    expect(image('#currentImage').getAttribute('src')).toBe(previews[1])
    expect(image('#frame').style.display).toBe('none')
    expect(image('#previousImage').getAttribute('src')).toBe(previews[0])
    expect(image('#nextImage').getAttribute('src')).toBe(previews[2])
    push({ index: 0, total: 3, galleryKey: 'a' })
    expect(image('#currentImage').getAttribute('src')).toBe(previews[0])
    expect(image('#previousImage').hidden).toBe(true)
    expect(image('#previousImage').hasAttribute('src')).toBe(false)
    expect(image('#nextImage').getAttribute('src')).toBe(previews[1])
    push({ index: 2, total: 3, galleryKey: 'a' })
    expect(image('#currentImage').getAttribute('src')).toBe(previews[2])
    expect(image('#nextImage').hidden).toBe(true)
    push({ index: 0, total: 2, galleryKey: 'b' })
    expect(image('#previousImage').hidden).toBe(true)
    expect(image('#nextImage').hasAttribute('src')).toBe(false)
    expect(image('#currentImage').hidden).toBe(true)
    push({ index: 0, total: 1, preview: 'REVG' })
    expect(image('#currentImage').getAttribute('src')).toBe('data:image/jpeg;base64,REVG')
    push({ index: 0, total: 0 })
    expect(image('#currentImage').hidden).toBe(true)
    expect(image('#frame').style.display).toBe('')
    push({ kind: 'bible', index: 1, total: 3, text: 'No princípio', reference: 'João 1:2', previousText: 'Anterior', nextText: 'Próximo', previousReference: 'João 1:1', nextReference: 'João 1:3' })
    expect(image('#biblePreview').hidden).toBe(false)
    expect(image('#bibleText').textContent).toBe('No princípio')
    expect(image('#bibleReference').textContent).toBe('João 1:2')
    expect(image('#previousImage').previousElementSibling.textContent).toBe('João 1:1Anterior')
    expect(image('#nextImage').previousElementSibling.textContent).toBe('João 1:3Próximo')
    expect(image('#previousImage').previousElementSibling.querySelector('.verse-reference').textContent).toBe('João 1:1')
    push({ index: 3, total: 39, canNavigate: false })
    expect(image('#prev').disabled).toBe(true)
    expect(image('#next').disabled).toBe(true)
    push({ index: 0, total: 3, canNavigate: false, lyrics: ['Estrofe atual', 'Próxima estrofe\nSegunda linha', 'Estrofe final'] })
    expect(image('#nextImage').previousElementSibling.textContent).toBe('Próxima estrofe\nSegunda linha')
    expect(image('.neighbors').classList.contains('music-neighbors')).toBe(true)
    expect(image('#prev').disabled).toBe(true)
    expect(image('#next').disabled).toBe(true)
    push({ index: 1, total: 3, canNavigate: false, lyrics: ['Estrofe atual', 'Próxima estrofe', 'Estrofe final'] })
    expect(image('#nextImage').previousElementSibling.textContent).toBe('Estrofe final')
    push({ index: 2, total: 3, canNavigate: false, lyrics: ['Estrofe atual', 'Próxima estrofe', 'Estrofe final'] })
    expect(image('#nextImage').previousElementSibling.textContent).toBe('No slide')
    push({ index: 0, total: 2, canNavigate: true })
    expect(image('.neighbors').classList.contains('music-neighbors')).toBe(false)
    expect(image('#prev').disabled).toBe(false)
    expect(image('#next').disabled).toBe(false)
    push({ index: 0, total: 0 })
    expect(image('#biblePreview').hidden).toBe(true)
    dom.window.close()
  })
})


describe('cronômetro do pregador', () => {
  it('inicia, pausa, retoma e restaura o tempo ao recarregar', async () => {
    const { JSDOM } = await import('jsdom')
    let now = 100000
    const open = saved => {
      const dom = new JSDOM(html, { url: 'http://localhost/speaker?lang=pt-BR', runScripts: 'outside-only' })
      dom.window.Date.now = () => now
      dom.window.setInterval = () => 0
      if (saved) dom.window.localStorage.setItem('speaker.stopwatch', saved)
      dom.window.eval(dom.window.document.querySelector('script').textContent)
      return dom
    }
    let dom = open()
    const click = id => dom.window.document.getElementById(id).click()
    const time = () => dom.window.document.getElementById('stopwatchTime').textContent
    click('stopwatchToggle')
    now += 65000
    dom.window.eval('renderStopwatch()')
    expect(time()).toBe('01:05')
    const saved = dom.window.localStorage.getItem('speaker.stopwatch')
    dom.window.close()
    now += 5000
    dom = open(saved)
    expect(time()).toBe('01:10')
    click('stopwatchToggle')
    now += 30000
    dom.window.eval('renderStopwatch()')
    expect(time()).toBe('01:10')
    click('stopwatchToggle')
    now += 3000
    dom.window.eval('renderStopwatch()')
    expect(time()).toBe('01:13')
    click('stopwatchReset')
    expect(time()).toBe('00:00')
    expect(dom.window.document.getElementById('stopwatchToggle').textContent).toBe('Iniciar')
    dom.window.close()
  })
})

it('regência apenas visualiza, mantém as setas bloqueadas e separa seu pareamento', async () => {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(html, { url: 'http://localhost/speaker?mode=view&token=VIEW', runScripts: 'outside-only' })
  const sockets = []
  dom.window.WebSocket = class { constructor() { sockets.push(this) } close() {} send() {} }
  dom.window.eval(dom.window.document.querySelector('script').textContent)
  sockets[0].onmessage({ data: JSON.stringify({ type: 'state', slide: { index: 0, total: 2, canNavigate: true } }) })
  const doc = dom.window.document
  expect(doc.querySelector('nav').hidden).toBe(true)
  expect(doc.querySelector('.stopwatch').hidden).toBe(true)
  expect(doc.querySelector('#prev').disabled).toBe(true)
  expect(doc.querySelector('#next').disabled).toBe(true)
  expect(dom.window.localStorage.getItem('support.viewer.token')).toBe('VIEW')
  expect(dom.window.localStorage.getItem('speaker.token')).toBeNull()
  dom.window.close()
})

it.each(['remote_busy', 'speaker_disconnected'])('aviso %s bloqueia a página e não reconecta sozinho', async code => {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(html, { url: 'http://localhost/speaker?token=TEST&lang=pt-BR', runScripts: 'outside-only' })
  const sockets = [], timers = []
  dom.window.WebSocket = class { constructor() { sockets.push(this) } close() {} }
  dom.window.setTimeout = fn => { timers.push(fn); return 0 }
  dom.window.eval(dom.window.document.querySelector('script').textContent)
  sockets[0].onmessage({ data: JSON.stringify({ type: 'error', code }) })
  sockets[0].onclose()
  expect(dom.window.document.getElementById('connectionError').hidden).toBe(false)
  expect(dom.window.document.getElementById('connectionError').textContent).toContain(code === 'remote_busy' ? 'Já existe uma conexão interativa ativa' : 'A conexão foi encerrada pelo desktop')
  expect(dom.window.document.getElementById('next').disabled).toBe(true)
  expect(timers).toHaveLength(0)
  dom.window.close()
})

it('inatividade apaga conteúdo antigo e mostra o fundo preto com logo, nos dois modos', async () => {
  const { JSDOM } = await import('jsdom')
  for (const mode of ['', '&mode=view']) {
    const dom = new JSDOM(html, { url: 'http://localhost/speaker?token=TEST'+mode, runScripts: 'outside-only' })
    const sockets = []
    dom.window.WebSocket = class { constructor() { sockets.push(this) } close() {} }
    dom.window.eval(dom.window.document.querySelector('script').textContent)
    const push = (supportActive, slide) => sockets[0].onmessage({ data: JSON.stringify({ type: 'state', supportActive, slide }) })
    push(true, { index: 0, total: 2, preview: 'QUJD', canNavigate: true })
    expect(dom.window.document.querySelector('#supportIdle').hidden).toBe(true)
    push(false, { index: 0, total: 2, preview: 'QUJD', lyrics: ['Antiga', 'Próxima antiga'], canNavigate: true })
    expect(dom.window.document.querySelector('#supportIdle').hidden).toBe(false)
    expect(dom.window.document.querySelector('#currentImage').hasAttribute('src')).toBe(false)
    expect(dom.window.document.querySelector('#next').disabled).toBe(true)
    expect(dom.window.document.querySelector('#frame').style.display).toBe('none')
    push(true, { kind: 'bible', index: 0, total: 3, text: 'Versículo atual', canNavigate: true })
    expect(dom.window.document.querySelector('#supportIdle').hidden).toBe(true)
    expect(dom.window.document.querySelector('#bibleText').textContent).toBe('Versículo atual')
    dom.window.close()
  }
})
