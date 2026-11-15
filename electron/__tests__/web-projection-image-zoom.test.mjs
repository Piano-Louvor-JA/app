// @vitest-environment node
/** Zoom na galeria de imagens: o popup do operador manda (botões ou mouse) e
 * as telas de projeção repetem o mesmo zoom; outras janelas não mandam. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ windows: [], barSends: [], crops: [], resizes: [] }))

function makeEmitter(target) {
  const listeners = new Map()
  target.on = (event, fn) => { (listeners.get(event) ?? listeners.set(event, []).get(event)).push(fn); return target }
  target.once = target.on
  target.emit = (event, ...args) => { for (const fn of listeners.get(event) ?? []) fn(...args) }
  return target
}

function proxied(target) {
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key]
      if (key === 'then') return undefined
      return () => undefined
    },
  })
}

/** Galeria falsa por janela: entende os scripts que o main manda. */
function fakeGallery(win) {
  win.view = { zoom: 1, x: 0, y: 0 }
  win.scripts = []
  return async (script) => {
    win.scripts.push(script)
    if (win.failScripts) throw new Error('carregando')
    const set = /setView\((\{.*?\})\)/.exec(script)
    if (set) {
      const v = JSON.parse(set[1])
      win.view = { zoom: Math.min(5, Math.max(1, v.zoom)), x: v.x, y: v.y }
      return { ...win.view }
    }
    if (script.includes('getView()')) return win.noView ? null : { ...win.view }
    if (script.includes('getCropRegion()')) return win.cropRegion ?? null
    if (script.includes('getState()')) return { index: 0, total: 2, view: { ...win.view } }
    if (script.includes('goTo(')) return { index: 0, total: 2 }
    return null
  }
}

vi.mock('electron', () => {
  class BrowserWindow {
    constructor(options = {}) {
      const win = makeEmitter({
        options,
        destroyed: false,
        url: '',
        css: [],
        isDestroyed: () => win.destroyed,
        close: () => { if (win.destroyed) return; win.destroyed = true; win.emit('closed') },
        getContentSize: () => [1280, 720],
        getBounds: () => ({ x: options.x ?? 0, y: options.y ?? 0, width: 1280, height: 720 }),
        contentView: proxied({}),
        loadURL: (url) => { win.url = url; return Promise.resolve() },
      })
      win.webContents = proxied(makeEmitter({
        isDestroyed: () => win.destroyed,
        loadURL: (url) => { win.url = url; return Promise.resolve() },
        executeJavaScript: fakeGallery(win),
        insertCSS: (css) => { win.css.push(css); return Promise.resolve('key') },
        getURL: () => win.url || 'file:///player/local-image-player.html?srcs=%5B%5D',
      }))
      const proxy = proxied(win)
      state.windows.push(proxy)
      return proxy
    }
    static getAllWindows() { return [] }
    static fromWebContents() { return null }
  }
  class WebContentsView {
    constructor() {
      return proxied({ webContents: proxied({
        isDestroyed: () => false,
        loadURL: () => Promise.resolve(),
        send: (channel, payload) => state.barSends.push([channel, payload]),
      }) })
    }
  }
  /** Arquivo de imagem falso: 6000×4000, ou vazio se o caminho tiver "vazia". */
  function fakeImage(width, height, empty = false) {
    return {
      isEmpty: () => empty,
      getSize: () => ({ width, height }),
      crop: (rect) => { state.crops.push(rect); return fakeImage(rect.width, rect.height) },
      resize: (size) => { state.resizes.push(size); return fakeImage(size.width, size.height) },
      toJPEG: () => Buffer.from(`jpg${width}x${height}`),
    }
  }
  const nativeImage = { createFromPath: (p) => fakeImage(6000, 4000, String(p).includes('vazia')) }
  const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
  const second = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
  return {
    BrowserWindow,
    WebContentsView,
    nativeImage,
    screen: proxied({ getAllDisplays: () => [primary, second], getPrimaryDisplay: () => primary }),
    session: { defaultSession: proxied({}) },
    app: { getPath: () => '/tmp' },
    net: {},
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), isRegistered: vi.fn(() => false) },
    powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn() },
    desktopCapturer: { getSources: vi.fn(async () => []) },
  }
})
vi.mock('../workspace.mjs', () => ({ readWorkspaceRecord: vi.fn(), writeWorkspaceRecord: vi.fn() }))
vi.mock('../palco-server.mjs', () => ({ getPalcoManager: vi.fn(() => null) }))
vi.mock('./../ipc/presentation-convert.mjs', () => ({ convertPresentationToPdf: vi.fn() }))

const projection = await import('../ipc/web-projection.mjs')
projection.setIndependentLayerHooks({ add: vi.fn(), addShared: vi.fn() })

/** Popup do operador com uma tela de projeção (independente no monitor 2). */
async function openImagesWithScreen() {
  await projection.openWebProjectionWindows({ mode: 'image', filePaths: ['/tmp/a.png', '/tmp/b.png'], title: 'Fotos', withScreens: false })
  const source = state.windows[0]
  expect(projection.openPlayerIndependent(2, 'overlay')).toBe(true)
  const screen = state.windows.at(-1)
  return { source, screen }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  projection.closeWebProjectionWindows()
  state.windows.length = 0
  state.barSends.length = 0
  state.crops.length = 0
  state.resizes.length = 0
})

describe('normalizeImageView', () => {
  it('garante números e usa a imagem inteira como padrão', () => {
    expect(projection.normalizeImageView({ zoom: '2', x: 0.1, y: 'x' })).toEqual({ zoom: 2, x: 0.1, y: 0 })
    expect(projection.normalizeImageView(null)).toEqual({ zoom: 1, x: 0, y: 0 })
    expect(projection.normalizeImageView({ zoom: Infinity })).toEqual({ zoom: 1, x: 0, y: 0 })
  })
})

describe('zoom da galeria de imagens', () => {
  it('sem galeria aberta: botões e mouse não fazem nada', async () => {
    expect(await projection.setImageView({ zoom: 2 })).toBeNull()
    expect(projection.reportImageViewFromSource({}, { zoom: 2 })).toBe(false)
  })

  it('botões: aplica no popup (que limita) e repete nas telas', async () => {
    const { source, screen } = await openImagesWithScreen()
    expect(await projection.setImageView({ zoom: 9, x: 0.5, y: 'x' })).toEqual({ zoom: 5, x: 0.5, y: 0 })
    expect(source.view).toEqual({ zoom: 5, x: 0.5, y: 0 })
    expect(screen.view).toEqual({ zoom: 5, x: 0.5, y: 0 })
  })

  it('popup que não responde: nada é replicado', async () => {
    const { source, screen } = await openImagesWithScreen()
    source.failScripts = true
    expect(await projection.setImageView({ zoom: 2 })).toBeNull()
    expect(screen.view.zoom).toBe(1)
  })

  it('mouse: só o popup do operador manda; as telas seguem', async () => {
    const { source, screen } = await openImagesWithScreen()
    expect(projection.reportImageViewFromSource(screen.webContents, { zoom: 3, x: 0, y: 0 })).toBe(false)
    expect(projection.reportImageViewFromSource(null, { zoom: 3, x: 0, y: 0 })).toBe(false)
    await flush()
    expect(screen.view.zoom).toBe(1)

    expect(projection.reportImageViewFromSource(source.webContents, { zoom: 3, x: 0.2, y: -0.1 })).toBe(true)
    await flush()
    expect(screen.view).toEqual({ zoom: 3, x: 0.2, y: -0.1 })
  })

  it('tela que termina de carregar herda o zoom atual do popup', async () => {
    const { source, screen } = await openImagesWithScreen()
    source.view = { zoom: 2, x: 0.1, y: 0 }
    screen.webContents.emit('did-finish-load')
    await vi.waitFor(() => expect(screen.view).toEqual({ zoom: 2, x: 0.1, y: 0 }))

    // popup sem zoom para informar: a tela fica como está
    source.noView = true
    screen.view = { zoom: 1, x: 0, y: 0 }
    screen.webContents.emit('did-finish-load')
    await flush()
    await flush()
    expect(screen.view).toEqual({ zoom: 1, x: 0, y: 0 })
  })

  it('a barra não cobre a imagem no popup; a tela de projeção segue inteira', async () => {
    const { source, screen } = await openImagesWithScreen()
    source.webContents.emit('did-finish-load')
    screen.webContents.emit('did-finish-load')
    expect(source.css).toEqual(['#stage { height: calc(100% - 64px) !important; }'])
    expect(screen.css).toEqual([])

    // janela fechada ou fora da galeria: nada a reservar
    source.destroyed = true
    projection.reserveControlBarSpace(source)
    expect(source.css).toHaveLength(1)
    projection.closeWebProjectionWindows()
    const other = { isDestroyed: () => false, webContents: { insertCSS: vi.fn() } }
    projection.reserveControlBarSpace(other)
    expect(other.webContents.insertCSS).not.toHaveBeenCalled()
  })

  it('PDF/PPT: botões, mouse, tela nova, faixa da barra e estado com zoom', async () => {
    await projection.openWebProjectionWindows({ mode: 'pdf', filePath: '/tmp/a.pdf', title: 'Hinário', withScreens: false })
    const source = state.windows[0]
    expect(projection.openPlayerIndependent(2, 'overlay')).toBe(true)
    const screen = state.windows.at(-1)

    expect(await projection.setImageView({ zoom: 2, x: 0.1, y: 0 })).toEqual({ zoom: 2, x: 0.1, y: 0 })
    expect(screen.view).toEqual({ zoom: 2, x: 0.1, y: 0 })
    expect(source.scripts.at(-1)).toContain('window.__liturgyPdf')

    expect(projection.reportImageViewFromSource(source.webContents, { zoom: 3, x: 0, y: 0.2 })).toBe(true)
    await flush()
    expect(screen.view).toEqual({ zoom: 3, x: 0, y: 0.2 })

    source.view = { zoom: 1.5, x: 0, y: 0 }
    screen.webContents.emit('did-finish-load')
    await vi.waitFor(() => expect(screen.view).toEqual({ zoom: 1.5, x: 0, y: 0 }))

    source.webContents.emit('did-finish-load')
    expect(source.css).toEqual(['#stage { height: calc(100% - 64px) !important; }'])
    expect(await projection.getPdfPageState()).toMatchObject({ index: 0, total: 2, view: { zoom: 1.5, x: 0, y: 0 } })
  })

  it('zoom (botões ou mouse) avisa a barra na hora, com a animação, para as TVs', async () => {
    const { source } = await openImagesWithScreen()
    await projection.setImageView({ zoom: 2, x: 0, y: 0, anim: 180 })
    expect(state.barSends.at(-1)).toEqual(['projection:image-view', { zoom: 2, x: 0, y: 0, anim: 180 }])
    projection.reportImageViewFromSource(source.webContents, { zoom: 2.5, x: 0.1, y: 0, anim: 140 })
    expect(state.barSends.at(-1)).toEqual(['projection:image-view', { zoom: 2.5, x: 0.1, y: 0, anim: 140 }])
    expect(projection.normalizeImageView({ zoom: 1, anim: 9999 })).toEqual({ zoom: 1, x: 0, y: 0, anim: 400 })
  })

  it('quadro da imagem para as TVs: arquivo inteiro reduzido a 3840, ou só o recorte do zoom', async () => {
    expect(await projection.captureImageFrame()).toBeNull()
    const { source } = await openImagesWithScreen()
    const full = await projection.captureImageFrame()
    expect(full).toEqual({ mime: 'image/jpeg', data: Buffer.from('jpg3840x2560').toString('base64') })
    expect(state.crops).toEqual([])

    source.cropRegion = { x: 1500, y: 1000, width: 3000, height: 2000 }
    const crop = await projection.captureImageFrame({ crop: true })
    expect(state.crops).toEqual([{ x: 1500, y: 1000, width: 3000, height: 2000 }])
    expect(crop.data).toBe(Buffer.from('jpg3000x2000').toString('base64'))

    // sem zoom (sem região): a imagem inteira; região fora do arquivo é limitada
    source.cropRegion = null
    await projection.captureImageFrame({ crop: true })
    expect(state.crops).toHaveLength(1)
    source.cropRegion = { x: 9000, y: -5, width: 'x', height: 99999 }
    await projection.captureImageFrame({ crop: true })
    expect(state.crops.at(-1)).toEqual({ x: 5999, y: 0, width: 1, height: 4000 })

    // janela que não responde: nada
    source.failScripts = true
    expect(await projection.captureImageFrame()).toBeNull()
  })

  it('arquivo de imagem ilegível não vai para as TVs', async () => {
    await projection.openWebProjectionWindows({ mode: 'image', filePaths: ['/tmp/vazia.png'], title: 'x', withScreens: false })
    expect(await projection.captureImageFrame()).toBeNull()
  })

  it('o estado da galeria leva o zoom para a barra acompanhar', async () => {
    const { source } = await openImagesWithScreen()
    source.view = { zoom: 2.5, x: 0, y: 0.3 }
    expect(await projection.getImageSlideState()).toMatchObject({ index: 0, total: 2, view: { zoom: 2.5, x: 0, y: 0.3 } })
  })
})
