// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map()
const downloadMediaFile = vi.fn()
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  BrowserWindow: vi.fn(),
  dialog: {},
  net: {},
  ipcMain: { on: vi.fn(), handle: vi.fn((channel, handler) => handlers.set(channel, handler)) },
}))
vi.mock('../workspace.mjs', async () => ({
  checkMediaFile: vi.fn(), checkMediaFiles: vi.fn(), clearWorkspaceData: vi.fn(), deleteMediaFile: vi.fn(),
  downloadCatalogDatabase: vi.fn(), downloadMediaFile, extractCatalogDatabase: vi.fn(), readWorkspaceRecord: vi.fn(), writeWorkspaceRecord: vi.fn(),
}))
vi.mock('../ipc/web-projection.mjs', async (importOriginal) => ({
  ...await importOriginal(),
  registerProjectionCapturePermissions: vi.fn(),
}))
vi.mock('../ipc/displays.mjs', () => ({ registerDisplayIpc: vi.fn() }))
vi.mock('../ipc/dialog.mjs', () => ({ registerDialogIpc: vi.fn(), registerReadBinaryFileIpc: vi.fn() }))

const { registerWorkspaceIpc } = await import('../ipc/register.mjs')

describe('media:download IPC', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerWorkspaceIpc()
  })

  it('propaga URL final, status e bytes de falha HTTP', async () => {
    downloadMediaFile.mockResolvedValue({ ok: false, url: 'https://cdn.test/final.mp3', status: 404, bytes: 12, error: 'HTTP 404' })
    await expect(handlers.get('media:download')({}, 'https://cdn.test/original.mp3', 'music', 'final.mp3')).resolves.toEqual({
      ok: false, url: 'https://cdn.test/final.mp3', status: 404, bytes: 12, error: 'HTTP 404',
    })
  })
})
