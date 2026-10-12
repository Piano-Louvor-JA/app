// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de useAlbumsStore — catálogo, coletânea ativa, busca do hub,
 * letra e playTrack (com Minhas Coletâneas).
 */

const h = vi.hoisted(() => ({
  loadAlbumCategories: vi.fn(),
  loadAlbumMusicIndex: vi.fn(),
  loadCustomAlbumCategory: vi.fn(),
  findCollectionById: vi.fn(),
  loadCollectionTracks: vi.fn(),
  loadAlbumLyric: vi.fn(),
  filterAlbumTracks: vi.fn((tracks: unknown[]) => tracks),
  filterAlbumMusicIndex: vi.fn((hits: unknown[]) => hits),
  getShowCustomCollections: vi.fn(() => false),
  openMusicPlayer: vi.fn(),
}))

vi.mock('../../services/album-catalog', () => ({
  loadAlbumCategories: h.loadAlbumCategories,
  loadCustomAlbumCategory: h.loadCustomAlbumCategory,
  findCollectionById: h.findCollectionById,
}))
vi.mock('../../services/album-music-search', () => ({
  loadAlbumMusicIndex: h.loadAlbumMusicIndex,
  filterAlbumMusicIndex: h.filterAlbumMusicIndex,
}))
vi.mock('../../services/album-tracks', () => ({
  loadCollectionTracks: h.loadCollectionTracks,
  loadAlbumLyric: h.loadAlbumLyric,
  filterAlbumTracks: h.filterAlbumTracks,
}))
vi.mock('../../visibility', () => ({
  getShowCustomCollections: h.getShowCustomCollections,
}))
vi.mock('@modules/media/services/open-music-player', () => ({
  openMusicPlayer: h.openMusicPlayer,
}))

import { useAlbumsStore } from '../useAlbumsStore'

const collection = {
  id: '5',
  kind: 'album' as const,
  name: 'Coletânea 5',
  subtitle: null,
  coverUrl: null,
}

beforeEach(async () => {
  // hydrateCatalog dispara index/custom em background; drena a rodada anterior antes de limpar spies.
  await new Promise((resolve) => setTimeout(resolve, 0))
  setActivePinia(createPinia())
  vi.clearAllMocks()
  h.getShowCustomCollections.mockReturnValue(false)
  h.loadAlbumCategories.mockResolvedValue([])
  h.loadAlbumMusicIndex.mockResolvedValue([])
  h.loadCollectionTracks.mockResolvedValue([])
  h.loadAlbumLyric.mockResolvedValue(null)
  h.openMusicPlayer.mockResolvedValue({ ok: true })
})

describe('useAlbumsStore', () => {
  it('hydrateCatalog: carrega categorias e sinaliza vazio', async () => {
    const store = useAlbumsStore()
    await store.hydrateCatalog()
    expect(store.categories).toEqual([])
    expect(store.lastErrorKey).toBe('albums.messages.catalogEmpty')
    expect(store.isLoadingCatalog).toBe(false)
  })

  it('hydrateCatalog: erro define catalogFailed', async () => {
    h.loadAlbumCategories.mockRejectedValue(new Error('x'))
    const store = useAlbumsStore()
    await store.hydrateCatalog()
    expect(store.lastErrorKey).toBe('albums.messages.catalogFailed')
    expect(store.categories).toEqual([])
  })

  it('hydrateCatalog: já populado não recarrega', async () => {
    const store = useAlbumsStore()
    store.categories = [{ id: '1', kind: 'album', name: 'A', subtitle: null, coverUrl: null }] as never
    await store.hydrateCatalog()
    expect(h.loadAlbumCategories).not.toHaveBeenCalled()
  })

  it('hydrateMusicIndex: carrega índice e não duplica quando já hidratado', async () => {
    const index = [{ id: 1, hymnalTracks: [] }]
    h.loadAlbumMusicIndex.mockResolvedValue(index)
    const store = useAlbumsStore()
    await store.hydrateMusicIndex()
    expect(store.musicIndex).toEqual(index)
    await store.hydrateMusicIndex()
    expect(h.loadAlbumMusicIndex).toHaveBeenCalledTimes(1)
  })

  it('hydrateMusicIndex: erro zera índice', async () => {
    h.loadAlbumMusicIndex.mockRejectedValue(new Error('x'))
    const store = useAlbumsStore()
    await store.hydrateMusicIndex()
    expect(store.musicIndex).toEqual([])
  })

  it('mergeCustomCollections: flag desligada retorna sem carregar custom', async () => {
    const store = useAlbumsStore()
    await store.hydrateCatalog()
    await Promise.resolve()
    expect(h.loadCustomAlbumCategory).not.toHaveBeenCalled()
  })

  it('mergeCustomCollections: adiciona categoria custom na frente', async () => {
    h.getShowCustomCollections.mockReturnValue(true)
    h.loadAlbumCategories.mockResolvedValue([{ id: '1', kind: 'album', name: 'A', subtitle: null, coverUrl: null }])
    h.loadCustomAlbumCategory.mockResolvedValue({ id: 'custom', kind: 'custom', name: 'Minhas', subtitle: null, coverUrl: null })
    const store = useAlbumsStore()
    await store.hydrateCatalog()
    await Promise.resolve()
    expect(store.categories[0]?.id).toBe('custom')
    expect(store.categories).toHaveLength(2)
  })

  it('mergeCustomCollections: sem custom não altera', async () => {
    h.getShowCustomCollections.mockReturnValue(true)
    h.loadAlbumCategories.mockResolvedValue([{ id: '1', kind: 'album', name: 'A', subtitle: null, coverUrl: null }])
    h.loadCustomAlbumCategory.mockResolvedValue(null)
    const store = useAlbumsStore()
    await store.hydrateCatalog()
    await Promise.resolve()
    expect(store.categories).toHaveLength(1)
  })

  it('mergeCustomCollections: erro é warning silencioso', async () => {
    h.getShowCustomCollections.mockReturnValue(true)
    h.loadCustomAlbumCategory.mockRejectedValue(new Error('x'))
    const store = useAlbumsStore()
    await store.hydrateCatalog()
    expect(store.categories).toEqual([])
  })

  it('openCollection: catálogo já carregado não hidrata de novo', async () => {
    h.findCollectionById.mockReturnValue(collection)
    const store = useAlbumsStore()
    store.categories = [collection] as never
    await store.openCollection('5')
    expect(h.loadAlbumCategories).not.toHaveBeenCalled()
  })

  it('openCollection: localiza e carrega faixas', async () => {
    h.findCollectionById.mockReturnValue(collection)
    h.loadCollectionTracks.mockResolvedValue([{ id: 1, name: 'T' }])
    const store = useAlbumsStore()
    const ok = await store.openCollection('5')
    expect(ok).toBe(true)
    expect(store.activeCollection?.id).toBe('5')
    expect(store.tracks).toHaveLength(1)
  })

  it('openCollection: coletânea inexistente', async () => {
    h.findCollectionById.mockReturnValue(null)
    const store = useAlbumsStore()
    const ok = await store.openCollection('zz')
    expect(ok).toBe(false)
    expect(store.lastErrorKey).toBe('albums.messages.collectionMissing')
    expect(store.activeCollection).toBeNull()
  })

  it('openCollection: faixas vazias sinaliza tracksEmpty', async () => {
    h.findCollectionById.mockReturnValue(collection)
    const store = useAlbumsStore()
    await store.openCollection('5')
    expect(store.lastErrorKey).toBe('albums.messages.tracksEmpty')
  })

  it('openCollection: erro no load define tracksFailed', async () => {
    h.findCollectionById.mockReturnValue(collection)
    h.loadCollectionTracks.mockRejectedValue(new Error('x'))
    const store = useAlbumsStore()
    const ok = await store.openCollection('5')
    expect(ok).toBe(false)
    expect(store.lastErrorKey).toBe('albums.messages.tracksFailed')
    expect(store.tracks).toEqual([])
    expect(store.activeCollection).toBeNull()
  })

  it('openCollection: hidrata catálogo quando vazio', async () => {
    h.findCollectionById.mockReturnValue(collection)
    const store = useAlbumsStore()
    await store.openCollection('5')
    expect(h.loadAlbumCategories).toHaveBeenCalled()
  })

  it('clearCollection/clearError/clearActionMessage resetam estado', () => {
    const store = useAlbumsStore()
    store.activeCollection = collection as never
    store.tracks = [{ id: 1 }] as never
    store.searchQuery = 'x'
    store.lastErrorKey = 'err'
    store.lastActionMessageKey = 'msg'
    store.clearCollection()
    expect(store.activeCollection).toBeNull()
    expect(store.tracks).toEqual([])
    expect(store.searchQuery).toBe('')
    store.clearError()
    expect(store.lastErrorKey).toBeNull()
    store.clearActionMessage()
    expect(store.lastActionMessageKey).toBeNull()
  })

  it('playTrack: ok passa albumId da coletânea ativa', async () => {
    h.findCollectionById.mockReturnValue(collection)
    h.loadCollectionTracks.mockResolvedValue([{ id: 1 }])
    const store = useAlbumsStore()
    await store.openCollection('5')
    const ok = await store.playTrack(1, 'no_audio', { project: true })
    expect(ok).toBe(true)
    expect(h.openMusicPlayer).toHaveBeenCalledWith({ musicId: 1, mode: 'no_audio', albumId: 5, project: true })
    expect(store.lastActionMessageKey).toBeNull()
  })

  it('playTrack: coletânea não-álbum passa albumId null', async () => {
    h.findCollectionById.mockReturnValue({ ...collection, kind: 'hymnal' })
    h.loadCollectionTracks.mockResolvedValue([{ id: 1 }])
    const store = useAlbumsStore()
    await store.openCollection('5')
    await store.playTrack(1, 'no_audio')
    expect(h.openMusicPlayer).toHaveBeenCalledWith({ musicId: 1, mode: 'no_audio', albumId: null, project: undefined })
  })

  it('playTrack: falha define mensagem', async () => {
    h.openMusicPlayer.mockResolvedValue({ ok: false, messageKey: 'albums.messages.playFailed' })
    const store = useAlbumsStore()
    const ok = await store.playTrack(1, 'no_audio')
    expect(ok).toBe(false)
    expect(store.lastActionMessageKey).toBe('albums.messages.playFailed')
  })

  it('playTrack: warningKey propagado', async () => {
    h.openMusicPlayer.mockResolvedValue({ ok: true, warningKey: 'albums.messages.playWarning' })
    const store = useAlbumsStore()
    await store.playTrack(1, 'no_audio')
    expect(store.lastActionMessageKey).toBe('albums.messages.playWarning')
  })

  it('openLyric: carrega letra e abre', async () => {
    h.loadAlbumLyric.mockResolvedValue({ title: 'Hino 1', slides: [] })
    const store = useAlbumsStore()
    await store.openLyric(1)
    expect(store.lyricOpen).toBe(true)
    expect(store.lyricDoc).toEqual({ title: 'Hino 1', slides: [] })
    store.closeLyric()
    expect(store.lyricOpen).toBe(false)
    expect(store.lyricDoc).toBeNull()
  })

  it('openLyric: letra ausente fecha e sinaliza', async () => {
    const store = useAlbumsStore()
    await store.openLyric(1)
    expect(store.lyricOpen).toBe(false)
    expect(store.lastActionMessageKey).toBe('albums.messages.lyricMissing')
  })

  it('openLyric: erro sinaliza lyricMissing', async () => {
    h.loadAlbumLyric.mockRejectedValue(new Error('x'))
    const store = useAlbumsStore()
    await store.openLyric(1)
    expect(store.lyricOpen).toBe(false)
    expect(store.lastActionMessageKey).toBe('albums.messages.lyricMissing')
    expect(store.isLoadingLyric).toBe(false)
  })

  it('isHubSearching e hubSearchResults computadas', () => {
    const store = useAlbumsStore()
    expect(store.isHubSearching).toBe(false)
    store.hubSearchQuery = 'graça'
    expect(store.isHubSearching).toBe(true)
    expect(store.hubSearchResults).toEqual([])
    store.tracks = [{ id: 1 }, { id: 2 }] as never
    store.searchQuery = 'a'
    expect(store.filteredTracks).toHaveLength(2)
  })
})
