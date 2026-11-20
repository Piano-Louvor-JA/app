import { expect, it, vi } from 'vitest'

const invoke = vi.fn()
const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
  webFrame: { getZoomFactor: vi.fn(() => 1), setZoomFactor: vi.fn(), getZoomLevel: vi.fn(() => 0), setZoomLevel: vi.fn() },
}))

it('exposes the transmission settings, connection updates and token reset to the renderer', async () => {
  await import('../preload.mjs')
  const { palco } = exposeInMainWorld.mock.calls.find(([name]) => name === 'louvorja')[1]
  palco.updateSlot('7082', { httpPort: 9000, overlay: { theme: 'light' } })
  palco.transmission()
  palco.setTransmission({ bind: 'local' })
  palco.resetToken()
  expect(invoke.mock.calls).toEqual([
    ['palco:slot-update', { id: '7082', httpPort: 9000, overlay: { theme: 'light' } }],
    ['palco:transmission-get'],
    ['palco:transmission-set', { bind: 'local' }],
    ['palco:token-reset'],
  ])
})


it('exposes independent remote and speaker token renewal', async () => {
  vi.resetModules()
  await import('../preload.mjs')
  const { remote } = exposeInMainWorld.mock.calls.find(([name]) => name === 'louvorja')[1]
  invoke.mockClear()
  remote.resetToken('remote')
  remote.resetToken('speaker')
  expect(invoke.mock.calls).toEqual([
    ['remote:token-reset', 'remote'],
    ['remote:token-reset', 'speaker'],
  ])
})
