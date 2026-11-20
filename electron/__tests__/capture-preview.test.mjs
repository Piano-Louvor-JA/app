import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = {}
const fromWebContents = vi.fn()
const ipcOn = vi.fn()
const invoke = vi.fn()
const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents },
  ipcMain: {
    handle: vi.fn((channel, handler) => {
      handlers[channel] = handler
    }),
  },
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on: ipcOn, removeListener: vi.fn(), send: vi.fn() },
  webFrame: { getZoomFactor: vi.fn(() => 1), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0), setZoomLevel: vi.fn() },
}))

const { registerWindowIpc } = await import('../ipc/window.mjs')
registerWindowIpc(() => null)

/** Imagem falsa no formato do nativeImage do Electron. */
function fakeImage({ empty = false, width = 1200 } = {}) {
  const resized = { toJPEG: vi.fn(() => Buffer.from('jpeg-bytes')) }
  return {
    isEmpty: () => empty,
    getSize: () => ({ width, height: 700 }),
    resize: vi.fn(() => resized),
    resized,
  }
}

function fakeWindow(image, { destroyed = false } = {}) {
  return {
    isDestroyed: () => destroyed,
    webContents: { capturePage: vi.fn(async () => image) },
  }
}

const capture = (rect) => handlers['window:capture-preview']({ sender: {} }, rect)

describe('window:capture-preview (main)', () => {
  beforeEach(() => {
    fromWebContents.mockReset()
  })

  it('captura o retângulo (arredondado), reduz para 800 px (prévia e efeito) e devolve JPEG', async () => {
    const image = fakeImage()
    const win = fakeWindow(image)
    fromWebContents.mockReturnValue(win)

    const result = await capture({ x: 10.4, y: 120.6, width: 1200.2, height: 700 })

    expect(win.webContents.capturePage).toHaveBeenCalledWith({ x: 10, y: 121, width: 1200, height: 700 })
    expect(image.resize).toHaveBeenCalledWith({ width: 800 })
    expect(image.resized.toJPEG).toHaveBeenCalledWith(70)
    expect(result).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`)
  })

  it('imagem menor que 800 px não é ampliada', async () => {
    const image = fakeImage({ width: 200 })
    fromWebContents.mockReturnValue(fakeWindow(image))
    await capture({ x: 0, y: 0, width: 200, height: 100 })
    expect(image.resize).toHaveBeenCalledWith({ width: 200 })
  })

  it('retângulo inválido devolve null sem capturar', async () => {
    const win = fakeWindow(fakeImage())
    fromWebContents.mockReturnValue(win)
    for (const rect of [null, 'x', { x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 10, height: -1 }, { x: 'a', y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: Infinity, height: 10 }]) {
      expect(await capture(rect), JSON.stringify(rect)).toBeNull()
    }
    expect(win.webContents.capturePage).not.toHaveBeenCalled()
  })

  it('sem janela, janela destruída, imagem vazia ou erro: null', async () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 }
    fromWebContents.mockReturnValue(null)
    expect(await capture(rect)).toBeNull()

    fromWebContents.mockReturnValue(fakeWindow(fakeImage(), { destroyed: true }))
    expect(await capture(rect)).toBeNull()

    fromWebContents.mockReturnValue(fakeWindow(fakeImage({ empty: true })))
    expect(await capture(rect)).toBeNull()

    const failing = fakeWindow(fakeImage())
    failing.webContents.capturePage.mockRejectedValue(new Error('gpu'))
    fromWebContents.mockReturnValue(failing)
    expect(await capture(rect)).toBeNull()
  })
})

describe('preload: window.capturePreview', () => {
  it('chama window:capture-preview com o retângulo', async () => {
    invoke.mockResolvedValue('data:image/jpeg;base64,AA')
    await import('../preload.mjs')
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === 'louvorja')[1]
    const rect = { x: 0, y: 100, width: 800, height: 500 }
    await expect(api.window.capturePreview(rect)).resolves.toBe('data:image/jpeg;base64,AA')
    expect(invoke).toHaveBeenCalledWith('window:capture-preview', rect)
  })
})
