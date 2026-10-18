import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

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
  let catalogLanguage = getCurrentApiPrefix()
  let catalogGeneration = 0
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
    const generation = catalogGeneration
    const first = musicIndex.value[0]
    if (
      (musicIndex.value.length > 0 && Array.isArray(first?.hymnalTracks)) ||
      isLoadingMusicIndex.value
    ) {
      return
    }
    isLoadingMusicIndex.value = true
    try {
      const loaded = await loadAlbumMusicIndex()
      if (generation === catalogGeneration) musicIndex.value = loaded
    } catch (error) {
      console.error('[albums] falha ao carregar índice de músicas', error)
      if (generation === catalogGeneration) musicIndex.value = []
    } finally {
      if (generation === catalogGeneration) isLoadingMusicIndex.value = false
    }
  }

  async function mergeCustomCollections() {
    const generation = catalogGeneration
    if (!getShowCustomCollections()) return
    try {
      const customCategory = await loadCustomAlbumCategory()
      if (!customCategory || generation !== catalogGeneration) return

      const withoutCustom = categories.value.filter(
        (category) => String(category.id) !== 'custom',
      )
      categories.value = [customCategory, ...withoutCustom]
    } catch (error) {
      console.warn('[albums] falha ao carregar Minhas Coletâneas', error)
    }
  }

  async function refreshCatalog() {
    const generation = catalogGeneration
    isLoadingCatalog.value = true
    lastErrorKey.value = null
    try {
      // Catálogo local primeiro — a Central abre na hora com capas.
      const loaded = await loadAlbumCategories()
      if (generation !== catalogGeneration) return
      categories.value = loaded
      if (categories.value.length === 0) {
        lastErrorKey.value = 'albums.messages.catalogEmpty'
      }
      if (
        activeCollection.value &&
        !findCollectionById(categories.value, String(activeCollection.value.id))
      ) {
        activeCollection.value = null
        tracks.value = []
      }
    } catch (error) {
      if (generation !== catalogGeneration) return
      console.error('[albums] falha ao carregar catálogo', error)
      lastErrorKey.value = 'albums.messages.catalogFailed'
      categories.value = []
    } finally {
      if (generation === catalogGeneration) isLoadingCatalog.value = false
    }
  }

  // Marca a primeira hidratação: o catálogo pode ter aberto vazio e é
  // justamente esse caso que o evento de cache curado precisa atualizar.
  let catalogHydrated = false

  async function hydrateCatalog() {
    const language = getCurrentApiPrefix()
    if (language !== catalogLanguage) {
      catalogLanguage = language
      catalogGeneration++
      categories.value = []
      activeCollection.value = null
      tracks.value = []
      musicIndex.value = []
      searchQuery.value = ''
      hubSearchQuery.value = ''
      lyricOpen.value = false
      lyricDoc.value = null
      isLoadingMusicIndex.value = false
    }
    if (categories.value.length > 0) return
    catalogHydrated = true
    await refreshCatalog()
    void hydrateMusicIndex()
    void mergeCustomCollections()
  }

  // Store Pinia é singleton por app; listener vive até fechar a janela.
  window.addEventListener('louvorja:catalog-refreshed', () => {
    if (!catalogHydrated) return
    // refreshCatalog troca as categorias; Minhas Coletâneas volta logo depois.
    void refreshCatalog().then(() => mergeCustomCollections())
  })

  async function openCollection(collectionId: string) {
    isLoadingTracks.value = true
    lastErrorKey.value = null
    // Reabrir a mesma coletânea (voltar para a tela) mantém a busca digitada.
    if (String(activeCollection.value?.id ?? '') !== collectionId) searchQuery.value = ''
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
