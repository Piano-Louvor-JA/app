// @vitest-environment node
/** Aviso de texto: a janela abre como "Texto — …" e a barra carrega em modo texto
 * (sem setas, automático e contador). Regressão: fechar a projeção anterior
 * zerava o modo texto no meio da abertura. */
import { describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ titles: [], barUrls: [] }))

function fakeObject(extra = {}) {
  return new Proxy(extra, {
    get(target, key) {
      if (key in target) return target[key]
      if (key === 'then') return undefined
      return () => undefined
    },
  })
}

vi.mock('electron', () => {
  class BrowserWindow {
    constructor() {
      return fakeObject({
        setTitle: (title) => created.titles.push(title),
        isDestroyed: () => false,
        getContentSize: () => [1280, 720],
        getBounds: () => ({ x: 0, y: 0, width: 1280, height: 720 }),
        contentView: fakeObject(),
        webContents: fakeObject({
          isDestroyed: () => false,
          loadURL: () => Promise.resolve(),
          executeJavaScript: () => Promise.resolve(null),
          getURL: () => 'about:blank',
        }),
        loadURL: () => Promise.resolve(),
      })
    }
    static getAllWindows() { return [] }
    static fromWebContents() { return null }
  }
  class WebContentsView {
    constructor() {
      return fakeObject({
        webContents: fakeObject({
          isDestroyed: () => false,
          loadURL: (url) => { created.barUrls.push(url); return Promise.resolve() },
        }),
      })
    }
  }
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
  return {
    BrowserWindow,
    WebContentsView,
    screen: fakeObject({ getAllDisplays: () => [display], getPrimaryDisplay: () => display }),
    session: { defaultSession: fakeObject() },
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

const { openWebProjectionWindows, closeWebProjectionWindows, getTextScale } = await import('../ipc/web-projection.mjs')

describe('openWebProjectionWindows modo texto', () => {
  it('abre como "Texto — título" com a barra em modo texto, mesmo fechando uma projeção anterior', async () => {
    const text = { title: 'Batismo', html: '<p>Sábado</p>' }
    await expect(openWebProjectionWindows({ mode: 'text', text, title: 'Batismo', withScreens: false })).resolves.toBe(true)
    // segunda abertura: passa por closeWebProjectionWindows() da primeira
    await expect(openWebProjectionWindows({ mode: 'text', text, title: 'Batismo', withScreens: false })).resolves.toBe(true)
    expect(created.titles.at(-1)).toBe('Texto — Batismo')
    expect(created.barUrls.at(-1)).toMatch(/image-control-bar\.html\?kind=text$/)
    expect(getTextScale()).toEqual({ scale: 1 })
    closeWebProjectionWindows()
    expect(getTextScale()).toBeNull()
  })

  it('galeria de imagens depois do texto volta a ser imagem', async () => {
    await openWebProjectionWindows({ mode: 'image', filePaths: ['/tmp/a.png'], title: 'Fotos', withScreens: false })
    expect(created.titles.at(-1)).toBe('Imagens — Fotos')
    expect(created.barUrls.at(-1)).toMatch(/image-control-bar\.html$/)
    expect(getTextScale()).toBeNull()
    closeWebProjectionWindows()
  })
})
