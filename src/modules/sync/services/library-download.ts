import { getCurrentApiPrefix } from './library-catalog'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord, writeCatalogRecord } from '@shared/services/workspace-api'

import type {
  CatalogAlbumRecord,
  CatalogHymnalEntry,
  CatalogMusicRecord,
  DownloadFailureReason,
  LibraryAlbum,
  MediaDownloadItem,
} from '../types/library'
import {
  readDownloadedAlbumIds,
  writeDownloadedAlbumIds,
} from './library-catalog'
import { toRelativeMediaPath } from './media-paths'

const DOWNLOAD_BATCH_SIZE = 5
const MAX_CONSECUTIVE_ERRORS = 3

/** Lê registro local; se faltar, busca na API Piano e cacheia em .sysdata. */
async function readOrFetchCatalogRecord<T>(filename: string): Promise<T | null> {
  const local = await readCatalogRecord<T>(filename)
  if (local != null) return local

  try {
    const remote = await fetchRemoteCatalogJson<T>(filename)
    await writeCatalogRecord(filename, remote)
    return remote
  } catch (error) {
    console.warn(`[sync] falha ao obter catálogo ${filename}`, error)
    void import('@shared/services/telemetry').then(({ reportError }) =>
      reportError(error, { scope: 'catalog-fetch', filename }),
    )
    return null
  }
}

function collectLyricImageUrls(music: CatalogMusicRecord): string[] {
  if (!music.lyric) return []

  const entries = Array.isArray(music.lyric)
    ? music.lyric
    : Object.values(music.lyric)

  return entries
    .map((entry) => entry.url_image)
    .filter((url): url is string => Boolean(url))
}

type CollectResult = {
  items: MediaDownloadItem[]
  /** false quando o registro da coletânea/hinário não existe */
  found: boolean
}

type CollectMediaOptions = {
  /**
   * Só faixa vocal (`url_music`) + capa.
   * Usado na reconciliação pós-import legado: o Delphi costuma não ter
   * todos os instrumentais/slides do catálogo atual.
   */
  primaryOnly?: boolean
}

async function collectMediaForAlbum(
  album: LibraryAlbum,
  onSongFetched?: (fetched: number, total: number) => void,
  options: CollectMediaOptions = {},
): Promise<CollectResult> {
  const musicFiles = new Set<string>()
  const slideFiles = new Set<string>()
  const primaryOnly = Boolean(options.primaryOnly)

  let songRefs: Array<{ id_music: number | string }> = []

  if (album.isHymnal) {
    const langPrefix = getCurrentApiPrefix()
    const hymnalData = await readOrFetchCatalogRecord<CatalogHymnalEntry[]>(
      `${langPrefix}_${album.id}`,
    )
    if (!hymnalData || !Array.isArray(hymnalData)) {
      return { items: [], found: false }
    }
    songRefs = hymnalData
  } else {
    const albumData = await readOrFetchCatalogRecord<CatalogAlbumRecord>(
      `album_${album.id}`,
    )
    if (!albumData?.musics || !Array.isArray(albumData.musics)) {
      return { items: [], found: false }
    }
    songRefs = albumData.musics
  }

  const total = songRefs.length
  let fetched = 0

  for (const song of songRefs) {
    fetched += 1
    onSongFetched?.(fetched, total)

    const musicData = await readOrFetchCatalogRecord<CatalogMusicRecord>(
      `music_${song.id_music}`,
    )
    if (!musicData) continue

    if (musicData.url_music) musicFiles.add(musicData.url_music)
    if (!primaryOnly) {
      if (musicData.url_instrumental_music) {
        musicFiles.add(musicData.url_instrumental_music)
      }
      if (musicData.url_image) slideFiles.add(musicData.url_image)
      collectLyricImageUrls(musicData).forEach((url) => slideFiles.add(url))
    }
  }

  const items: MediaDownloadItem[] = [
    ...[...musicFiles].map((url) => ({ url, type: 'music' as const })),
    ...[...slideFiles].map((url) => ({ url, type: 'slides' as const })),
  ]

  if (album.rawCoverUrl) {
    items.push({ url: album.rawCoverUrl, type: 'covers' })
  }

  return { items, found: true }
}

/** IDs das faixas no catálogo (sem checar disco). */
export async function listAlbumMusicIds(
  album: LibraryAlbum,
): Promise<number[]> {
  let songRefs: Array<{ id_music: number | string }> = []

  if (album.isHymnal) {
    const langPrefix = getCurrentApiPrefix()
    const hymnalData = await readOrFetchCatalogRecord<CatalogHymnalEntry[]>(
      `${langPrefix}_${album.id}`,
    )
    if (!hymnalData || !Array.isArray(hymnalData)) return []
    songRefs = hymnalData
  } else {
    const albumData = await readOrFetchCatalogRecord<CatalogAlbumRecord>(
      `album_${album.id}`,
    )
    if (!albumData?.musics || !Array.isArray(albumData.musics)) return []
    songRefs = albumData.musics
  }

  const ids: number[] = []
  for (const song of songRefs) {
    const id = Number(song.id_music)
    if (Number.isFinite(id) && id > 0) ids.push(id)
  }
  return ids
}

/** IDs de coletâneas ligados à faixa no catálogo. */
export async function resolveAlbumIdsForMusic(
  musicId: number,
): Promise<Array<string | number>> {
  if (!Number.isFinite(musicId) || musicId <= 0) return []

  type MusicAlbumsRow = {
    albums?: Array<{ id_album?: number | string }>
  }

  const music = await readOrFetchCatalogRecord<MusicAlbumsRow>(`music_${musicId}`)
  if (!music?.albums || !Array.isArray(music.albums)) return []

  const ids: Array<string | number> = []
  const seen = new Set<string>()
  for (const row of music.albums) {
    const raw = row.id_album
    if (raw == null) continue
    const asNum = Number(raw)
    const id = Number.isFinite(asNum) ? asNum : String(raw)
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)
    ids.push(id)
  }
  return ids
}

export type DownloadProgressHooks = {
  onPrepareProgress: (percent: number) => void
  onDownloadProgress: (downloaded: number, total: number, percent: number) => void
  shouldAbort: () => boolean
}

export type DownloadAlbumResult = {
  status: 'downloaded' | 'idle' | 'error'
  failureReason: DownloadFailureReason
  totalErrors: number
}

export async function markAlbumAsDownloaded(
  albumId: LibraryAlbum['id'],
): Promise<void> {
  const manifest = await readDownloadedAlbumIds()
  const key = String(albumId)
  if (manifest.some((id) => String(id) === key)) return
  manifest.push(albumId)
  await writeDownloadedAlbumIds(manifest)
}

export async function unmarkAlbumAsDownloaded(
  albumId: LibraryAlbum['id'],
): Promise<void> {
  const manifest = await readDownloadedAlbumIds()
  const key = String(albumId)
  await writeDownloadedAlbumIds(manifest.filter((id) => String(id) !== key))
}

/**
 * Baixa mídias de uma coletânea (áudios, slides e capa).
 * Progresso: 0–10% preparação do catálogo; 10–100% download.
 */
export async function downloadAlbumMedia(
  album: LibraryAlbum,
  hooks: DownloadProgressHooks,
): Promise<DownloadAlbumResult> {
  const bridge = getDesktopBridge()
  if (!bridge) {
    return { status: 'error', failureReason: 'unknown', totalErrors: 0 }
  }

  hooks.onPrepareProgress(0)

  const { items: allMediaFiles, found } = await collectMediaForAlbum(
    album,
    (fetched, total) => {
      hooks.onPrepareProgress(Math.floor((fetched / total) * 10))
    },
  )

  if (!found) {
    return { status: 'idle', failureReason: null, totalErrors: 0 }
  }

  if (hooks.shouldAbort()) {
    return { status: 'idle', failureReason: 'cancelled', totalErrors: 0 }
  }

  if (allMediaFiles.length === 0) {
    await markAlbumAsDownloaded(album.id)
    return { status: 'downloaded', failureReason: null, totalErrors: 0 }
  }

  let downloaded = 0
  let consecutiveErrors = 0
  let totalErrors = 0

  hooks.onDownloadProgress(0, allMediaFiles.length, 10)

  for (let index = 0; index < allMediaFiles.length; index += DOWNLOAD_BATCH_SIZE) {
    if (hooks.shouldAbort() || !navigator.onLine) {
      if (!navigator.onLine) totalErrors += 1
      break
    }
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break

    const batch = allMediaFiles.slice(index, index + DOWNLOAD_BATCH_SIZE)

    await Promise.all(
      batch.map(async (media) => {
        /* v8 ignore next 1 -- callbacks do Promise.all rodam o guard antes de qualquer await: consecutiveErrors é 0 no lote (documentado no teste) */
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return

        const relativePath = toRelativeMediaPath(media.url)
        const exists = await bridge.media.check(media.type, relativePath)

        if (!exists) {
          const success = await bridge.media.download(
            media.url,
            media.type,
            relativePath,
          )
          if (!success) {
            consecutiveErrors += 1
            totalErrors += 1
            console.warn(
              `[sync] falha ao baixar: ${relativePath} (${consecutiveErrors} consecutivas)`,
            )
            return
          }
          consecutiveErrors = 0
        }

        downloaded += 1
        const percent = 10 + Math.floor((downloaded / allMediaFiles.length) * 90)
        hooks.onDownloadProgress(downloaded, allMediaFiles.length, percent)
      }),
    )
  }

  const abortedByErrors = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS

  if (abortedByErrors || !navigator.onLine) {
    const failureReason: DownloadFailureReason = !navigator.onLine ? 'offline' : 'server'
    // telemetria: abort de download é evento raro e valioso (bug do vídeo 08/10)
    void import('@shared/services/telemetry').then(({ reportError }) =>
      reportError(new Error(`download abortado (${failureReason})`), {
        album: album.id,
        albumName: album.name,
        failureReason,
        totalErrors,
        totalFiles: allMediaFiles.length,
        downloaded,
        maxConsecutive: MAX_CONSECUTIVE_ERRORS,
      }),
    )
    return {
      status: 'error',
      failureReason,
      totalErrors,
    }
  }

  if (hooks.shouldAbort()) {
    return { status: 'idle', failureReason: 'cancelled', totalErrors }
  }

  if (totalErrors > 0) {
    console.warn(`[sync] coletânea baixada com ${totalErrors} arquivo(s) faltando`)
  }

  await markAlbumAsDownloaded(album.id)
  return { status: 'downloaded', failureReason: null, totalErrors }
}

/**
 * Após importação local (ex.: Louvor JA legado), marca como baixadas as
 * coletâneas cujas faixas principais já existem no workspace — a Central
 * de Mídia só olha o manifesto `downloadedAlbums`, não o disco.
 *
 * Critério alinhado ao download oficial (que marca mesmo com falhas
 * parciais): exige todas as `url_music`; capa/instrumental/slides não
 * bloqueiam.
 */
export async function reconcileAlbumsAgainstLocalMedia(
  onProgress?: (current: number, total: number, albumName: string) => void,
): Promise<{ checked: number; marked: number }> {
  const bridge = getDesktopBridge()
  if (!bridge) return { checked: 0, marked: 0 }

  const { loadLibraryCategories } = await import('./library-catalog')
  const categories = await loadLibraryCategories()
  const albums = categories.flatMap((category) => category.albums)

  let marked = 0
  let checked = 0

  for (const album of albums) {
    checked += 1
    onProgress?.(checked, albums.length, album.name)

    if (album.status === 'downloaded') continue

    const { items, found } = await collectMediaForAlbum(album, undefined, {
      primaryOnly: true,
    })
    if (!found) continue

    const musicItems = items.filter((item) => item.type === 'music')
    if (musicItems.length === 0) continue

    let complete = true
    for (const media of musicItems) {
      const relativePath = toRelativeMediaPath(media.url)
      const exists = await bridge.media.check(media.type, relativePath)
      if (!exists) {
        complete = false
        break
      }
    }

    if (complete) {
      await markAlbumAsDownloaded(album.id)
      marked += 1
    }
  }

  return { checked, marked }
}

/** Remove arquivos de áudio e slides da coletânea (capas permanecem). */
export async function deleteAlbumMedia(album: LibraryAlbum): Promise<void> {
  const bridge = getDesktopBridge()
  if (!bridge) return

  await unmarkAlbumAsDownloaded(album.id)

  try {
    const { items } = await collectMediaForAlbum(album)
    const musicPaths = new Set(
      items.filter((item) => item.type === 'music').map((item) => item.url),
    )
    const slidePaths = new Set(
      items.filter((item) => item.type === 'slides').map((item) => item.url),
    )

    for (const urlPath of musicPaths) {
      await bridge.media.delete('music', toRelativeMediaPath(urlPath))
    }
    for (const urlPath of slidePaths) {
      await bridge.media.delete('slides', toRelativeMediaPath(urlPath))
    }
  } catch (error) {
    console.error('[sync] erro ao apagar arquivos da coletânea', error)
  }
}
