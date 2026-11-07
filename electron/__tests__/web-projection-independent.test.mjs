// @vitest-environment node
/** Projeção independente nos players do Piano: uma janela no monitor escolhido,
 * nas camadas "sempre acima" e "metade do monitor", que acompanha o player e
 * fecha com ele — sem depender do projetar/parar da principal. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ windows: [], views: [] }))

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

vi.mock('electron', () => {
  class BrowserWindow {
    constructor(options = {}) {
      const win = makeEmitter({
        options,
        destroyed: false,
        url: '',
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
        executeJavaScript: () => Promise.resolve(null),
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
      const view = proxied({ webContents: proxied({ isDestroyed: () => false, loadURL: () => Promise.resolve() }) })
      state.views.push(view)
      return view
    }
  }
  const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
  const second = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
  const third = { id: 3, bounds: { x: 3840, y: 0, width: 1080, height: 1920 }, workArea: { x: 3840, y: 0, width: 1080, height: 1920 } }
  return {
    BrowserWindow,
    WebContentsView,
    screen: proxied({ getAllDisplays: () => [primary, second, third], getPrimaryDisplay: () => primary }),
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
const hooks = { add: vi.fn(), addShared: vi.fn() }
projection.setIndependentLayerHooks(hooks)

async function openImages() {
  await projection.openWebProjectionWindows({ mode: 'image', filePaths: ['/tmp/a.png', '/tmp/b.png'], title: 'Fotos', withScreens: false })
}

beforeEach(() => {
  projection.closeWebProjectionWindows()
  state.windows.length = 0
  hooks.add.mockClear()
  hooks.addShared.mockClear()
})

describe('openPlayerIndependent', () => {
  it('sem player aberto, monitor principal ou inexistente: recusa', async () => {
    expect(projection.openPlayerIndependent(2)).toBe(false)
    await openImages()
    expect(projection.openPlayerIndependent(1)).toBe(false)
    expect(projection.openPlayerIndependent(99)).toBe(false)
    expect(projection.getPlayerIndependentState()).toBeNull()
  })

  it('sobrepor: abre no monitor escolhido, sempre acima, sem dividir', async () => {
    await openImages()
    const before = state.windows.length
    expect(projection.openPlayerIndependent(2, 'overlay')).toBe(true)
    const created = state.windows.slice(before)
    expect(created).toHaveLength(1)
    expect(created[0].options.x).toBe(1920)
    expect(hooks.add).toHaveBeenCalledTimes(1)
    expect(hooks.add.mock.calls[0][0] === created[0]).toBe(true)
    expect(hooks.addShared).not.toHaveBeenCalled()
    expect(projection.getPlayerIndependentState()).toEqual({ displayIds: [2], mode: 'overlay' })
  })

  it('compartilhar: entra na camada de metade do monitor', async () => {
    await openImages()
    expect(projection.openPlayerIndependent(2, 'share')).toBe(true)
    expect(hooks.addShared).toHaveBeenCalledWith(expect.anything(), 2)
    expect(projection.getPlayerIndependentState()).toEqual({ displayIds: [2], mode: 'share' })
  })

  it('vários monitores de uma vez; o principal da lista é ignorado', async () => {
    await openImages()
    const before = state.windows.length
    expect(projection.openPlayerIndependent([1, 2, 3], 'share')).toBe(true)
    const created = state.windows.slice(before)
    expect(created.map((win) => win.options.x)).toEqual([1920, 3840])
    expect(hooks.addShared).toHaveBeenCalledTimes(2)
    expect(hooks.addShared).toHaveBeenLastCalledWith(expect.anything(), 3)
    expect(projection.getPlayerIndependentState()).toEqual({ displayIds: [2, 3], mode: 'share' })

    // fechar a janela de um monitor tira só ele
    created[0].close()
    expect(projection.getPlayerIndependentState()).toEqual({ displayIds: [3], mode: 'share' })
    expect(created[1].isDestroyed()).toBe(false)
  })

  it('guarda os monitores ativos no "Telas" que vieram na abertura do player', async () => {
    await projection.openWebProjectionWindows({ mode: 'image', filePaths: ['/tmp/a.png'], title: 'Fotos', withScreens: false, monitorIds: [2, 'x', 3] })
    expect(projection.getIndependentEnabledDisplays()).toEqual([2, 3])
    await openImages()
    expect(projection.getIndependentEnabledDisplays()).toEqual([])
  })

  it('lista sem monitor estendido válido recusa', async () => {
    await openImages()
    expect(projection.openPlayerIndependent([1, 99])).toBe(false)
    expect(projection.openPlayerIndependent([])).toBe(false)
  })

  it('trocar de monitor/modo fecha a anterior; fechar a janela limpa o estado', async () => {
    await openImages()
    projection.openPlayerIndependent(2, 'overlay')
    const first = state.windows.at(-1)
    projection.openPlayerIndependent(2, 'share')
    expect(first.isDestroyed()).toBe(true)
    const second = state.windows.at(-1)
    second.close()
    expect(projection.getPlayerIndependentState()).toBeNull()
  })

  it('parar a projeção principal não fecha a independente; fechar o player fecha', async () => {
    await openImages()
    projection.openPlayerIndependent(2, 'overlay')
    const independent = state.windows.at(-1)
    await projection.toggleVideoProjectionScreens()
    await projection.toggleVideoProjectionScreens()
    expect(independent.isDestroyed()).toBe(false)
    projection.closeWebProjectionWindows()
    expect(independent.isDestroyed()).toBe(true)
    expect(projection.getPlayerIndependentState()).toBeNull()
  })

  it('site sobreposto leva a janela de proteção junto; vídeo usa o espelho por captura', async () => {
    await projection.openWebProjectionWindows({ mode: 'site', url: 'https://adventistas.org', title: 'Site', withScreens: false })
    let before = state.windows.length
    expect(projection.openPlayerIndependent(2, 'overlay')).toBe(true)
    expect(state.windows.length - before).toBe(2)
    projection.closePlayerIndependent()

    await projection.openWebProjectionWindows({ mode: 'video', filePath: '/tmp/v.mp4', title: 'Vídeo', withScreens: false })
    before = state.windows.length
    expect(projection.openPlayerIndependent(2, 'share')).toBe(true)
    expect(state.windows.length - before).toBe(1)
    expect(projection.getPlayerIndependentState()).toEqual({ displayIds: [2], mode: 'share' })
  })

  it('áudio sozinho não tem projeção independente', async () => {
    await projection.openWebProjectionWindows({ mode: 'video', filePath: '/tmp/hino.mp3', title: 'Hino', withScreens: false })
    expect(projection.openPlayerIndependent(2, 'overlay')).toBe(false)
  })
})
