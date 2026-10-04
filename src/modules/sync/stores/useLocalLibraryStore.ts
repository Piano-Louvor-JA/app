import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { isDesktopApp } from '@shared/services/desktop-bridge'
import {
  invalidateTrackMediaCache,
  peekTrackDownloadCache,
} from '@shared/services/track-media'

import type {
  DownloadFailureNotice,
  LibraryAlbum,
  LibraryAlbumId,
  LibraryCategory,
} from '../types/library'
import { loadLibraryCategories, hydrateLocalLibraryCoverUrls } from '../services/library-catalog'
import {
  deleteAlbumMedia,
  downloadAlbumMedia,
  listAlbumMusicIds,
  markAlbumAsDownloaded,
  reconcileAlbumsAgainstLocalMedia,
  resolveAlbumIdsForMusic,
  unmarkAlbumAsDownloaded,
} from '../services/library-download'
import { enqueueDownload } from '../services/download-queue-service'

function findAlbum(
  categories: LibraryCategory[],
  albumId: LibraryAlbum['id'],
): LibraryAlbum | null {
  const key = String(albumId)
  for (const category of categories) {
    const album = category.albums.find((item) => String(item.id) === key)
    if (album) return album
  }
  return null
}

function applyIdleStatus(album: LibraryAlbum) {
  album.status = 'idle'
  album.progress = 0
  album.downloadedCount = 0
  album.progressText = ''
}

function applyDownloadedStatus(album: LibraryAlbum) {
  album.status = 'downloaded'
  album.progress = 100
  album.progressText = ''
}

export const useLocalLibraryStore = defineStore('localLibrary', () => {
  const categories = ref<LibraryCategory[]>([])
  const isLoadingList = ref(false)
  const isDownloadingBatch = ref(false)
  const cancelBatchRequested = ref(false)
  const lastErrorKey = ref<string | null>(null)
  const downloadFailure = ref<DownloadFailureNotice | null>(null)
  const albumDownloadGen = new Map<string, number>()

  const hasIdleAlbums = computed(() =>
    categories.value.some((category) =>
      category.albums.some((album) => album.status === 'idle'),
    ),
  )

  const isAnyDownloading = computed(() =>
    categories.value.some((category) =>
      category.albums.some((album) => album.status === 'downloading'),
    ),
  )

  function clearError() {
    lastErrorKey.value = null
    downloadFailure.value = null
  }

  function setError(key: string) {
    lastErrorKey.value = key
  }

  function setDownloadFailure(notice: DownloadFailureNotice) {
    downloadFailure.value = notice
  }

  /**
   * Marca álbum completo só com cache em memória (zero IPC extra).
   * Evita a saturação que travava os downloads.
   */
  async function reconcileAlbumsForMusic(musicId: number) {
    if (!isDesktopApp()) return
    if (!Number.isFinite(musicId) || musicId <= 0) return

    if (categories.value.length === 0) {
      try {
        categories.value = await loadLibraryCategories()
      } catch {
        return
      }
    }

    const linkedIds = await resolveAlbumIdsForMusic(musicId)
    for (const albumId of linkedIds) {
      const album = findAlbum(categories.value, albumId)
      if (!album || album.isHymnal || album.status === 'downloading') continue

      const musicIds = await listAlbumMusicIds(album)
      if (musicIds.length === 0) continue

      let allCachedDownloaded = true
      for (const id of musicIds) {
        if (peekTrackDownloadCache(id) !== true) {
          allCachedDownloaded = false
          break
        }
      }

      if (allCachedDownloaded) {
        await markAlbumAsDownloaded(album.id)
        applyDownloadedStatus(album)
        continue
      }

      // Se esta faixa foi removida e o álbum estava marcado, desmarca.
      if (
        peekTrackDownloadCache(musicId) === false &&
        album.status === 'downloaded'
      ) {
        await unmarkAlbumAsDownloaded(album.id)
        applyIdleStatus(album)
      }
    }
  }

  /** Mantido por compatibilidade — não há mais varredura em background. */
  function stopBackgroundReconcile() {
    // no-op intencional
  }

  async function refreshCollections() {
    isLoadingList.value = true
    clearError()
    try {
      categories.value = await loadLibraryCategories()
      void hydrateLocalLibraryCoverUrls(categories.value)
    } catch (error) {
      console.error('[sync] falha ao carregar coletâneas', error)
      setError('sync.errors.loadFailed')
      categories.value = []
    } finally {
      isLoadingList.value = false
    }
  }

  /**
   * Marca no manifesto as coletâneas já presentes no disco (import legado)
   * e recarrega a listagem da Central de Mídia.
   */
  async function reconcileFromLocalMedia(
    onProgress?: (current: number, total: number, albumName: string) => void,
  ): Promise<{ checked: number; marked: number }> {
    if (!isDesktopApp()) return { checked: 0, marked: 0 }

    const result = await reconcileAlbumsAgainstLocalMedia(onProgress)
    invalidateTrackMediaCache()
    await refreshCollections()
    return result
  }

  async function downloadAlbum(albumId: LibraryAlbum['id']) {
    const album = findAlbum(categories.value, albumId)
    if (!album || album.status === 'downloading') return null
    if (cancelBatchRequested.value && isDownloadingBatch.value) return null

    clearError()

    const albumKey = String(album.id)
    const gen = (albumDownloadGen.get(albumKey) ?? 0) + 1
    albumDownloadGen.set(albumKey, gen)

    album.status = 'downloading'
    album.progress = 0
    album.totalCount = 0
    album.downloadedCount = 0
    album.cancelRequested = false
    album.progressText = 'sync.progress.preparing'

    const isCurrent = () => albumDownloadGen.get(albumKey) === gen

    // app#338: o download passa pela fila unificada (feedback visual no
    // widget do header). Priority 'user' — pedido na hora pelo usuário.
    const result = await new Promise<Awaited<ReturnType<typeof downloadAlbumMedia>>>((resolve, reject) => {
      enqueueDownload({
        id: `album:${album.id}`,
        label: album.name,
        priority: 'user',
        task: async () => {
          try {
            const res = await downloadAlbumMedia(album, {
              onPrepareProgress: (percent) => {
                if (!isCurrent() || album.cancelRequested) return
                album.progress = percent
                album.progressText = 'sync.progress.preparing'
              },
              onDownloadProgress: (downloaded, total, percent) => {
                if (!isCurrent() || album.cancelRequested) return
                album.downloadedCount = downloaded
                album.totalCount = total
                album.progress = percent
                album.progressText = 'sync.progress.downloading'
              },
              shouldAbort: () =>
                !isCurrent() ||
                album.cancelRequested ||
                (isDownloadingBatch.value && cancelBatchRequested.value),
            })
            resolve(res)
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        },
      })
    })

    if (!isCurrent() || album.cancelRequested) {
        if (isCurrent()) {
          applyIdleStatus(album)
          album.progressText = 'sync.progress.cancelled'
        }
        return 'idle' as const
      }

    if (result.status === 'downloaded') {
      album.status = 'downloaded'
      album.progress = 100
      album.progressText = ''
      return result.status
    }

    if (result.status === 'idle') {
      album.status = 'idle'
      album.progress = 0
      album.progressText =
        result.failureReason === 'cancelled' ? 'sync.progress.cancelled' : ''
      return result.status
    }

    album.status = 'error'
    album.progressText =
      result.failureReason === 'offline'
        ? 'sync.progress.offline'
        : 'sync.progress.serverError'

    if (!isDownloadingBatch.value) {
      if (result.failureReason === 'offline') {
        setDownloadFailure({ reason: 'offline', failedCount: result.totalErrors })
      } else if (result.failureReason === 'server') {
        setDownloadFailure({
          reason: 'server',
          failedCount: Math.max(1, result.totalErrors),
        })
      } else {
        setDownloadFailure({ reason: 'unknown', failedCount: result.totalErrors })
      }
    }

    return result.status
  }

  async function downloadAllIdleAlbums() {
    if (!hasIdleAlbums.value || isDownloadingBatch.value) return

    isDownloadingBatch.value = true
    cancelBatchRequested.value = false
    clearError()

    try {
      outer: for (const category of categories.value) {
        for (const album of category.albums) {
          if (cancelBatchRequested.value) break outer
          if (album.status !== 'idle') continue

          const status = await downloadAlbum(album.id)

          if (status === 'error' && !navigator.onLine) {
            cancelBatchRequested.value = true
            setDownloadFailure({ reason: 'batchOffline', failedCount: 0 })
            break outer
          }
        }
      }
    } finally {
      isDownloadingBatch.value = false
      cancelBatchRequested.value = false
    }
  }

  function cancelAlbum(albumId: LibraryAlbumId) {
    const album = findAlbum(categories.value, albumId)
    if (!album || album.status !== 'downloading') return
    const albumKey = String(album.id)
    albumDownloadGen.set(albumKey, (albumDownloadGen.get(albumKey) ?? 0) + 1)
    album.cancelRequested = true
    applyIdleStatus(album)
    album.progressText = 'sync.progress.cancelled'
  }

  function cancelAllDownloads() {
    cancelBatchRequested.value = true
    for (const category of categories.value) {
      for (const album of category.albums) {
        if (album.status === 'downloading') {
          const albumKey = String(album.id)
          albumDownloadGen.set(
            albumKey,
            (albumDownloadGen.get(albumKey) ?? 0) + 1,
          )
          album.cancelRequested = true
          applyIdleStatus(album)
          album.progressText = 'sync.progress.cancelled'
        }
      }
    }
  }

  async function removeAlbum(albumId: LibraryAlbum['id']) {
    const album = findAlbum(categories.value, albumId)
    if (!album || album.status !== 'downloaded') return

    await deleteAlbumMedia(album)
    applyIdleStatus(album)
  }

  return {
    categories,
    isLoadingList,
    isDownloadingBatch,
    lastErrorKey,
    downloadFailure,
    hasIdleAlbums,
    isAnyDownloading,
    clearError,
    refreshCollections,
    reconcileFromLocalMedia,
    reconcileAlbumsForMusic,
    stopBackgroundReconcile,
    downloadAlbum,
    downloadAllIdleAlbums,
    cancelAlbum,
    cancelAllDownloads,
    removeAlbum,
  }
})
