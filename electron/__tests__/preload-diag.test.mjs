import { describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
  webFrame: { getZoomFactor: vi.fn(() => 1), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0), setZoomLevel: vi.fn() },
}))

describe('DevTools diagnostics bridge', () => {
  it('invoca somente diagnostics:run, retorna resultado e baixa o JSON', async () => {
    const click = vi.fn()
    const appendChild = vi.fn()
    const removeChild = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:diagnostics')
    const revokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL
    globalThis.document = {
      body: { appendChild, removeChild },
      createElement: vi.fn(() => ({ click })),
    }
    invoke.mockResolvedValue({ report: { meta: {} }, jsonPath: '/tmp/diagnostico.json', txtPath: '/tmp/diagnostico.txt' })

    await import('../preload.mjs')
    const bridge = exposeInMainWorld.mock.calls.find(([name]) => name === '__louvorjaDiag')[1]
    const result = await bridge()

    expect(invoke).toHaveBeenCalledExactlyOnceWith('diagnostics:run')
    expect(result).toEqual({ report: { meta: {} }, jsonPath: '/tmp/diagnostico.json', txtPath: '/tmp/diagnostico.txt' })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:diagnostics')
  })
})
