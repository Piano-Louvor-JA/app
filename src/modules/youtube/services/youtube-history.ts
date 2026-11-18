import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'

/** Vídeo tocado pelo módulo YouTube. */
export type YoutubeHistoryEntry = {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  durationText: string
  /** Última vez que tocou (ms). */
  playedAt: number
  playCount: number
}

export type YoutubeHistoryInput = Pick<YoutubeHistoryEntry, 'videoId' | 'title'> &
  Partial<Pick<YoutubeHistoryEntry, 'channel' | 'thumbnail' | 'durationText'>>

export const YOUTUBE_HISTORY_MAX = 300
export const YOUTUBE_RECENT_QUERIES_MAX = 10

const VIDEO_ID = /^[\w-]{11}$/

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sanitize(raw: unknown): YoutubeHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const videoId = str(item.videoId)
  if (!VIDEO_ID.test(videoId)) return null
  const playedAt = Number(item.playedAt)
  const playCount = Number(item.playCount)
  return {
    videoId,
    title: str(item.title) || videoId,
    channel: str(item.channel),
    thumbnail: str(item.thumbnail),
    durationText: str(item.durationText),
    playedAt: Number.isFinite(playedAt) && playedAt > 0 ? playedAt : 0,
    playCount: Number.isFinite(playCount) && playCount > 0 ? Math.floor(playCount) : 1,
  }
}

/** Histórico salvo, do mais recente para o mais antigo. Entradas inválidas são descartadas. */
export function listYoutubeHistory(): YoutubeHistoryEntry[] {
  const raw = getBrowserItem<unknown>(BROWSER_STORAGE_KEYS.youtubeHistory, [])
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: YoutubeHistoryEntry[] = []
  for (const item of raw) {
    const entry = sanitize(item)
    if (!entry || seen.has(entry.videoId)) continue
    seen.add(entry.videoId)
    list.push(entry)
  }
  return list.sort((a, b) => b.playedAt - a.playedAt)
}

function save(list: YoutubeHistoryEntry[]): YoutubeHistoryEntry[] {
  const trimmed = list.slice(0, YOUTUBE_HISTORY_MAX)
  setBrowserItem(BROWSER_STORAGE_KEYS.youtubeHistory, trimmed)
  return trimmed
}

/** Registra que o vídeo tocou: sobe para o topo e soma uma reprodução. */
export function recordYoutubePlay(input: YoutubeHistoryInput, now = Date.now()): YoutubeHistoryEntry[] {
  if (!VIDEO_ID.test(input.videoId)) return listYoutubeHistory()
  const list = listYoutubeHistory()
  const previous = list.find((entry) => entry.videoId === input.videoId)
  const entry: YoutubeHistoryEntry = {
    videoId: input.videoId,
    title: input.title?.trim() || previous?.title || input.videoId,
    channel: input.channel?.trim() || previous?.channel || '',
    thumbnail: input.thumbnail || previous?.thumbnail || '',
    durationText: input.durationText || previous?.durationText || '',
    playedAt: now,
    playCount: (previous?.playCount ?? 0) + 1,
  }
  return save([entry, ...list.filter((item) => item.videoId !== input.videoId)])
}

export function removeYoutubeHistoryEntry(videoId: string): YoutubeHistoryEntry[] {
  return save(listYoutubeHistory().filter((entry) => entry.videoId !== videoId))
}

export function clearYoutubeHistory(): YoutubeHistoryEntry[] {
  return save([])
}

/** Últimas buscas (mais recente primeiro, sem repetir ignorando maiúsculas). */
export function listYoutubeRecentQueries(): string[] {
  const raw = getBrowserItem<unknown>(BROWSER_STORAGE_KEYS.youtubeRecentQueries, [])
  if (!Array.isArray(raw)) return []
  return raw.filter((q): q is string => typeof q === 'string' && q.trim() !== '').slice(0, YOUTUBE_RECENT_QUERIES_MAX)
}

export function rememberYoutubeQuery(query: string): string[] {
  const q = query.trim()
  if (!q) return listYoutubeRecentQueries()
  const next = [q, ...listYoutubeRecentQueries().filter((item) => item.toLowerCase() !== q.toLowerCase())]
    .slice(0, YOUTUBE_RECENT_QUERIES_MAX)
  setBrowserItem(BROWSER_STORAGE_KEYS.youtubeRecentQueries, next)
  return next
}

export function forgetYoutubeQuery(query: string): string[] {
  const next = listYoutubeRecentQueries().filter((item) => item !== query)
  setBrowserItem(BROWSER_STORAGE_KEYS.youtubeRecentQueries, next)
  return next
}

/** Filtro do histórico por título ou canal, sem acento e com todos os termos (AND). */
export function filterYoutubeHistory<T extends Pick<YoutubeHistoryEntry, 'title' | 'channel'>>(list: T[], query: string): T[] {
  const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return list
  return list.filter((entry) => {
    const haystack = fold(`${entry.title} ${entry.channel}`)
    return terms.every((term) => haystack.includes(term))
  })
}

/* ---------- Favoritos ---------- */

/** Vídeo favorito: mesmos dados do histórico; `playedAt` aqui é quando foi favoritado. */
export type YoutubeFavoriteEntry = Omit<YoutubeHistoryEntry, 'playCount'>

export const YOUTUBE_FAVORITES_MAX = 500

export function listYoutubeFavorites(): YoutubeFavoriteEntry[] {
  const raw = getBrowserItem<unknown>(BROWSER_STORAGE_KEYS.youtubeFavorites, [])
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: YoutubeFavoriteEntry[] = []
  for (const item of raw) {
    const entry = sanitize(item)
    if (!entry || seen.has(entry.videoId)) continue
    seen.add(entry.videoId)
    const { playCount: _ignored, ...favorite } = entry
    list.push(favorite)
  }
  return list
}

function saveFavorites(list: YoutubeFavoriteEntry[]): YoutubeFavoriteEntry[] {
  const trimmed = list.slice(0, YOUTUBE_FAVORITES_MAX)
  setBrowserItem(BROWSER_STORAGE_KEYS.youtubeFavorites, trimmed)
  return trimmed
}

export function isYoutubeFavorite(list: YoutubeFavoriteEntry[], videoId: string): boolean {
  return list.some((entry) => entry.videoId === videoId)
}

/** Liga/desliga o favorito; ao favoritar, entra no topo da lista. */
export function toggleYoutubeFavorite(input: YoutubeHistoryInput, now = Date.now()): YoutubeFavoriteEntry[] {
  if (!VIDEO_ID.test(input.videoId)) return listYoutubeFavorites()
  const list = listYoutubeFavorites()
  if (isYoutubeFavorite(list, input.videoId)) {
    return saveFavorites(list.filter((entry) => entry.videoId !== input.videoId))
  }
  const entry: YoutubeFavoriteEntry = {
    videoId: input.videoId,
    title: input.title?.trim() || input.videoId,
    channel: input.channel?.trim() || '',
    thumbnail: input.thumbnail || '',
    durationText: input.durationText || '',
    playedAt: now,
  }
  return saveFavorites([entry, ...list])
}

export function removeYoutubeFavorite(videoId: string): YoutubeFavoriteEntry[] {
  return saveFavorites(listYoutubeFavorites().filter((entry) => entry.videoId !== videoId))
}
