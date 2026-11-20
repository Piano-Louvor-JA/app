/**
 * Zoom do quadro (imagem/PDF/PPT) no receiver servido pelo desktop
 * (transmissões por navegador/OBS): o quadro chega com o zoom do operador e
 * as mensagens leves `frameView` mudam o zoom com animação, sem reenviar a
 * imagem. Outro conteúdo no fundo volta sem zoom.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECEIVER_PATH = resolve(__dirname, '../receiver.html')

type ReceiverWindow = Window & { handle: (m: unknown) => void }
let w: ReceiverWindow
let bg: HTMLImageElement

beforeAll(() => {
  const dom = new JSDOM(readFileSync(RECEIVER_PATH, 'utf-8'), {
    url: 'http://127.0.0.1:47080/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  w = dom.window as unknown as ReceiverWindow
  Object.defineProperty(w, 'WebSocket', { value: {} })
  Object.defineProperty(w, 'fetch', { configurable: true, value: () => Promise.reject(new Error('sem rede')) })
  w.localStorage.clear()
  for (const script of dom.window.document.querySelectorAll('script')) {
    const src = script.getAttribute('src')
    const code = src ? readFileSync(resolve(__dirname, '..', src), 'utf8') : script.textContent ?? ''
    try {
      dom.window.eval(code)
    } catch {
      /* boot pode tocar APIs ausentes no jsdom */
    }
  }
  bg = dom.window.document.getElementById('bg') as HTMLImageElement
})

/** O jsdom formata o transform com ou sem espaço após a vírgula, conforme a versão. */
const transform = () => bg.style.transform.replace(/,\s+/g, ',')

const FRAME = { v: 2, type: 'projection', frameSlide: true, background: 'data:image/png;base64,SU5U', text: '', footerRef: '' }

describe('receiver: zoom do quadro', () => {
  it('quadro chega com o zoom do operador; sem zoom fica sem transformação', () => {
    w.handle({ ...FRAME, view: { zoom: 2, x: 0.1, y: -0.05 } })
    expect(bg.classList.contains('frame-slide')).toBe(true)
    expect(transform()).toBe('translate(10%,-5%) scale(2)')
    w.handle({ ...FRAME, view: { zoom: 1, x: 0, y: 0 } })
    expect(transform()).toBe('')
    w.handle(FRAME)
    expect(transform()).toBe('')
  })

  it('frameView muda o zoom com animação e respeita os limites', () => {
    w.handle(FRAME)
    w.handle({ v: 2, type: 'frameView', view: { zoom: 3, x: -0.2, y: 0.3, anim: 140 } })
    expect(transform()).toBe('translate(-20%,30%) scale(3)')
    expect(bg.style.transition).toContain('transform 140ms')
    w.handle({ v: 2, type: 'frameView', view: { zoom: 99, x: 'x', y: 0, anim: 9999 } })
    expect(transform()).toBe('translate(0%,0%) scale(5)')
    expect(bg.style.transition).toContain('transform 400ms')
    w.handle({ v: 2, type: 'frameView', view: { zoom: 1, x: 0, y: 0 } })
    expect(transform()).toBe('')
  })

  it('fora de um quadro de slide, frameView não mexe no fundo; outro conteúdo zera o zoom', () => {
    w.handle({ ...FRAME, view: { zoom: 2, x: 0, y: 0 } })
    w.handle({ v: 2, type: 'idle' })
    expect(transform()).toBe('')
    w.handle({ v: 2, type: 'projection', scope: 'hymns', text: 'Santo, santo, santo', background: 'http://127.0.0.1:47080/media/capa.jpg' })
    expect(bg.classList.contains('frame-slide')).toBe(false)
    w.handle({ v: 2, type: 'frameView', view: { zoom: 2, x: 0, y: 0 } })
    expect(transform()).toBe('')
  })
})
