import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import {
  listCustomMusics,
  fromCustomCollectionId,
  fromCustomMusicId,
  isCustomMusicId,
  loadCustomMusicTrack,
  toCustomMusicId,
} from '@modules/media/services/custom-catalog'

import type {
  AlbumCollection,
  AlbumLyricDocument,
  AlbumLyricLine,
  AlbumTrack,
} from '../types/albums'

type CatalogTrackRow = {
  id_music?: number | string
  name?: string
  track?: number | string | null
  duration?: number | string | null
  has_instrumental_music?: number | string | boolean | null
  url_instrumental_music?: string | null
}

type CatalogAlbumRecord = {
  name?: string
  musics?: CatalogTrackRow[]
}

type CatalogLyricRow = {
  order?: number | string
  lyric?: string
  show_slide?: number | string | boolean
}

type CatalogMusicRecord = {
  id_music?: number | string
  name?: string
  url_instrumental_music?: string | null
  lyric?: CatalogLyricRow[] | Record<string, CatalogLyricRow>
}

async function readOrFetchCatalog<T>(filename: string): Promise<T | null> {
  const local = await readCatalogRecord<T>(filename)
  if (local != null) return local

  try {
    return await fetchRemoteCatalogJson<T>(filename)
  } catch (error) {
    console.warn(`[albums] falha ao obter faixas ${filename}`, error)
    return null
  }
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function hasInstrumentalFlag(row: CatalogTrackRow): boolean {
  if (row.has_instrumental_music === true || row.has_instrumental_music === 1) {
    return true
  }
  if (row.has_instrumental_music === '1') return true
  return Boolean(row.url_instrumental_music?.trim())
}

/** Formata duração do catálogo (segundos, MM:SS ou HH:MM:SS). */
export function formatCatalogDuration(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const total = Math.floor(raw)
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  if (typeof raw !== 'string') return '—'
  const trimmed = raw.trim()
  if (!trimmed) return '—'

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part))) return trimmed
    if (parts.length === 3) {
      const total = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return `${minutes}:${String(seconds).padStart(2, '0')}`
    }
    if (parts.length === 2) {
      return `${parts[0]}:${String(parts[1] ?? 0).padStart(2, '0')}`
    }
    return trimmed
  }

  const asSec = Number(trimmed)
  if (!Number.isFinite(asSec) || asSec <= 0) return '—'
  const minutes = Math.floor(asSec / 60)
  const seconds = Math.floor(asSec % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function mapTrackRow(row: CatalogTrackRow): AlbumTrack | null {
  const musicId = asNumber(row.id_music)
  if (musicId == null || musicId <= 0) return null

  const name = String(row.name ?? '').trim()
  if (!name) return null

  const trackNumber = asNumber(row.track)

  return {
    musicId,
    name,
    track: trackNumber != null && trackNumber > 0 ? trackNumber : null,
    durationLabel: formatCatalogDuration(row.duration),
    hasInstrumental: hasInstrumentalFlag(row),
  }
}

/** Quando o catálogo não traz sequência válida, usa a ordem da lista (1, 2, 3…). */
function withFallbackTrackNumbers(tracks: AlbumTrack[]): AlbumTrack[] {
  return tracks.map((track, index) => {
    if (track.track != null && track.track > 0) return track
    return { ...track, track: index + 1 }
  })
}

/** Formata duração da API para m:ss (mesma regra do custom-catalog). */
function formatDurationLabel(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number') {
    const m = Math.floor(value / 60)
    const s = Math.floor(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  const raw = String(value).trim()
  const parts = raw.split(':').map(Number)
  if (parts.length === 3) {
    return `${parts[0]! * 60 + parts[1]!}:${String(parts[2] ?? 0).padStart(2, '0')}`
  }
  if (parts.length === 2) {
    return `${parts[0]}:${String(parts[1] ?? 0).padStart(2, '0')}`
  }
  return raw
}

export async function loadCollectionTracks(
  collection: AlbumCollection,
): Promise<AlbumTrack[]> {
  // Minhas Coletâneas (custom): faixas via API /v1/custom. Link de hino
  // oficial vira musicId sem offset (dispatcher do media store resolve).
  if (collection.isCustom) {
    const customId = fromCustomCollectionId(Number(collection.id))
    const musics = await listCustomMusics(customId)
    return musics.map((music, index) => ({
      musicId:
        music.officialMusicId != null
          ? music.officialMusicId
          : toCustomMusicId(music.id),
      name: music.name ?? `Hino oficial #${music.officialMusicId ?? music.id}`,
      track: index + 1,
      durationLabel: music.duration != null ? formatDurationLabel(music.duration) : '—',
      hasInstrumental: false,
    }))
  }

  if (collection.kind === 'hymnal') {
    const rows = await readOrFetchCatalog<CatalogTrackRow[]>(collection.catalogKey)
    if (!Array.isArray(rows)) return []
    return withFallbackTrackNumbers(
      rows
        .map(mapTrackRow)
        .filter((track): track is AlbumTrack => track != null)
        .sort((a, b) => (a.track ?? a.musicId) - (b.track ?? b.musicId)),
    )
  }

  const album = await readOrFetchCatalog<CatalogAlbumRecord>(collection.catalogKey)
  const rows = album?.musics
  if (!Array.isArray(rows)) return []

  return withFallbackTrackNumbers(
    rows
      .map(mapTrackRow)
      .filter((track): track is AlbumTrack => track != null)
      .sort((a, b) => (a.track ?? a.musicId) - (b.track ?? b.musicId)),
  )
}

export function filterAlbumTracks(
  tracks: AlbumTrack[],
  query: string,
): AlbumTrack[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return tracks

  return tracks.filter((track) => {
    const trackLabel = track.track != null ? String(track.track) : ''
    return (
      trackLabel.includes(normalized) ||
      track.name.toLowerCase().includes(normalized) ||
      String(track.musicId).includes(normalized)
    )
  })
}

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export async function loadAlbumLyric(
  musicId: number,
): Promise<AlbumLyricDocument | null> {
  if (!Number.isFinite(musicId) || musicId === 0) return null

  // Custom (1M+) e local (id negativo) não existem como `music_<id>` oficial.
  if (musicId < 0 || isCustomMusicId(musicId)) {
    const rawId = musicId < 0 ? musicId : fromCustomMusicId(musicId)
    const track = await loadCustomMusicTrack(rawId)
    if (!track) return null
    const lines: AlbumLyricLine[] = track.lyrics
      .map((slide, index) => ({
        order: slide.order ?? index + 1,
        text: stripHtml(String(slide.lyric ?? '')),
      }))
      .filter((line) => line.text.length > 0)
      .sort((a, b) => a.order - b.order)
    if (lines.length === 0) return null
    return {
      musicId,
      title: track.name.trim() || `music_${musicId}`,
      lines,
    }
  }

  const record = await readOrFetchCatalog<CatalogMusicRecord>(`music_${musicId}`)
  if (!record) return null

  const raw = record.lyric
  const rows = Array.isArray(raw) ? raw : raw ? Object.values(raw) : []

  const lines: AlbumLyricLine[] = rows
    .map((row) => ({
      order: asNumber(row.order) ?? 0,
      text: stripHtml(String(row.lyric ?? '')),
    }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.order - b.order)

  return {
    musicId,
    title: String(record.name ?? '').trim() || `music_${musicId}`,
    lines,
  }
}
