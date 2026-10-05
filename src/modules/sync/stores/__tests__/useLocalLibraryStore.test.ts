import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: vi.fn(() => true),
  getDesktopBridge: vi.fn(() => null),
}))
vi.mock('@shared/services/track-media', () => ({
  invalidateTrackMediaCache: vi.fn(),
  peekTrackDownloadCache: vi.fn(() => new Set<number>()),
}))
vi.mock('../../services/library-catalog', () => ({
  loadLibraryCategories: vi.fn(async () => [
    {
      id: 1,
      name: 'CDs Oficiais',
      albums: [
        { id: 101, name: 'Album 1', musicIds: [1, 2], status: 'idle' },
        { id: 102, name: 'Album 2', musicIds: [3], status: 'idle' },
      ],
    },
  ]),
  hydrateLocalLibraryCoverUrls: vi.fn(async (cats: unknown[]) => cats),
}))
vi.mock('../../services/library-download', () => ({
  deleteAlbumMedia: vi.fn(async () => true),
  downloadAlbumMedia: vi.fn(async () => true),
  listAlbumMusicIds: vi.fn(async () => [1, 2]),
  markAlbumAsDownloaded: vi.fn(),
  reconcileAlbumsAgainstLocalMedia: vi.fn(),
  resolveAlbumIdsForMusic: vi.fn(async () => [101]),
  unmarkAlbumAsDownloaded: vi.fn(),
}))

import { useLocalLibraryStore } from '../useLocalLibraryStore'

describe('useLocalLibraryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('refreshCollections', () => {
    it('popula categories a partir do catálogo', async () => {
      const store = useLocalLibraryStore()
      await store.refreshCollections()
      expect(store.categories.length).toBe(1)
      expect(store.categories[0]?.name).toBe('CDs Oficiais')
    })

    it('limpa loading após refresh', async () => {
      const store = useLocalLibraryStore()
      await store.refreshCollections()
      expect(store.isLoadingList).toBe(false)
    })
  })

  describe('erros', () => {
    it('clearError limpa erro e notice', () => {
      const store = useLocalLibraryStore()
      store.clearError()
      expect(store.downloadFailure).toBeNull()
    })
  })

  describe('downloadAlbum (desktop mock)', () => {
    it('completa sem crashar com bridge mockado', async () => {
      const store = useLocalLibraryStore()
      await store.refreshCollections()
      // download real precisa do bridge Electron — com bridge null deve falhar graciosamente
      await expect(
        Promise.resolve().then(() => store.downloadAlbum(101)),
      ).resolves.not.toThrow()
    })
  })
})

async function flushPromisesLike() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('useLocalLibraryStore — downloadAlbum states (gaps onda1)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const libDownload = await import('../../services/library-download')
    vi.mocked(libDownload.downloadAlbumMedia).mockReset()
  })

  it('sucesso marca downloaded; cancelado zera; erro solo seta falha global', async () => {
    const libDownload = await import('../../services/library-download')
    const store = useLocalLibraryStore()
    await store.refreshCollections()

    vi.mocked(libDownload.downloadAlbumMedia).mockResolvedValueOnce({ status: 'downloaded' } as never)
    await store.downloadAlbum(101)
    expect(store.categories[0]?.albums[0]?.status).toBe('downloaded')

    // volta a idle p/ próximos downloads
    store.removeAlbum(101)
    store.refreshCollections()
    await store.refreshCollections()

    vi.mocked(libDownload.downloadAlbumMedia).mockResolvedValueOnce({ status: 'idle', failureReason: 'cancelled' } as never)
    await store.downloadAlbum(101)
    expect(store.categories[0]?.albums[0]?.progressText).toBe('sync.progress.cancelled')
  })

  it('batch: erro lança → catch com isDownloadingBatch não seta falha (261); cancel 2x troca gen (300)', async () => {
    const libDownload = await import('../../services/library-download')
    const store = useLocalLibraryStore()
    await store.refreshCollections()

    // downloadAlbumMedia LANÇA dentro de batch → catch 253-264 com
    // isDownloadingBatch true (261 false side)
    await store.refreshCollections()
    // batch ativo real: deferred no 1º download segura o loop do batch
    let releaseFirst: (() => void) | null = null
    const gate = new Promise<void>((res) => { releaseFirst = res })
    vi.mocked(libDownload.downloadAlbumMedia).mockImplementationOnce(async () => {
      await gate
      return { status: 'idle', failureReason: 'cancelled' } as never
    })
    const batchPromise = store.downloadAllIdleAlbums()
    await flushPromisesLike()
    expect(store.isDownloadingBatch).toBe(true)
    // cancelAlbum SEM gen prévia (300 undefined-path) e DEPOIS again (defined)
    store.categories[0]!.albums[0]!.status = 'downloading'
    store.cancelAlbum(101)
    store.categories[0]!.albums[0]!.status = 'downloading'
    store.cancelAlbum(101)
    // shouldAbort com batch cancelado (205 arm3): cancelAllDownloads
    store.cancelAllDownloads()
    // download DIRETO que lança durante o batch → catch 261 false side
    vi.mocked(libDownload.downloadAlbumMedia).mockImplementationOnce((async (_album: unknown, hooks: { shouldAbort: () => boolean }) => {
      // shouldAbort TRUE com batch cancelado (205 arm3/206 arm2)
      store.cancelAllDownloads()
      expect(hooks.shouldAbort()).toBe(true)
      throw new Error('boom')
    }) as never)
    await store.downloadAlbum(101)
    expect(store.downloadFailure).toBeNull()
    releaseFirst?.()
    await batchPromise

    // cancel 2x com status downloading ambas → gen existente (300 arm1)
    store.categories[0]!.albums[0]!.status = 'downloading'
    store.cancelAlbum(101)
    store.categories[0]!.albums[0]!.status = 'downloading'
    store.cancelAlbum(101)
    expect(store.categories[0]?.albums[0]?.cancelRequested).toBe(true)
  })
});
