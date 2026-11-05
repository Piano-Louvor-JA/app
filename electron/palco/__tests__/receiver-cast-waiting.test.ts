import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'

type ReceiverWindow = JSDOM['window'] & { handle: (message: unknown) => void }

const opened: JSDOM[] = []
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()))

function receiver(pathname: string, { lang = 'pt-BR', query = '' } = {}) {
  const dom = new JSDOM(readFileSync(resolve('electron/palco/receiver.html'), 'utf8'), {
    url: `http://192.168.1.20:47080${pathname}?token=91KCV&lang=${lang}${query}`,
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  })
  opened.push(dom)
  const w = dom.window as ReceiverWindow
  Object.assign(w, {
    fetch: () => new Promise<Response>(() => {}), setTimeout: () => 0, setInterval: () => 0, requestAnimationFrame: () => 0,
    WebSocket: class { close() {} send() {} },
  })
  for (const script of w.document.querySelectorAll('script')) {
    const code = script.getAttribute('src') === 'purify.min.js'
      ? readFileSync(resolve('electron/palco/purify.min.js'), 'utf8') : script.getAttribute('src') === 'network-mirror.js'
        ? readFileSync(resolve('electron/palco/network-mirror.js'), 'utf8') : script.textContent
    if (code?.trim()) w.eval(code)
  }
  const waiting = () => w.document.getElementById('castWaiting') as HTMLElement
  const visible = () => !waiting().hidden && w.getComputedStyle(waiting()).display !== 'none'
  return { w, waiting, visible }
}

const PROJECTION = { v: 2, type: 'projection', scope: 'bible', text: 'No princípio criou Deus os céus e a terra', footerRef: 'Gênesis 1:1' }
const VERSE = {
  v: 1, type: 'stageReturn', active: true, current: 'Santo, santo, santo', next: 'Cedo de manhã',
  isCover: false, nextIsCover: false, slideIndex: 1, progress: 0.2, style: {},
}

describe('tela de espera das conexões de transmissão', () => {
  it('sem transmissão, mostra fundo preto, o logo do Louvor JA e "Aguardando transmissão"', () => {
    for (const path of ['/espelho', '/retorno', '/']) {
      const { w, waiting, visible } = receiver(path)
      expect(visible()).toBe(true)
      expect(w.getComputedStyle(waiting()).backgroundColor).toBe('rgb(0, 0, 0)')
      expect(waiting().querySelector('.cast-waiting__logo svg[viewBox="0 0 565 594"]')).toBeTruthy()
      expect(waiting().querySelector('[aria-label="codename PIANO"]')).toBeNull()
      expect(waiting().querySelector('.cast-waiting__text')!.textContent).toBe('Aguardando transmissão')
    }
  })

  it('o logo aparece e apaga suavemente, sem animar para quem pede menos movimento', () => {
    const html = readFileSync(resolve('electron/palco/receiver.html'), 'utf8')
    expect(html).toMatch(/\.cast-waiting__logo\{[^}]*animation:castWaitingFade [\d.]+s ease-in-out infinite/)
    expect(html).toMatch(/\.cast-waiting__logo\{[^}]*height:min\(1[0-2]vh,/)
    expect(html).toMatch(/@keyframes castWaitingFade\{0%,100%\{opacity:\.[2-5]\d*\}50%\{opacity:1\}\}/)
    expect(html).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^@]*\.cast-waiting__logo\{animation:none/)
  })

  it('o clone do logo não duplica ids da página', () => {
    const { w } = receiver('/espelho')
    expect(w.document.querySelectorAll('#castWaiting [id]')).toHaveLength(0)
  })

  it('traduz a frase conforme o idioma da conexão', () => {
    expect(receiver('/espelho', { lang: 'en' }).waiting().textContent).toContain('Waiting for broadcast')
    expect(receiver('/espelho', { lang: 'es' }).waiting().textContent).toContain('Esperando transmisión')
  })

  it('some quando chega conteúdo e volta quando a transmissão fica ociosa', () => {
    const { w, visible } = receiver('/espelho')
    w.handle(PROJECTION)
    expect(visible()).toBe(false)
    w.handle({ v: 2, type: 'idle' })
    expect(visible()).toBe(true)
    w.handle({ v: 2, type: 'timer', duration: 60 })
    expect(visible()).toBe(false)
    w.handle({ v: 2, type: 'stop-all' })
    w.handle({ v: 2, type: 'idle' })
    expect(visible()).toBe(true)
  })

  it('ao encerrar o servidor, troca a tela preta pela espera', () => {
    const { w, visible } = receiver('/espelho')
    w.handle(PROJECTION)
    w.handle({ v: 2, type: 'obsControl', action: 'stop' })
    expect(visible()).toBe(true)
    const stopped = w.document.getElementById('obsStoppedView')
    if (stopped) expect(Number(w.getComputedStyle(w.document.getElementById('castWaiting')!).zIndex)).toBeGreaterThan(Number(stopped.style.zIndex))
  })

  it('no retorno, a letra da música cobre a espera', () => {
    const { w, visible } = receiver('/retorno')
    w.handle(VERSE)
    expect(visible()).toBe(false)
    w.handle({ ...VERSE, active: false })
    expect(visible()).toBe(true)
  })

  it('não aparece dentro dos painéis da projeção compartilhada', () => {
    expect(receiver('/espelho', { query: '&obsPane=1' }).visible()).toBe(false)
  })

  it('com a projeção compartilhada mostrando conteúdo, a espera fica escondida', () => {
    const { w, visible } = receiver('/espelho')
    w.handle({ v: 2, type: 'obsShare', enabled: true })
    w.handle(PROJECTION)
    expect(visible()).toBe(false)
    w.handle({ v: 2, type: 'idle' })
    expect(visible()).toBe(true)
  })
})
