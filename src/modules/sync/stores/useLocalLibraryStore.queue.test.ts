import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * app#338 — migração da Central de Mídia pra fila unificada.
 * downloadAlbum deixa de rodar direto: enfileira na fila unificada
 * (priority 'user'). O download real continua delegando pro mesmo
 * downloadAlbumMedia — a fila só orquestra ordem/observabilidade.
 */

vi.mock('@shared/constants/storage-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/constants/storage-keys')>()
  return { ...actual, WORKSPACE_RECORD_KEYS: { ...actual.WORKSPACE_RECORD_KEYS, downloadQueue: 'downloadQueue' } }
})

vi.mock('@plugins/i18n', () => ({
  i18n: { global: { t: (k: string) => k, locale: 'pt-BR', te: () => true } },
  detectInitialLocale: () => 'pt-BR',
  setLocale: vi.fn(),
}))

const recordStore = new Map<string, unknown>()
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async (key: string) => recordStore.get(key) ?? null),
  writeCatalogRecord: vi.fn(async (key: string, value: unknown) => {
    recordStore.set(key, value)
    return true
  }),
}))

const mocks = vi.hoisted(() => ({
  downloadAlbumMedia: vi.fn(),
}))

vi.mock('../services/library-download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/library-download')>()
  return {
    ...actual,
    downloadAlbumMedia: mocks.downloadAlbumMedia,
  }
})

import { createPinia, setActivePinia } from 'pinia'
import {
  _resetDownloadQueueForTests,
  downloadQueueSnapshot,
  pendingCount,
} from '../services/download-queue-service'
import { useLocalLibraryStore } from './useLocalLibraryStore'
import type { LibraryAlbum } from '../types/library'

function makeAlbum(id: number, name: string): LibraryAlbum {
  return {
    id,
    name,
    isHymnal: false,
    status: 'idle',
    progress: 0,
    totalCount: 0,
    downloadedCount: 0,
    cancelRequested: false,
    progressText: '',
  } as unknown as LibraryAlbum
}

function seedCategories(albums: LibraryAlbum[]) {
  const store = useLocalLibraryStore()
  store.categories = [{ id: 1, name: 'Cat', albums }]
}

describe('useLocalLibraryStore → fila unificada (app#338)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    recordStore.clear()
    _resetDownloadQueueForTests()
    vi.clearAllMocks()
    mocks.downloadAlbumMedia.mockResolvedValue({
      status: 'downloaded',
      failureReason: null,
      totalErrors: 0,
    })
  })

  it('downloadAlbum enfileira item na fila unificada (priority user) antes de baixar', async () => {
    const store = useLocalLibraryStore()
    seedCategories([makeAlbum(7, 'Provai e Vede')])
    await store.downloadAlbum(7)
    const snap = downloadQueueSnapshot()
    const item = snap.find((q) => q.id === 'album:7')
    expect(item).toBeDefined()
    expect(item?.priority).toBe('user')
    expect(item?.label).toContain('Provai e Vede')
    expect(item?.status).toBe('done')
    expect(mocks.downloadAlbumMedia).toHaveBeenCalledOnce()
  })

  it('downloadAllIdleAlbums enfileira todas as coletâneas idle (user)', async () => {
    const store = useLocalLibraryStore()
    seedCategories([makeAlbum(1, 'A'), makeAlbum(2, 'B'), makeAlbum(3, 'C')])
    await store.downloadAllIdleAlbums()
    const ids = downloadQueueSnapshot().map((q) => q.id).sort()
    expect(ids).toEqual(['album:1', 'album:2', 'album:3'])
    expect(mocks.downloadAlbumMedia).toHaveBeenCalledTimes(3)
    expect(pendingCount()).toBe(0)
  })
})
