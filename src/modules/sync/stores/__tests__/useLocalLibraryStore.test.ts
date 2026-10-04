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
        { id: 101, name: 'Album 1', musicIds: [1, 2] },
        { id: 102, name: 'Album 2', musicIds: [3] },
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
