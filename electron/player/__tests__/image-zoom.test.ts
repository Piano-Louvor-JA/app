/** Galeria de imagens (Liturgia): zoom pela roda do mouse, arrastar para mover,
 * duplo clique volta à imagem inteira, e os botões da barra fazem o mesmo. */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLAYER_PATH = resolve(__dirname, '../../player/local-image-player.html')
const BAR_PATH = resolve(__dirname, '../../player/image-control-bar.html')

type View = { zoom: number; x: number; y: number }
type Gallery = {
  getState: () => { index: number; total: number; view: View }
  getView: () => View
  setView: (v: unknown) => View
  next: () => unknown
  goTo: (i: number) => unknown
}

let dom: JSDOM | null = null

afterEach(() => {
  dom?.window.close()
  dom = null
})

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadPlayer(srcs = ['local://app/a.jpg', 'local://app/b.jpg']) {
  const html = readFileSync(PLAYER_PATH, 'utf-8')
  const query = encodeURIComponent(JSON.stringify(srcs))
  dom = new JSDOM(html, { url: `http://localhost/local-image-player.html?srcs=${query}`, runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window as unknown as Window & { eval: (code: string) => void; __liturgyGallery: Gallery }
  const reports: View[] = []
  Object.defineProperty(w, 'louvorja', {
    value: { projection: { reportImageView: (v: View) => reports.push(v) } },
    configurable: true,
  })
  const doc = dom.window.document
  const stage = doc.getElementById('stage')!
  // tela 1000×500 a partir do canto (jsdom não calcula layout)
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  stage.setPointerCapture = () => {}
  for (const el of doc.querySelectorAll('script')) {
    const src = el.getAttribute('src')
    w.eval(src ? readFileSync(resolve(dirname(PLAYER_PATH), src), 'utf-8') : el.textContent ?? '')
  }
  const frame = doc.getElementById('frame') as HTMLImageElement
  const fire = (type: string, init: Record<string, unknown>) => {
    const Ctor = type === 'wheel' ? dom!.window.WheelEvent : dom!.window.MouseEvent
    const event = new Ctor(type, { bubbles: true, cancelable: true, ...init })
    for (const [key, value] of Object.entries(init)) {
      if (!(key in event)) Object.defineProperty(event, key, { value })
    }
    stage.dispatchEvent(event)
    return event
  }
  return { w, doc, gallery: w.__liturgyGallery, frame, fire, reports }
}

describe('local-image-player: zoom', () => {
  it('começa inteira e limita zoom (1×–5×) e deslocamento à área com zoom', () => {
    const { gallery, frame, doc } = loadPlayer()
    expect(gallery.getState()).toEqual({ index: 0, total: 2, view: { zoom: 1, x: 0, y: 0 } })
    expect(frame.style.transform).toBe('')

    expect(gallery.setView({ zoom: 9, x: 9, y: -9 })).toEqual({ zoom: 5, x: 2, y: -2 })
    // deslocamento em fração da tela (1000×500) → px
    expect(frame.style.transform).toBe('translate(2000px, -1000px) scale(5)')
    expect(doc.body.classList.contains('is-zoomed')).toBe(true)

    expect(gallery.setView({ zoom: 0.2, x: 0.3, y: 'x' })).toEqual({ zoom: 1, x: 0, y: 0 })
    expect(frame.style.transform).toBe('')
    expect(doc.body.classList.contains('is-zoomed')).toBe(false)
    expect(gallery.setView(null)).toEqual({ zoom: 1, x: 0, y: 0 })
  })

  it('roda do mouse aproxima no ponto do cursor e avisa o main uma vez por quadro', async () => {
    const { gallery, fire, reports } = loadPlayer()
    // cursor no canto direito inferior do meio: (750, 375) → fração (0.25, 0.25)
    const event = fire('wheel', { deltaY: -462.098, clientX: 750, clientY: 375 })
    expect(event.defaultPrevented).toBe(true)
    const view = gallery.getView()
    expect(view.zoom).toBeCloseTo(2, 2)
    // o ponto sob o cursor fica parado: x = c − z·c = 0.25 − 2·0.25
    expect(view.x).toBeCloseTo(-0.25, 3)
    expect(view.y).toBeCloseTo(-0.25, 3)
    fire('wheel', { deltaY: 100, clientX: 500, clientY: 250 })
    await wait(40)
    expect(reports).toHaveLength(1)
    // leva a animação da roda para as telas repetirem o mesmo movimento
    expect(reports[0]).toEqual({ ...gallery.getView(), anim: 140 })

    // afastar tudo volta ao normal
    fire('wheel', { deltaY: 5000, clientX: 500, clientY: 250 })
    expect(gallery.getView()).toEqual({ zoom: 1, x: 0, y: 0 })
  })

  it('arrastar move só com zoom; duplo clique volta à imagem inteira', async () => {
    const { gallery, fire, doc, reports } = loadPlayer()
    fire('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fire('pointermove', { pointerId: 1, clientX: 300, clientY: 100 })
    expect(gallery.getView()).toEqual({ zoom: 1, x: 0, y: 0 })

    gallery.setView({ zoom: 3, x: 0, y: 0 })
    fire('pointerdown', { button: 2, pointerId: 1, clientX: 100, clientY: 100 })
    fire('pointermove', { pointerId: 1, clientX: 300, clientY: 100 })
    expect(gallery.getView().x).toBe(0)

    fire('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    expect(doc.body.classList.contains('is-panning')).toBe(true)
    fire('pointermove', { pointerId: 2, clientX: 900, clientY: 100 })
    fire('pointermove', { pointerId: 1, clientX: 300, clientY: 150 })
    expect(gallery.getView()).toEqual({ zoom: 3, x: 0.2, y: 0.1 })
    fire('pointerup', { pointerId: 2 })
    expect(doc.body.classList.contains('is-panning')).toBe(true)
    fire('pointerup', { pointerId: 1 })
    expect(doc.body.classList.contains('is-panning')).toBe(false)
    fire('pointermove', { pointerId: 1, clientX: 900, clientY: 100 })
    expect(gallery.getView().x).toBe(0.2)
    fire('pointerdown', { button: 0, pointerId: 3, clientX: 0, clientY: 0 })
    fire('pointercancel', { pointerId: 3 })
    expect(doc.body.classList.contains('is-panning')).toBe(false)

    fire('dblclick', {})
    expect(gallery.getView()).toEqual({ zoom: 1, x: 0, y: 0 })
    await wait(40)
    expect(reports.at(-1)).toEqual({ zoom: 1, x: 0, y: 0, anim: 180 })
  })

  it('outra imagem começa inteira; reaplicar a mesma (sincronia das telas) mantém o zoom', () => {
    const { gallery, frame } = loadPlayer()
    gallery.setView({ zoom: 2, x: 0.1, y: 0 })
    gallery.goTo(0)
    expect(gallery.getView()).toEqual({ zoom: 2, x: 0.1, y: 0 })
    expect(frame.getAttribute('src')).toBe('local://app/a.jpg')
    gallery.next()
    expect(gallery.getView()).toEqual({ zoom: 1, x: 0, y: 0 })
    expect(frame.getAttribute('src')).toBe('local://app/b.jpg')
  })

  it('só mostra arquivos do próprio app: endereço externo ou script vindo da URL é ignorado', () => {
    const { gallery, frame } = loadPlayer(['javascript:alert(1)', 'https://site.exemplo/x.jpg', 'local://outro/a.jpg', 'local://app/ok.jpg'])
    expect(gallery.getState().total).toBe(1)
    expect(frame.getAttribute('src')).toBe('local://app/ok.jpg')
  })

  it('sem imagens: roda do mouse não faz nada; sem a ponte do app não quebra', async () => {
    const empty = loadPlayer([])
    empty.fire('wheel', { deltaY: -500, clientX: 500, clientY: 250 })
    expect(empty.gallery.getView()).toEqual({ zoom: 1, x: 0, y: 0 })
    dom!.window.close()

    const { w, fire, gallery } = loadPlayer()
    Object.defineProperty(w, 'louvorja', { value: undefined, configurable: true })
    fire('wheel', { deltaY: -500, clientX: 500, clientY: 250 })
    await wait(40)
    expect(gallery.getView().zoom).toBeGreaterThan(1)
  })
})

function loadBar(options: { view?: View; isText?: boolean; setResult?: View | null } = {}) {
  const html = readFileSync(BAR_PATH, 'utf-8')
  const url = `http://localhost/image-control-bar.html${options.isText ? '?kind=text' : ''}`
  dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window as unknown as Window & { eval: (code: string) => void }
  const state = { view: options.view as View | undefined, calls: [] as View[] }
  Object.defineProperty(w, 'louvorja', {
    value: {
      palco: { slots: async () => [], onEvent: () => () => {}, send: async () => true },
      projection: {
        getImageSlideState: async () => ({ index: 0, total: 1, projecting: false, ...(state.view ? { view: state.view } : {}) }),
        getPlaybackState: async () => ({ projecting: false }),
        getVideoTargetMonitors: async () => [],
        setImageView: async (v: View) => {
          state.calls.push(v)
          return options.setResult === undefined ? v : options.setResult
        },
        toggleVideoScreens: async () => {},
      },
      displays: { list: async () => [{ id: 1, isPrimary: true }], identify: async () => {} },
    },
    configurable: true,
  })
  for (const el of dom.window.document.querySelectorAll('script')) {
    const code = el.textContent ?? ''
    if (code.trim() && !el.getAttribute('src')) w.eval(code)
  }
  const doc = dom.window.document
  return {
    w,
    doc,
    state,
    zoomIn: doc.getElementById('zoomIn') as HTMLButtonElement,
    zoomOut: doc.getElementById('zoomOut') as HTMLButtonElement,
    reset: doc.getElementById('zoomReset') as HTMLButtonElement,
  }
}

describe('image-control-bar: zoom', () => {
  it('começa em 100% com "diminuir" e "inteira" desligados; + aumenta pelo centro', async () => {
    const bar = loadBar()
    expect(bar.reset.textContent).toBe('100%')
    expect(bar.zoomOut.disabled).toBe(true)
    expect(bar.reset.disabled).toBe(true)
    expect(bar.zoomIn.disabled).toBe(false)

    bar.zoomIn.click()
    expect(bar.reset.textContent).toBe('125%')
    await wait(10)
    expect(bar.state.calls[0]).toEqual({ zoom: 1.25, x: 0, y: 0, anim: 180 })
    expect(bar.zoomOut.disabled).toBe(false)
    expect(bar.reset.disabled).toBe(false)
  })

  it('acompanha o zoom feito pelo mouse e mantém o centro ao mudar pelos botões', async () => {
    const bar = loadBar({ view: { zoom: 2, x: 0.2, y: -0.1 } })
    await wait(30)
    expect(bar.reset.textContent).toBe('200%')
    bar.zoomOut.click()
    await wait(10)
    expect(bar.state.calls[0]).toEqual({ zoom: 1.6, x: 0.16000000000000003, y: -0.08000000000000002, anim: 180 })
    bar.reset.click()
    await wait(10)
    expect(bar.state.calls[1]).toEqual({ zoom: 1, x: 0, y: 0, anim: 180 })
  })

  it('no máximo desliga o +; sem resposta do main fica o valor mostrado', async () => {
    const bar = loadBar({ view: { zoom: 5, x: 0, y: 0 }, setResult: null })
    await wait(30)
    expect(bar.zoomIn.disabled).toBe(true)
    bar.zoomOut.click()
    await wait(10)
    expect(bar.reset.textContent).toBe('400%')
  })

  it('modo texto esconde o zoom (lá vale o A−/A+); sem a ponte os botões não quebram', async () => {
    const text = loadBar({ isText: true })
    expect(text.doc.body.classList.contains('is-text')).toBe(true)
    dom!.window.close()

    const bar = loadBar()
    ;(bar.w as unknown as { louvorja: { projection: Record<string, unknown> } }).louvorja.projection.setImageView = undefined
    bar.zoomIn.click()
    await wait(10)
    expect(bar.reset.textContent).toBe('100%')
  })
})


describe('image-control-bar: imagens nas TVs do palco e navegador', () => {
  async function loadFrameBar() {
    const html = readFileSync(BAR_PATH, 'utf-8')
    dom = new JSDOM(html, { url: 'http://localhost/image-control-bar.html', runScripts: 'outside-only', pretendToBeVisual: true })
    const w = dom.window as unknown as Window & { eval: (code: string) => void }
    const state = {
      index: 0,
      view: { zoom: 1.5, x: 0.1, y: 0 } as View,
      sent: [] as Array<{ msg: Record<string, unknown>; slotId: string }>,
      captures: [] as Array<{ crop?: boolean } | undefined>,
      onView: null as ((view: View & { anim?: number }) => void) | null,
      mirror: 0,
    }
    Object.defineProperty(w, 'PianoNetworkMirror', {
      value: { createSender: () => { state.mirror += 1; return { prepare: async () => {}, start: async () => {}, stop: async () => {}, remove: async () => {}, handle: async () => {} } } },
      configurable: true,
    })
    Object.defineProperty(w, 'louvorja', {
      value: {
        palco: {
          slots: async () => [{ id: 'tv', label: 'TV', clients: 1 }],
          onEvent: () => () => {},
          send: async (msg: Record<string, unknown>, slotId: string) => { state.sent.push({ msg, slotId }); return true },
        },
        projection: {
          getImageSlideState: async () => ({ index: state.index, total: 3, projecting: false, view: state.view }),
          getPlaybackState: async () => ({ projecting: false }),
          getVideoTargetMonitors: async () => [],
          toggleVideoScreens: async () => {},
          captureImageFrame: async (opts?: { crop?: boolean }) => {
            state.captures.push(opts)
            return { mime: 'image/jpeg', data: opts?.crop ? 'UkVD' : 'SU5U' + state.index }
          },
          onImageView: (cb: (view: View & { anim?: number }) => void) => { state.onView = cb; return () => {} },
        },
        displays: { list: async () => [{ id: 1, isPrimary: true }], identify: async () => {} },
      },
      configurable: true,
    })
    for (const el of dom.window.document.querySelectorAll('script')) {
      const src = el.getAttribute('src')
      if (src && !src.startsWith('..')) w.eval(readFileSync(resolve(dirname(BAR_PATH), src), 'utf-8'))
      else if (!src && (el.textContent ?? '').trim()) w.eval(el.textContent ?? '')
    }
    await wait(30)
    return { w, state, project: dom.window.document.getElementById('project') as HTMLButtonElement }
  }

  it('manda o arquivo inteiro com o zoom, o zoom na hora, a imagem nova e a espera ao parar', async () => {
    const bar = await loadFrameBar()
    bar.project.click()
    await vi.waitFor(() => expect(bar.state.sent.some(s => s.msg.type === 'projection')).toBe(true))
    // nada de transmissão por vídeo para imagens
    expect(bar.state.mirror).toBe(0)
    expect(bar.state.sent[0]).toEqual({
      slotId: 'tv',
      msg: { v: 2, type: 'projection', frameSlide: true, background: 'data:image/jpeg;base64,SU5U0', text: '', footerRef: '', view: { zoom: 1.5, x: 0.1, y: 0 } },
    })
    expect(bar.state.captures[0]).toBeUndefined()

    // havia zoom: o recorte para TVs antigas sai depois de assentar
    await vi.waitFor(() => expect(bar.state.sent.some(s => s.msg.legacyOnly === true)).toBe(true), { timeout: 1500 })
    expect(bar.state.captures).toContainEqual({ crop: true })

    // zoom pelo mouse: mensagem leve na hora
    bar.state.onView!({ zoom: 2, x: 0, y: 0.2, anim: 140 })
    expect(bar.state.sent.at(-1)).toEqual({ slotId: 'tv', msg: { v: 2, type: 'frameView', view: { zoom: 2, x: 0, y: 0.2, anim: 140 } } })

    // outra imagem: a nova vai inteira
    bar.state.index = 1
    bar.state.view = { zoom: 1, x: 0, y: 0 }
    await vi.waitFor(() => expect(bar.state.sent.some(s => s.msg.background === 'data:image/jpeg;base64,SU5U1')).toBe(true), { timeout: 1500 })

    // parar: as conexões vão para a espera e o zoom não sai mais
    bar.project.click()
    await vi.waitFor(() => expect(bar.state.sent.at(-1)).toEqual({ slotId: 'tv', msg: { v: 2, type: 'idle' } }))
    const count = bar.state.sent.length
    bar.state.onView!({ zoom: 3, x: 0, y: 0 })
    await wait(100)
    expect(bar.state.sent.length).toBe(count)
  }, 10_000)
})
