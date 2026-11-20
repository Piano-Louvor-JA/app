// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map()
const restoreAppBackupArchive = vi.fn()
const invalidate = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/tmp/backup.zip'] })),
  },
  net: {},
  ipcMain: { on: vi.fn(), handle: vi.fn((channel, handler) => handlers.set(channel, handler)) },
}))
vi.mock('../workspace.mjs', async () => ({
  checkMediaFile: vi.fn(), checkMediaFiles: vi.fn(), clearWorkspaceData: vi.fn(), deleteMediaFile: vi.fn(),
  downloadCatalogDatabase: vi.fn(), downloadMediaFile: vi.fn(), extractCatalogDatabase: vi.fn(),
  readWorkspaceRecord: vi.fn(), writeWorkspaceRecord: vi.fn(),
}))
vi.mock('../app-backup.mjs', async (importOriginal) => ({
  ...await importOriginal(),
  restoreAppBackupArchive: (...a) => restoreAppBackupArchive(...a),
  readRestoredBrowserStorage: vi.fn(() => null),
}))
vi.mock('../bible-store.mjs', () => ({ getBibleStore: () => ({ invalidate }) }))
vi.mock('../paths.mjs', () => ({
  ensureWorkspaceDirectories: vi.fn(),
  getWorkspacePaths: vi.fn(() => ({ root: '/tmp/louvorja-data' })),
}))
vi.mock('../ipc/web-projection.mjs', async (importOriginal) => ({
  ...await importOriginal(),
  registerProjectionCapturePermissions: vi.fn(),
}))
vi.mock('../ipc/displays.mjs', () => ({ registerDisplayIpc: vi.fn() }))
vi.mock('../ipc/dialog.mjs', () => ({ registerDialogIpc: vi.fn(), registerReadBinaryFileIpc: vi.fn() }))

const { registerWorkspaceIpc } = await import('../ipc/register.mjs')

describe('backup:restore IPC — Bíblia', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerWorkspaceIpc()
  })

  it('depois de restaurar, esquece as versões da Bíblia em memória', async () => {
    restoreAppBackupArchive.mockResolvedValue(undefined)
    const event = { sender: { isDestroyed: () => false, send: vi.fn() } }

    await expect(handlers.get('backup:restore')(event)).resolves.toEqual({ ok: true })
    expect(restoreAppBackupArchive).toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith()
  })

  it('restauração que falha não mexe no cache da Bíblia', async () => {
    restoreAppBackupArchive.mockRejectedValue(new Error('zip corrompido'))
    const event = { sender: { isDestroyed: () => false, send: vi.fn() } }

    await expect(handlers.get('backup:restore')(event)).resolves.toMatchObject({ ok: false })
    expect(invalidate).not.toHaveBeenCalled()
  })
})
