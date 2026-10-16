import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcOn = vi.fn()
const removeListener = vi.fn()
const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: { handle: vi.fn() },
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke: vi.fn(), on: ipcOn, removeListener, send: vi.fn() },
  webFrame: { getZoomFactor: vi.fn(() => 1), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0), setZoomLevel: vi.fn() },
}))

const { attachHistoryAppCommand } = await import('../ipc/window.mjs')

function fakeWindow({ destroyed = false } = {}) {
  const handlers = {}
  return {
    handlers,
    on: vi.fn((event, handler) => {
      handlers[event] = handler
    }),
    isDestroyed: vi.fn(() => destroyed),
    webContents: { send: vi.fn() },
  }
}

describe('attachHistoryAppCommand (main)', () => {
  it('browser-backward/forward (botões laterais/teclas no Windows) viram window:history-command', () => {
    const win = fakeWindow()
    attachHistoryAppCommand(win)
    expect(win.on).toHaveBeenCalledWith('app-command', expect.any(Function))

    win.handlers['app-command']({}, 'browser-backward')
    win.handlers['app-command']({}, 'browser-forward')
    expect(win.webContents.send.mock.calls).toEqual([
      ['window:history-command', 'back'],
      ['window:history-command', 'forward'],
    ])
  })

  it('ignora outros app-commands', () => {
    const win = fakeWindow()
    attachHistoryAppCommand(win)
    win.handlers['app-command']({}, 'media-play-pause')
    win.handlers['app-command']({}, 'browser-refresh')
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('não envia para janela já destruída', () => {
    const win = fakeWindow({ destroyed: true })
    attachHistoryAppCommand(win)
    win.handlers['app-command']({}, 'browser-backward')
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})

describe('preload: window.onHistoryCommand', () => {
  beforeEach(() => {
    ipcOn.mockClear()
    removeListener.mockClear()
  })

  it('assina window:history-command, repassa a direção e cancela a assinatura', async () => {
    await import('../preload.mjs')
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === 'louvorja')[1]
    const callback = vi.fn()

    const unsubscribe = api.window.onHistoryCommand(callback)
    const [channel, listener] = ipcOn.mock.calls.find(([c]) => c === 'window:history-command')
    expect(channel).toBe('window:history-command')

    listener({}, 'back')
    expect(callback).toHaveBeenCalledWith('back')

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('window:history-command', listener)
  })
})
