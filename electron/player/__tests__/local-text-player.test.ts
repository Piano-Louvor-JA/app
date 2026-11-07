/** Player de texto (avisos): desenha título e texto com as cores do Palco,
 * limpa o HTML (a janela tem a ponte do app), ajusta o tamanho e se
 * apresenta ao processo principal como uma galeria de um slide. */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLAYER_PATH = resolve(__dirname, '../../player/local-text-player.html')
const BAR_PATH = resolve(__dirname, '../../player/image-control-bar.html')

let dom: JSDOM | null = null

type TextWindow = Window & {
  eval: (code: string) => void
  __textSlide: { getState: () => { scale: number }; setScale: (n: unknown) => { scale: number } }
  __liturgyGallery: { getState: () => unknown; next: () => unknown; prev: () => unknown; goTo: (i: number) => unknown }
}

function loadPlayer(data: unknown): { w: TextWindow; doc: Document } {
  const html = readFileSync(PLAYER_PATH, 'utf-8')
  const query = typeof data === 'string' ? data : encodeURIComponent(JSON.stringify(data))
  dom = new JSDOM(html, { url: `http://localhost/local-text-player.html?data=${query}`, runScripts: 'outside-only' })
  const w = dom.window as unknown as TextWindow
  for (const el of dom.window.document.querySelectorAll('script')) w.eval(el.textContent ?? '')
  return { w, doc: dom.window.document }
}

afterEach(() => {
  dom?.window.close()
  dom = null
})

describe('local-text-player', () => {
  it('mostra título e texto com as cores recebidas', () => {
    const { doc } = loadPlayer({ title: ' Batismo ', html: '<p>Sábado às <b>9h</b></p>', titleColor: '#fff000', textColor: '#eeeeee', backgroundColor: '#111111' })
    expect(doc.getElementById('title')!.textContent).toBe('Batismo')
    expect(doc.getElementById('text')!.innerHTML).toBe('<p>Sábado às <b>9h</b></p>')
    const style = doc.documentElement.style
    expect(style.getPropertyValue('--title')).toBe('#fff000')
    expect(style.getPropertyValue('--text')).toBe('#eeeeee')
    expect(style.getPropertyValue('--bg')).toBe('#111111')
    expect(doc.title).toBe('Texto — Batismo')
  })

  it('limpa o HTML: tira script, eventos, links e estilos perigosos; mantém cor', () => {
    const { doc } = loadPlayer({
      title: 'x',
      html: '<p onclick="alert(1)" style="color:#ff0000;position:fixed">a<script>alert(2)</script><img src=x onerror="alert(3)"><a href="javascript:alert(4)">link</a><span style="color:url(x)">b</span></p><iframe src="x"></iframe>',
    })
    const text = doc.getElementById('text')!
    expect(text.querySelector('script, img, a, iframe, [onclick], [onerror]')).toBeNull()
    expect(text.textContent).toBe('alinkb')
    expect(text.querySelector('p')!.getAttribute('style')).toMatch(/^color:(#ff0000|rgb\(255, 0, 0\))$/)
    expect(text.querySelector('span')!.hasAttribute('style')).toBe(false)
  })

  it('cores inválidas ou dados quebrados caem no padrão', () => {
    const { doc } = loadPlayer({ title: 'x', html: '', titleColor: 'red;background:url(x)', textColor: 3 })
    expect(doc.documentElement.style.getPropertyValue('--title')).toBe('#fb8c00')
    expect(doc.documentElement.style.getPropertyValue('--text')).toBe('#ffffff')
    const broken = loadPlayer('%7Bquebrado')
    expect(broken.doc.getElementById('title')!.textContent).toBe('')
    expect(broken.doc.title).toBe('Texto — LouvorJA - PIANO')
  })

  it('texto longo começa menor', () => {
    const short = loadPlayer({ title: 'x', html: '<p>curto</p>' }).doc.documentElement.style.getPropertyValue('--text-size')
    const long = loadPlayer({ title: 'x', html: `<p>${'palavra '.repeat(120)}</p>` }).doc.documentElement.style.getPropertyValue('--text-size')
    expect(parseFloat(long)).toBeLessThan(parseFloat(short))
  })

  it('tamanho (A−/A+) limitado entre 50% e 200%; galeria de um slide', () => {
    const { w, doc } = loadPlayer({ title: 'x', html: '' })
    expect(w.__textSlide.getState()).toEqual({ scale: 1 })
    expect(w.__textSlide.setScale(1.24)).toEqual({ scale: 1.2 })
    expect(doc.documentElement.style.getPropertyValue('--scale')).toBe('1.2')
    expect(w.__textSlide.setScale(9)).toEqual({ scale: 2 })
    expect(w.__textSlide.setScale(0.1)).toEqual({ scale: 0.5 })
    expect(w.__textSlide.setScale('x')).toEqual({ scale: 1 })
    for (const result of [w.__liturgyGallery.getState(), w.__liturgyGallery.next(), w.__liturgyGallery.prev(), w.__liturgyGallery.goTo(3)]) {
      expect(result).toEqual({ index: 0, total: 1 })
    }
  })
})

describe('image-control-bar em modo texto', () => {
  function wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  function loadBar(kind: string, initialScale = 1) {
    const html = readFileSync(BAR_PATH, 'utf-8')
    dom = new JSDOM(html, { url: `http://localhost/image-control-bar.html${kind}`, runScripts: 'outside-only', pretendToBeVisual: true })
    const w = dom.window as unknown as TextWindow
    const calls: number[] = []
    let scale = initialScale
    Object.defineProperty(w, 'louvorja', {
      configurable: true,
      value: {
        palco: { slots: async () => [], onEvent: () => () => {}, send: async () => true },
        projection: {
          getImageSlideState: async () => ({ index: 0, total: 1, projecting: false }),
          getVideoTargetMonitors: async () => [],
          getTextScale: async () => ({ scale }),
          setTextScale: async (next: number) => {
            calls.push(next)
            scale = Math.min(2, Math.max(0.5, next))
            return { scale }
          },
        },
        displays: { list: async () => [], identify: async () => {} },
      },
    })
    for (const el of dom.window.document.querySelectorAll('script')) {
      if (!el.getAttribute('src')) w.eval(el.textContent ?? '')
    }
    return { doc: dom.window.document, calls, setScale: (n: number) => { scale = n } }
  }

  it('esconde setas, automático e contador; A−/A+ mudam o tamanho', async () => {
    const bar = loadBar('?kind=text')
    await wait(30)
    expect(bar.doc.body.classList.contains('is-text')).toBe(true)
    expect(bar.doc.getElementById('textScale')!.textContent).toBe('100%')
    ;(bar.doc.getElementById('textBigger') as HTMLButtonElement).click()
    await wait(20)
    expect(bar.calls).toEqual([1.1])
    expect(bar.doc.getElementById('textScale')!.textContent).toBe('110%')
    ;(bar.doc.getElementById('textSmaller') as HTMLButtonElement).click()
    ;(bar.doc.getElementById('textSmaller') as HTMLButtonElement).click()
    await wait(20)
    expect(bar.doc.getElementById('textScale')!.textContent).toBe('90%')
  })

  it('limites desabilitam o botão', async () => {
    const bar = loadBar('?kind=text', 2)
    await wait(30)
    expect(bar.doc.getElementById('textScale')!.textContent).toBe('200%')
    expect((bar.doc.getElementById('textBigger') as HTMLButtonElement).disabled).toBe(true)
    bar.setScale(0.5)
    for (let i = 0; i < 15; i++) (bar.doc.getElementById('textSmaller') as HTMLButtonElement).click()
    await wait(30)
    expect(bar.doc.getElementById('textScale')!.textContent).toBe('50%')
    expect((bar.doc.getElementById('textSmaller') as HTMLButtonElement).disabled).toBe(true)
  })

  it('galeria de imagens continua sem os controles de texto', async () => {
    const bar = loadBar('')
    await wait(30)
    expect(bar.doc.body.classList.contains('is-text')).toBe(false)
  })
})
