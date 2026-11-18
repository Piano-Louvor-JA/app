import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'

import type { YoutubeHistoryInput } from './youtube-history'

/** Vídeo dentro de uma coletânea online. */
export type YoutubeCollectionVideo = {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  durationText: string
  addedAt: number
}

/** Coletânea online: lista de vídeos do YouTube, na ordem escolhida pelo operador. */
export type YoutubeCollection = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  videos: YoutubeCollectionVideo[]
}

export const YOUTUBE_COLLECTION_NAME_MAX = 80
export const YOUTUBE_COLLECTION_VIDEOS_MAX = 500

const VIDEO_ID = /^[\w-]{11}$/

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function sanitizeVideo(raw: unknown): YoutubeCollectionVideo | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const videoId = str(item.videoId)
  if (!VIDEO_ID.test(videoId)) return null
  return {
    videoId,
    title: str(item.title) || videoId,
    channel: str(item.channel),
    thumbnail: str(item.thumbnail),
    durationText: str(item.durationText),
    addedAt: num(item.addedAt),
  }
}

function sanitizeCollection(raw: unknown): YoutubeCollection | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = str(item.id)
  const name = str(item.name).trim()
  if (!id || !name) return null
  const seen = new Set<string>()
  const videos: YoutubeCollectionVideo[] = []
  for (const v of Array.isArray(item.videos) ? item.videos : []) {
    const video = sanitizeVideo(v)
    if (!video || seen.has(video.videoId)) continue
    seen.add(video.videoId)
    videos.push(video)
  }
  return { id, name, createdAt: num(item.createdAt), updatedAt: num(item.updatedAt), videos }
}

/** Coletâneas salvas, na ordem em que foram criadas. Dado inválido é descartado. */
export function listYoutubeCollections(): YoutubeCollection[] {
  const raw = getBrowserItem<unknown>(BROWSER_STORAGE_KEYS.youtubeCollections, [])
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: YoutubeCollection[] = []
  for (const item of raw) {
    const collection = sanitizeCollection(item)
    if (!collection || seen.has(collection.id)) continue
    seen.add(collection.id)
    list.push(collection)
  }
  return list
}

function save(list: YoutubeCollection[]): YoutubeCollection[] {
  setBrowserItem(BROWSER_STORAGE_KEYS.youtubeCollections, list)
  return list
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, YOUTUBE_COLLECTION_NAME_MAX)
}

function newId(now: number): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12)
  return `yc-${now.toString(36)}-${random}`
}

/** Cria a coletânea; `null` quando o nome fica vazio. */
export function createYoutubeCollection(name: string, now = Date.now()): { list: YoutubeCollection[]; created: YoutubeCollection | null } {
  const clean = cleanName(name)
  const list = listYoutubeCollections()
  if (!clean) return { list, created: null }
  const created: YoutubeCollection = { id: newId(now), name: clean, createdAt: now, updatedAt: now, videos: [] }
  return { list: save([...list, created]), created }
}

function update(id: string, change: (collection: YoutubeCollection) => YoutubeCollection | null, now: number): YoutubeCollection[] {
  const list = listYoutubeCollections()
  const index = list.findIndex((c) => c.id === id)
  if (index < 0) return list
  const next = change(list[index])
  if (!next) return list
  const copy = [...list]
  copy[index] = { ...next, updatedAt: now }
  return save(copy)
}

export function renameYoutubeCollection(id: string, name: string, now = Date.now()): YoutubeCollection[] {
  const clean = cleanName(name)
  return update(id, (c) => (clean && clean !== c.name ? { ...c, name: clean } : null), now)
}

export function deleteYoutubeCollection(id: string): YoutubeCollection[] {
  return save(listYoutubeCollections().filter((c) => c.id !== id))
}

export function collectionHasVideo(collection: YoutubeCollection, videoId: string): boolean {
  return collection.videos.some((v) => v.videoId === videoId)
}

/** Adiciona no fim da coletânea; vídeo repetido não entra de novo. */
export function addVideoToYoutubeCollection(id: string, input: YoutubeHistoryInput, now = Date.now()): YoutubeCollection[] {
  if (!VIDEO_ID.test(input.videoId)) return listYoutubeCollections()
  return update(id, (c) => {
    if (collectionHasVideo(c, input.videoId) || c.videos.length >= YOUTUBE_COLLECTION_VIDEOS_MAX) return null
    const video: YoutubeCollectionVideo = {
      videoId: input.videoId,
      title: input.title?.trim() || input.videoId,
      channel: input.channel?.trim() || '',
      thumbnail: input.thumbnail || '',
      durationText: input.durationText || '',
      addedAt: now,
    }
    return { ...c, videos: [...c.videos, video] }
  }, now)
}

/** Vários de uma vez (importar playlist): na ordem dada, sem repetir, até o limite. */
export function addVideosToYoutubeCollection(id: string, inputs: YoutubeHistoryInput[], now = Date.now()): YoutubeCollection[] {
  return update(id, (c) => {
    const seen = new Set(c.videos.map((v) => v.videoId))
    const videos = [...c.videos]
    for (const input of inputs) {
      if (videos.length >= YOUTUBE_COLLECTION_VIDEOS_MAX) break
      if (!VIDEO_ID.test(input.videoId) || seen.has(input.videoId)) continue
      seen.add(input.videoId)
      videos.push({
        videoId: input.videoId,
        title: input.title?.trim() || input.videoId,
        channel: input.channel?.trim() || '',
        thumbnail: input.thumbnail || '',
        durationText: input.durationText || '',
        addedAt: now,
      })
    }
    return videos.length === c.videos.length ? null : { ...c, videos }
  }, now)
}

export function removeVideoFromYoutubeCollection(id: string, videoId: string, now = Date.now()): YoutubeCollection[] {
  return update(id, (c) => (collectionHasVideo(c, videoId) ? { ...c, videos: c.videos.filter((v) => v.videoId !== videoId) } : null), now)
}

/** Move o vídeo uma posição para cima (-1) ou para baixo (+1). */
export function moveVideoInYoutubeCollection(id: string, videoId: string, delta: -1 | 1, now = Date.now()): YoutubeCollection[] {
  return update(id, (c) => {
    const from = c.videos.findIndex((v) => v.videoId === videoId)
    const to = from + delta
    if (from < 0 || to < 0 || to >= c.videos.length) return null
    const videos = [...c.videos]
    const [moved] = videos.splice(from, 1)
    videos.splice(to, 0, moved)
    return { ...c, videos }
  }, now)
}
