import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: vi.fn(() => true),
  getDesktopBridge: vi.fn(() => null),
}))

const changedListeners = new Set<(musicId: number, downloaded: boolean) => void>()
const peekCache = new Map<number, boolean>()

vi.mock('@shared/services/track-media', () => ({
  invalidateTrackMediaCache: vi.fn(),
  peekTrackDownloadCache: vi.fn((id: number) => peekCache.get(id)),
  onTrackMediaChanged: vi.fn((l: (musicId: number, downloaded: boolean) => void) => {
    changedListeners.add(l)
  }),
  offTrackMediaChanged: vi.fn(),
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
  reconcileAlbumsAgainstLocalMedia: vi.fn(async () => ({ checked: 2, marked: 1 })),
  resolveAlbumIdsForMusic: vi.fn(async () => [101]),
  unmarkAlbumAsDownloaded: vi.fn(),
}))

import { useLocalLibraryStore } from '../useLocalLibraryStore'

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function emitTrackMediaChanged(musicId: number, downloaded: boolean) {
  for (const l of [...changedListeners]) l(musicId, downloaded)
}

describe('useLocalLibraryStore — badge /albums reativo (app#albums-badge-live)', () => {
  beforeEach(() => {
    changedListeners.clear()
    peekCache.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('store assina onTrackMediaChanged na criação', async () => {
    useLocalLibraryStore()
    expect(changedListeners.size).toBeGreaterThan(0)
  })

  it('download de faixa via OUTRO fluxo (ex: pre-play) marca o álbum completo', async () => {
    peekCache.set(1, true)
    peekCache.set(2, true)
    const store = useLocalLibraryStore()
    await store.refreshCollections()
    expect(store.categories[0]?.albums[0]?.status).toBe('idle')

    emitTrackMediaChanged(1, true)
    await flush()

    expect(store.categories[0]?.albums[0]?.status).toBe('downloaded')
  })

  it('delete da única faixa em disco desmarca álbum "downloaded"', async () => {
    peekCache.set(1, true)
    peekCache.set(2, true)
    const store = useLocalLibraryStore()
    await store.refreshCollections()

    emitTrackMediaChanged(1, true)
    await flush()
    expect(store.categories[0]?.albums[0]?.status).toBe('downloaded')

    peekCache.set(1, false)
    emitTrackMediaChanged(1, false)
    await flush()

    expect(store.categories[0]?.albums[0]?.status).toBe('idle')
  })

  it('reconcile de disco roda 1× na primeira refreshCollections (boot)', async () => {
    const { reconcileAlbumsAgainstLocalMedia } = await import(
      '../../services/library-download'
    )
    const store = useLocalLibraryStore()
    await store.refreshCollections()
    await flush()
    expect(reconcileAlbumsAgainstLocalMedia).toHaveBeenCalledTimes(1)

    await store.refreshCollections()
    await flush()
    expect(reconcileAlbumsAgainstLocalMedia).toHaveBeenCalledTimes(1)
  })
})
