import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { openMusicPlayer } from '@modules/media/services/open-music-player'
import type { MediaPlaybackMode } from '@modules/media/types/media'

import {
  findCollectionById,
  loadAlbumCategories,
  loadCustomAlbumCategory,
} from '../services/album-catalog'
import { getShowCustomCollections } from '../visibility'
import {
  filterAlbumMusicIndex,
  loadAlbumMusicIndex,
} from '../services/album-music-search'
import {
  filterAlbumTracks,
  loadAlbumLyric,
  loadCollectionTracks,
} from '../services/album-tracks'
import type {
  AlbumCategory,
  AlbumCollection,
  AlbumLyricDocument,
  AlbumSearchHit,
  AlbumTrack,
} from '../types/albums'

export const useAlbumsStore = defineStore('albums', () => {
  const categories = ref<AlbumCategory[]>([])
  const activeCollection = ref<AlbumCollection | null>(null)
  const tracks = ref<AlbumTrack[]>([])
  const musicIndex = ref<AlbumSearchHit[]>([])
  const searchQuery = ref('')
  const hubSearchQuery = ref('')
  const isLoadingCatalog = ref(false)
  const isLoadingTracks = ref(false)
  const isLoadingMusicIndex = ref(false)
  const lastErrorKey = ref<string | null>(null)
  const lastActionMessageKey = ref<string | null>(null)

  const lyricOpen = ref(false)
  const lyricDoc = ref<AlbumLyricDocument | null>(null)
  const isLoadingLyric = ref(false)

  const filteredTracks = computed(() =>
    filterAlbumTracks(tracks.value, searchQuery.value),
  )

  const hubSearchResults = computed(() =>
    filterAlbumMusicIndex(musicIndex.value, hubSearchQuery.value),
  )

  const isHubSearching = computed(() => hubSearchQuery.value.trim().length > 0)

  async function hydrateMusicIndex() {
    const first = musicIndex.value[0]
    if (
      (musicIndex.value.length > 0 && Array.isArray(first?.hymnalTracks)) ||
      isLoadingMusicIndex.value
    ) {
      return
    }
    isLoadingMusicIndex.value = true
    try {
      musicIndex.value = await loadAlbumMusicIndex()
    } catch (error) {
      console.error('[albums] falha ao carregar índice de músicas', error)
      musicIndex.value = []
    } finally {
      isLoadingMusicIndex.value = false
    }
  }

  async function mergeCustomCollections() {
    if (!getShowCustomCollections()) return
    try {
      const customCategory = await loadCustomAlbumCategory()
      if (!customCategory) return

      const withoutCustom = categories.value.filter(
        (category) => String(category.id) !== 'custom',
      )
      categories.value = [customCategory, ...withoutCustom]
    } catch (error) {
      console.warn('[albums] falha ao carregar Minhas Coletâneas', error)
    }
  }

  async function hydrateCatalog() {
    if (categories.value.length > 0) return
    isLoadingCatalog.value = true
    lastErrorKey.value = null
    try {
      // Catálogo local primeiro — a Central abre na hora com capas.
      categories.value = await loadAlbumCategories()
      if (categories.value.length === 0) {
        lastErrorKey.value = 'albums.messages.catalogEmpty'
      }
    } catch (error) {
      console.error('[albums] falha ao carregar catálogo', error)
      lastErrorKey.value = 'albums.messages.catalogFailed'
      categories.value = []
    } finally {
      isLoadingCatalog.value = false
    }

    void hydrateMusicIndex()
    void mergeCustomCollections()
  }

  async function openCollection(collectionId: string) {
    isLoadingTracks.value = true
    lastErrorKey.value = null
    searchQuery.value = ''
    tracks.value = []

    try {
      if (categories.value.length === 0) {
        await hydrateCatalog()
      }

      const collection = findCollectionById(categories.value, collectionId)
      if (!collection) {
        activeCollection.value = null
        lastErrorKey.value = 'albums.messages.collectionMissing'
        return false
      }

      activeCollection.value = collection
      tracks.value = await loadCollectionTracks(collection)
      if (tracks.value.length === 0) {
        lastErrorKey.value = 'albums.messages.tracksEmpty'
      }
      return true
    } catch (error) {
      console.error('[albums] falha ao carregar faixas', error)
      lastErrorKey.value = 'albums.messages.tracksFailed'
      activeCollection.value = null
      tracks.value = []
      return false
    } finally {
      isLoadingTracks.value = false
    }
  }

  function clearCollection() {
    activeCollection.value = null
    tracks.value = []
    searchQuery.value = ''
  }

  function clearError() {
    lastErrorKey.value = null
  }

  function clearActionMessage() {
    lastActionMessageKey.value = null
  }

  async function playTrack(
    musicId: number,
    mode: MediaPlaybackMode,
    options?: { project?: boolean },
  ) {
    const albumId =
      activeCollection.value?.kind === 'album'
        ? Number(activeCollection.value.id)
        : null

    const result = await openMusicPlayer({
      musicId,
      mode,
      albumId: Number.isFinite(albumId) ? albumId : null,
      project: options?.project,
    })

    if (!result.ok) {
      lastActionMessageKey.value = result.messageKey
      return false
    }

    lastActionMessageKey.value = result.warningKey ?? null
    return true
  }

  async function openLyric(musicId: number) {
    isLoadingLyric.value = true
    lyricDoc.value = null
    lyricOpen.value = true
    try {
      lyricDoc.value = await loadAlbumLyric(musicId)
      if (!lyricDoc.value) {
        lastActionMessageKey.value = 'albums.messages.lyricMissing'
        lyricOpen.value = false
      }
    } catch (error) {
      console.error('[albums] falha ao carregar letra', error)
      lastActionMessageKey.value = 'albums.messages.lyricMissing'
      lyricOpen.value = false
    } finally {
      isLoadingLyric.value = false
    }
  }

  function closeLyric() {
    lyricOpen.value = false
    lyricDoc.value = null
  }

  return {
    categories,
    activeCollection,
    tracks,
    musicIndex,
    searchQuery,
    hubSearchQuery,
    isLoadingCatalog,
    isLoadingTracks,
    isLoadingMusicIndex,
    lastErrorKey,
    lastActionMessageKey,
    lyricOpen,
    lyricDoc,
    isLoadingLyric,
    filteredTracks,
    hubSearchResults,
    isHubSearching,
    hydrateCatalog,
    hydrateMusicIndex,
    openCollection,
    clearCollection,
    clearError,
    clearActionMessage,
    playTrack,
    openLyric,
    closeLyric,
  }
})
