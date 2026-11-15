/** PDF/PPT na Liturgia: zoom pelos botões da barra (a roda do mouse fica no
 * popup), e as TVs do palco recebem de novo o recorte quando o zoom assenta. */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BAR_PATH = resolve(__dirname, '../../player/pdf-control-bar.html')
const ZOOM_PAN_PATH = resolve(__dirname, '../../player/zoom-pan.js')

type View = { zoom: number; x: number; y: number }

let dom: JSDOM | null = null
afterEach(() => {
  dom?.window.close()
  dom = null
})

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadBar(options: { setResult?: View | null } = {}) {
  const html = readFileSync(BAR_PATH, 'utf-8')
  dom = new JSDOM(html, { url: 'file:///pdf-control-bar.html', runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window as unknown as Window & { eval: (code: string) => void }
  const state = {
    view: { zoom: 1, x: 0, y: 0 } as View,
    calls: [] as View[],
    captures: [] as Array<{ full?: boolean } | undefined>,
    sent: [] as Array<Record<string, unknown>>,
    onView: null as ((view: View & { anim?: number }) => void) | null,
  }
  Object.defineProperty(w, 'louvorja', {
    value: {
      palco: {
        slots: async () => [{ id: '0', label: 'Principal', clients: 1 }],
        send: async (msg: Record<string, unknown>) => { state.sent.push(msg) },
        onReceiverConnected: () => () => {},
      },
      projection: {
        // inteira (TVs novas) = 'SU5U'; recorte com zoom (TVs antigas) = 'UkVD'
        captureSourceFrame: async (opts?: { full?: boolean }) => { state.captures.push(opts); return opts?.full ? 'SU5U' : 'UkVD' },
        onImageView: (cb: (view: View & { anim?: number }) => void) => { state.onView = cb; return () => {} },
        getPptSlideState: async () => ({ index: 0, total: 3, projecting: false, view: state.view }),
        getPlaybackState: async () => ({ projecting: false }),
        getVideoTargetMonitors: async () => [],
        toggleVideoScreens: async () => {},
        setImageView: async (v: View) => {
          state.calls.push(v)
          return options.setResult === undefined ? v : options.setResult
        },
      },
      displays: { list: async () => [{ id: 1, isPrimary: true }], identify: async () => {} },
    },
    configurable: true,
  })
  for (const el of dom.window.document.querySelectorAll('script')) {
    const src = el.getAttribute('src')
    // scripts da pasta do player (zoom para as TVs); os do palco ficam de fora
    if (src && !src.startsWith('..')) w.eval(readFileSync(resolve(dirname(BAR_PATH), src), 'utf-8'))
    else if (!src && (el.textContent ?? '').trim()) w.eval(el.textContent ?? '')
  }
  const doc = dom.window.document
  return {
    w,
    doc,
    state,
    zoomIn: doc.getElementById('zoomIn') as HTMLButtonElement,
    zoomOut: doc.getElementById('zoomOut') as HTMLButtonElement,
    reset: doc.getElementById('zoomReset') as HTMLButtonElement,
    project: doc.getElementById('project') as HTMLButtonElement,
  }
}

describe('pdf-control-bar: zoom', () => {
  it('botões: + aumenta pelo centro, − diminui, % volta à página inteira', async () => {
    const bar = loadBar()
    expect(bar.reset.textContent).toBe('100%')
    expect(bar.zoomOut.disabled).toBe(true)
    expect(bar.reset.disabled).toBe(true)

    bar.zoomIn.click()
    expect(bar.reset.textContent).toBe('125%')
    await wait(10)
    expect(bar.state.calls[0]).toEqual({ zoom: 1.25, x: 0, y: 0, anim: 180 })
    bar.zoomIn.click()
    await wait(10)
    expect(bar.state.calls[1]).toEqual({ zoom: 1.5625, x: 0, y: 0, anim: 180 })
    bar.zoomOut.click()
    await wait(10)
    expect(bar.state.calls[2]).toEqual({ zoom: 1.25, x: 0, y: 0, anim: 180 })
    bar.reset.click()
    await wait(10)
    expect(bar.state.calls[3]).toEqual({ zoom: 1, x: 0, y: 0, anim: 180 })
    expect(bar.reset.disabled).toBe(true)
  })

  it('acompanha o zoom feito pelo mouse; no máximo desliga o +', async () => {
    const bar = loadBar({ setResult: null })
    bar.state.view = { zoom: 5, x: 0.4, y: 0 }
    await wait(600)
    expect(bar.reset.textContent).toBe('500%')
    expect(bar.zoomIn.disabled).toBe(true)
    // sem resposta do main fica o valor mostrado
    bar.zoomOut.click()
    await wait(10)
    expect(bar.state.calls[0]).toEqual({ zoom: 4, x: 0.32000000000000006, y: 0, anim: 180 })
    expect(bar.reset.textContent).toBe('400%')
  })

  it('projetando: página inteira com o zoom; zoom vai na hora e o recorte só para TVs antigas ao parar', async () => {
    const bar = loadBar()
    bar.state.view = { zoom: 1.5, x: 0.1, y: 0 }
    await wait(30)
    bar.project.click()
    await wait(300)
    // página inteira (TVs novas aplicam o zoom que vai junto)
    const frame = bar.state.sent.find((m) => m.type === 'projection')!
    expect(frame).toMatchObject({ frameSlide: true, background: 'data:image/png;base64,SU5U', view: { zoom: 1.5, x: 0.1, y: 0 } })
    expect(bar.state.captures[0]).toEqual({ full: true })
    // havia zoom: TVs antigas recebem o recorte depois de assentar
    // (o início da projeção pode mandar a página inteira mais de uma vez)
    await wait(1200)
    const legacy = bar.state.sent.filter((m) => m.legacyOnly === true)
    expect(legacy.length).toBeGreaterThan(0)
    expect(legacy[0]).toMatchObject({ type: 'projection', frameSlide: true, background: 'data:image/png;base64,UkVD' })

    // roda do mouse: mensagens leves na hora (até ~30/s), sem recapturar a página
    const before = bar.state.sent.length
    const captures = bar.state.captures.length
    bar.state.onView!({ zoom: 2, x: 0.2, y: 0, anim: 140 })
    expect(bar.state.sent.at(-1)).toEqual({ v: 2, type: 'frameView', view: { zoom: 2, x: 0.2, y: 0, anim: 140 } })
    bar.state.onView!({ zoom: 2.2, x: 0.2, y: 0, anim: 0 })
    bar.state.onView!({ zoom: 2.4, x: 0.25, y: 0, anim: 0 })
    expect(bar.state.sent.length).toBe(before + 1)
    await wait(60)
    // o último degrau sai depois do intervalo, com animação mínima para a rede
    expect(bar.state.sent.at(-1)).toEqual({ v: 2, type: 'frameView', view: { zoom: 2.4, x: 0.25, y: 0, anim: 90 } })
    expect(bar.state.sent.length).toBe(before + 2)
    expect(bar.state.captures.length).toBe(captures)

    // parou: um recorte novo para as antigas
    const legacyBefore = bar.state.sent.filter((m) => m.legacyOnly === true).length
    await wait(600)
    expect(bar.state.sent.filter((m) => m.legacyOnly === true)).toHaveLength(legacyBefore + 1)
    // parar de projetar: zoom não sai mais
    bar.project.click()
    await wait(50)
    const after = bar.state.sent.length
    bar.state.onView!({ zoom: 3, x: 0, y: 0 })
    await wait(600)
    expect(bar.state.sent.length).toBe(after)
  }, 10_000)

  it('sem a ponte do app os botões não quebram', async () => {
    const bar = loadBar()
    ;(bar.w as unknown as { louvorja: { projection: Record<string, unknown> } }).louvorja.projection.setImageView = undefined
    bar.zoomIn.click()
    await wait(10)
    expect(bar.reset.textContent).toBe('100%')
  })
})

describe('zoom-pan: parte visível do conteúdo', () => {
  function load() {
    dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true })
    const w = dom.window as unknown as Window & { eval: (code: string) => void; PianoZoomPan: { visibleRegion: (v: unknown, s: Record<string, number>) => Record<string, number> } }
    w.eval(readFileSync(ZOOM_PAN_PATH, 'utf-8'))
    return w.PianoZoomPan
  }

  it('sem zoom: o conteúdo inteiro; com zoom: o recorte do centro ou deslocado', () => {
    const zp = load()
    const size = { stageWidth: 1000, stageHeight: 500, contentWidth: 800, contentHeight: 500 }
    expect(zp.visibleRegion({ zoom: 1, x: 0, y: 0 }, size)).toEqual({ left: 0, right: 800, top: 0, bottom: 500 })
    expect(zp.visibleRegion({ zoom: 2, x: 0, y: 0 }, size)).toEqual({ left: 150, right: 650, top: 125, bottom: 375 })
    // deslocado para a direita (x>0) mostra mais da esquerda do conteúdo
    expect(zp.visibleRegion({ zoom: 2, x: 0.5, y: 0 }, size)).toEqual({ left: 0, right: 400, top: 125, bottom: 375 })
  })
})
