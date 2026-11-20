import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * app#338 — migração do warm-boot de capas pra fila unificada.
 * startCoverBackgroundSync passa a enfileirar item `bg` (não bloqueia nada,
 * visível no widget do header, user furar na frente).
 */

vi.mock('@shared/constants/storage-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/constants/storage-keys')>()
  return { ...actual }
})

const mocks = vi.hoisted(() => ({
  ensureAlbumCovers: vi.fn(),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => ({})),
  isDesktopApp: vi.fn(() => true),
}))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: vi.fn(() => 'pt'),
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async () => null),
  writeCatalogRecord: vi.fn(async () => true),
  resolveMediaUrl: vi.fn((u: string) => u),
}))

import { _resetDownloadQueueForTests, downloadQueueSnapshot, pendingCount } from '@modules/sync/services/download-queue-service'
import { startCoverBackgroundSync } from '../cover-background-sync'

describe('startCoverBackgroundSync → fila unificada (app#338)', () => {
  beforeEach(() => {
    _resetDownloadQueueForTests()
    vi.clearAllMocks()
  })

  it('enfileira item bg "Capas do catálogo" e aguarda conclusão', async () => {
    mocks.ensureAlbumCovers.mockResolvedValue({ total: 10, missing: 0, downloaded: 0 })
    await startCoverBackgroundSync(mocks.ensureAlbumCovers)
    const item = downloadQueueSnapshot().find((q) => q.id === 'covers:bg-sync')
    expect(item).toBeDefined()
    expect(item?.priority).toBe('bg')
    expect(item?.status).toBe('done')
    expect(mocks.ensureAlbumCovers).toHaveBeenCalledWith({ skipIfSynced: false })
    expect(pendingCount()).toBe(0)
  })

  it('erro do sync marca failed na fila (não derruba o warm boot)', async () => {
    mocks.ensureAlbumCovers.mockRejectedValue(new Error('offline'))
    await expect(startCoverBackgroundSync(mocks.ensureAlbumCovers)).resolves.toBeUndefined()
    expect(downloadQueueSnapshot().find((q) => q.id === 'covers:bg-sync')?.status).toBe('failed')
  })
})
