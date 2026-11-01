import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { useMediaStore } from '@modules/media/stores/useMediaStore'
import type { MediaPlaybackMode } from '@modules/media/types/media'
import { useLocalLibraryStore } from '@modules/sync/stores/useLocalLibraryStore'
import type { LibraryAlbum, LibraryAlbumId } from '@modules/sync/types/library'
import { isDesktopApp } from '@shared/services/desktop-bridge'

import { loadCollectionTracks } from '../services/album-tracks'
import { useAlbumsStore } from '../stores/useAlbumsStore'
import type { AlbumCategory, AlbumCollectionId } from '../types/albums'

export function useAlbums() {
  const store = useAlbumsStore()
  const mediaStore = useMediaStore()
  const libraryStore = useLocalLibraryStore()
  const router = useRouter()
  const isDesktop = isDesktopApp()

  const {
    categories,
    activeCollection,
    tracks,
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
  } = storeToRefs(store)

  const {
    categories: libraryCategories,
    isDownloadingBatch,
    lastErrorKey: libraryErrorKey,
    downloadFailure,
    hasIdleAlbums,
  } = storeToRefs(libraryStore)

  const downloadErrorKey = computed(() => libraryErrorKey.value)

  onMounted(() => {
    void store.hydrateCatalog()
    if (isDesktop) {
      void libraryStore.refreshCollections()
    }
  })

  function findLibraryAlbum(
    collectionId: AlbumCollectionId | LibraryAlbumId,
  ): LibraryAlbum | null {
    const id = String(collectionId)
    for (const category of libraryCategories.value) {
      const album = category.albums.find((item) => String(item.id) === id)
      if (album) return album
    }
    return null
  }

  async function openPlayerWindow(ok: boolean) {
    if (!ok) return false
    await router.push({ name: 'media' })
    return true
  }

  async function playSung(musicId: number) {
    return openPlayerWindow(await store.playTrack(musicId, 'audio'))
  }

  async function playInstrumental(musicId: number) {
    return openPlayerWindow(await store.playTrack(musicId, 'instrumental'))
  }

  async function playSlides(musicId: number) {
    return openPlayerWindow(
      await store.playTrack(musicId, 'no_audio', { project: true }),
    )
  }

  async function playMode(musicId: number, mode: MediaPlaybackMode) {
    return openPlayerWindow(
      await store.playTrack(musicId, mode, {
        project: mode === 'no_audio',
      }),
    )
  }

  /** Toca a coletânea ou o hinário inteiro, em sequência ou aleatoriamente. */
  async function playAllInActiveCollection(mode: MediaPlaybackMode = 'audio', shuffled = false) {
    const collection = activeCollection.value
    if (!collection || tracks.value.length === 0) return false
    const albumId = collection.kind === 'hymnal' ? null : Number(collection.id)
    if (albumId !== null && !Number.isFinite(albumId)) return false
    const original = tracks.value.map((track) => ({
      musicId: track.musicId,
      albumId,
      title: track.name,
    }))
    if (shuffled) {
      const items = [...original]
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j]!, items[i]!]
      }
      await mediaStore.playQueue(items, 0, mode, collection.name, { originalOrder: original, shuffled: true })
    } else {
      await mediaStore.playAlbumQueue(original, mode)
    }
    await router.push({ name: 'media' })
    return true
  }

  /** Toca todas as coletâneas da categoria; Hinários são excluídos no caller. */
  async function playAllInCategory(category: AlbumCategory, mode: MediaPlaybackMode = 'audio') {
    const queue = [] as Array<{ musicId: number; albumId: number | null; title: string }>
    for (const collection of category.collections) {
      if (collection.kind === 'hymnal') continue
      const albumId = Number(collection.id)
      if (!Number.isFinite(albumId)) continue
      const collectionTracks = await loadCollectionTracks(collection)
      queue.push(...collectionTracks.map((track) => ({
        musicId: track.musicId,
        albumId,
        title: track.name,
      })))
    }
    if (queue.length === 0) return false
    await mediaStore.playQueue(queue, 0, mode)
    await router.push({ name: 'media' })
    return true
  }

  function downloadCollection(collectionId: AlbumCollectionId) {
    void libraryStore.downloadAlbum(collectionId)
  }

  function cancelCollection(collectionId: AlbumCollectionId) {
    libraryStore.cancelAlbum(collectionId)
  }

  function downloadAll() {
    void libraryStore.downloadAllIdleAlbums()
  }

  function cancelAll() {
    libraryStore.cancelAllDownloads()
  }

  async function removeCollection(collectionId: AlbumCollectionId) {
    await libraryStore.removeAlbum(collectionId)
  }

  function clearDownloadError() {
    libraryStore.clearError()
  }

  return {
    categories,
    activeCollection,
    tracks,
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
    isDesktop,
    isDownloadingBatch,
    hasIdleAlbums,
    downloadErrorKey,
    downloadFailure,
    findLibraryAlbum,
    hydrateCatalog: store.hydrateCatalog,
    hydrateMusicIndex: store.hydrateMusicIndex,
    openCollection: store.openCollection,
    clearCollection: store.clearCollection,
    clearError: store.clearError,
    clearActionMessage: store.clearActionMessage,
    clearDownloadError,
    downloadCollection,
    cancelCollection,
    downloadAll,
    cancelAll,
    removeCollection,
    playSung,
    playInstrumental,
    playSlides,
    playMode,
    playAllInActiveCollection,
    playAllInCategory,
    openLyric: store.openLyric,
    closeLyric: store.closeLyric,
  }
}
