import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { CUSTOM_MUSIC_ID_OFFSET } from '@modules/media/services/custom-catalog'

export type TrackMediaKind = 'music' | 'slides' | 'covers'

export type TrackMediaItem = {
  url: string
  type: TrackMediaKind
}

type CatalogLyricRow = {
  url_image?: string | null
}

type CatalogAlbumRow = {
  url_image?: string | null
}

type CatalogMusicRecord = {
  url_music?: string | null
  url_instrumental_music?: string | null
  url_image?: string | null
  albums?: CatalogAlbumRow[]
  lyric?: CatalogLyricRow[] | Record<string, CatalogLyricRow>
}

const downloadedCache = new Map<number, boolean>()

/** Semáforo: evita N linhas abrirem dezenas de media:check juntos. */
let offlineCheckActive = 0
const offlineCheckWaiters: Array<() => void> = []
const MAX_PARALLEL_OFFLINE_CHECKS = 2

async function withOfflineCheckSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (offlineCheckActive >= MAX_PARALLEL_OFFLINE_CHECKS) {
    await new Promise<void>((resolve) => {
      offlineCheckWaiters.push(resolve)
    })
  }
  offlineCheckActive += 1
  try {
    return await fn()
  } finally {
    offlineCheckActive -= 1
    const next = offlineCheckWaiters.shift()
    next?.()
  }
}

/** Lê o cache em memória sem tocar no disco/IPC. */
export function peekTrackDownloadCache(musicId: number): boolean | undefined {
  if (!downloadedCache.has(musicId)) return undefined
  return downloadedCache.get(musicId) === true
}

/** Normaliza path do catálogo para o filename relativo usado no bridge. */
export function toRelativeMediaPath(urlPath: string): string {
  let path = urlPath.trim()
  if (!path) return ''

  // URL absoluta da API: .../file/images/pt/foo.jpg → images/pt/foo.jpg
  path = path.replace(/^https?:\/\/[^/]+\/(?:file\/)?/i, '')
  path = path.replace(/^\/+/, '')
  path = path.replace(/^(musics|images|covers|imagens|capas|musicas)\//i, '')
  return path
}

/** Infere o tipo de pasta a partir do path do catálogo. */
export function mediaTypeFromUrl(urlPath: string): TrackMediaKind {
  const normalized = urlPath.trim().toLowerCase()
  if (
    normalized.includes('/musics/') ||
    normalized.includes('/musicas/') ||
    normalized.startsWith('musics/') ||
    normalized.startsWith('musicas/')
  ) {
    return 'music'
  }
  if (
    normalized.includes('/covers/') ||
    normalized.includes('/capas/') ||
    normalized.startsWith('covers/') ||
    normalized.startsWith('capas/')
  ) {
    return 'covers'
  }
  return 'slides'
}

function pushUnique(
  items: TrackMediaItem[],
  seen: Set<string>,
  url: string | null | undefined,
  fallbackType?: TrackMediaKind,
) {
  const trimmed = typeof url === 'string' ? url.trim() : ''
  if (!trimmed) return

  const type = fallbackType ?? mediaTypeFromUrl(trimmed)
  const relative = toRelativeMediaPath(trimmed)
  if (!relative) return

  const key = `${type}:${relative}`
  if (seen.has(key)) return
  seen.add(key)
  items.push({ url: trimmed, type })
}

function collectLyricImageUrls(music: CatalogMusicRecord): string[] {
  if (!music.lyric) return []

  const entries = Array.isArray(music.lyric)
    ? music.lyric
    : Object.values(music.lyric)

  return entries
    .map((entry) => entry.url_image)
    .filter((url): url is string => Boolean(url?.trim()))
}

async function readMusicRecord(
  musicId: number,
): Promise<CatalogMusicRecord | null> {
  // Fora do catálogo oficial: custom (id >= 1M) e local (id negativo do
  // import .slja). Sem isso o fallback remoto tenta `music_-N` duas vezes
  // antes do áudio data: tocar.
  if (musicId >= CUSTOM_MUSIC_ID_OFFSET || musicId < 0) return null
  const local = await readCatalogRecord<CatalogMusicRecord>(`music_${musicId}`)
  if (local != null) return local

  try {
    return await fetchRemoteCatalogJson<CatalogMusicRecord>(`music_${musicId}`)
  } catch {
    return null
  }
}

/** Coleta áudios, slides e capas associados à faixa. */
export async function collectTrackMediaItems(
  musicId: number,
): Promise<TrackMediaItem[]> {
  const music = await readMusicRecord(musicId)
  if (!music) return []

  const items: TrackMediaItem[] = []
  const seen = new Set<string>()

  pushUnique(items, seen, music.url_music, 'music')
  pushUnique(items, seen, music.url_instrumental_music, 'music')

  // Capa / fundo principal da música (pode estar em images ou covers).
  pushUnique(items, seen, music.url_image)

  for (const url of collectLyricImageUrls(music)) {
    pushUnique(items, seen, url)
  }

  if (Array.isArray(music.albums)) {
    for (const album of music.albums) {
      pushUnique(items, seen, album.url_image)
    }
  }

  return items
}

export function invalidateTrackMediaCache(musicId?: number): void {
  if (musicId == null) {
    downloadedCache.clear()
    return
  }
  downloadedCache.delete(musicId)
}

/**
 * Considera baixada quando áudio principal e todos os slides/capas
 * associados existem localmente.
 */
export async function isTrackMediaDownloaded(musicId: number): Promise<boolean> {
  return withOfflineCheckSlot(async () => {
    if (!isDesktopApp()) return false

    if (downloadedCache.has(musicId)) {
      return downloadedCache.get(musicId) === true
    }

    const bridge = getDesktopBridge()
    if (!bridge) return false

    const items = await collectTrackMediaItems(musicId)
    if (items.length === 0) {
      downloadedCache.set(musicId, false)
      return false
    }

    for (const item of items) {
      const local = await bridge.media.check(
        item.type,
        toRelativeMediaPath(item.url),
      )
      if (!local) {
        downloadedCache.set(musicId, false)
        return false
      }
    }

    downloadedCache.set(musicId, true)
    return true
  })
}

export type TrackMediaDownloadResult =
  | { status: 'downloaded' }
  | { status: 'idle'; reason: 'cancelled' | 'empty' | 'unavailable' }
  | { status: 'error'; reason: 'offline' | 'server' | 'unknown' | 'unavailable' }

function resolveRemoteFileUrl(urlPath: string): string {
  if (/^https?:\/\//i.test(urlPath)) return urlPath
  const cleanPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
  const base = import.meta.env.VITE_URL_FILES ?? 'https://api.pianolouvorja.com.br/file'
  return `${base}/${cleanPath}`
}

export async function downloadTrackMedia(
  musicId: number,
  options?: {
    onProgress?: (percent: number) => void
    shouldAbort?: () => boolean
  },
): Promise<TrackMediaDownloadResult> {
  if (!isDesktopApp()) {
    return { status: 'error', reason: 'unavailable' }
  }

  const bridge = getDesktopBridge()
  if (!bridge) return { status: 'error', reason: 'unavailable' }

  const items = await collectTrackMediaItems(musicId)
  if (items.length === 0) return { status: 'idle', reason: 'empty' }

  let done = 0
  let errors = 0

  for (const item of items) {
    if (options?.shouldAbort?.()) {
      invalidateTrackMediaCache(musicId)
      return { status: 'idle', reason: 'cancelled' }
    }
    if (!navigator.onLine) {
      invalidateTrackMediaCache(musicId)
      return { status: 'error', reason: 'offline' }
    }

    const relative = toRelativeMediaPath(item.url)
    const exists = await bridge.media.check(item.type, relative)
    if (options?.shouldAbort?.()) {
      invalidateTrackMediaCache(musicId)
      return { status: 'idle', reason: 'cancelled' }
    }
    if (!exists) {
      const remoteUrl = resolveRemoteFileUrl(item.url)
      const ok = await bridge.media.download(remoteUrl, item.type, relative)
      if (options?.shouldAbort?.()) {
        invalidateTrackMediaCache(musicId)
        return { status: 'idle', reason: 'cancelled' }
      }
      if (!ok) {
        errors += 1
        console.warn(
          `[track-media] falha ao baixar ${item.type}: ${relative}`,
        )
        continue
      }
    }

    done += 1
    options?.onProgress?.(Math.floor((done / items.length) * 100))
  }

  if (errors > 0) {
    invalidateTrackMediaCache(musicId)
    return { status: 'error', reason: 'server' }
  }

  downloadedCache.set(musicId, true)
  return { status: 'downloaded' }
}

export async function deleteTrackMedia(musicId: number): Promise<void> {
  if (!isDesktopApp()) return

  const bridge = getDesktopBridge()
  if (!bridge) return

  const items = await collectTrackMediaItems(musicId)
  for (const item of items) {
    await bridge.media.delete(item.type, toRelativeMediaPath(item.url))
  }

  downloadedCache.set(musicId, false)
}
