import { readCatalogRecord } from '@shared/services/workspace-api'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'

import type {
  MediaAlbumRef,
  MediaLyricSlide,
  MediaTrackRecord,
} from '../types/media'

type CatalogLyricRow = {
  order?: number | string
  lyric?: string
  show_slide?: number | string | boolean
  time?: string
  instrumental_time?: string
  url_image?: string | null
  image_position?: string | null
}

type CatalogAlbumRow = {
  id_album?: number | string
  name?: string
  track?: number | string | null
  url_image?: string | null
}

type CatalogMusicRow = {
  id_music?: number | string
  name?: string
  duration?: string | number | null
  url_music?: string | null
  url_instrumental_music?: string | null
  url_image?: string | null
  image_position?: string | null
  albums?: CatalogAlbumRow[]
  categories?: string[]
  lyric?: CatalogLyricRow[] | Record<string, CatalogLyricRow>
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseShowSlide(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true
  return false
}

function mapLyricEntries(raw: CatalogMusicRow['lyric']): MediaLyricSlide[] {
  if (!raw) return []

  const rows = Array.isArray(raw) ? raw : Object.values(raw)
  return rows
    .map((row) => ({
      order: asNumber(row.order, 0),
      lyric: asString(row.lyric).trim(),
      showSlide: parseShowSlide(row.show_slide),
      time: asString(row.time, '00:00:00'),
      instrumentalTime: asString(row.instrumental_time, '00:00:00'),
      imageUrl: asNullableString(row.url_image),
      imagePosition: asNullableString(row.image_position),
      isCover: false,
    }))
    .sort((a, b) => a.order - b.order)
}

function mapAlbums(raw: CatalogAlbumRow[] | undefined): MediaAlbumRef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const id = asNumber(row.id_album, NaN)
      if (!Number.isFinite(id)) return null
      const trackRaw = row.track == null ? null : asNumber(row.track, NaN)
      return {
        id,
        name: asString(row.name).trim(),
        track: trackRaw != null && Number.isFinite(trackRaw) ? trackRaw : null,
        imageUrl: asNullableString(row.url_image),
      } satisfies MediaAlbumRef
    })
    .filter((entry): entry is MediaAlbumRef => entry != null)
}

function mapTrack(row: CatalogMusicRow, musicId: number): MediaTrackRecord | null {
  const name = asString(row.name).trim()
  if (!name) return null

  const duration =
    typeof row.duration === 'number' && Number.isFinite(row.duration)
      ? String(row.duration)
      : asString(row.duration, '0:00')

  return {
    id: asNumber(row.id_music, musicId),
    name,
    durationLabel: duration,
    audioUrl: asNullableString(row.url_music),
    instrumentalUrl: asNullableString(row.url_instrumental_music),
    coverUrl: asNullableString(row.url_image),
    coverPosition: asNullableString(row.image_position),
    albums: mapAlbums(row.albums),
    categories: Array.isArray(row.categories)
      ? row.categories.filter((item): item is string => typeof item === 'string')
      : [],
    lyrics: mapLyricEntries(row.lyric),
  }
}

export async function loadMediaTrack(
  musicId: number,
): Promise<MediaTrackRecord | null> {
  if (!Number.isFinite(musicId) || musicId <= 0) return null

  const local = await readCatalogRecord<CatalogMusicRow>(`music_${musicId}`)
  // Fallback remoto: faixa nova (ex: Infantis/Doxologia 90xxx) pode não estar
  // no cache local ainda — busca do backend antes de desistir (trackMissing).
  const row =
    local ?? (await fetchRemoteCatalogJson<CatalogMusicRow>(`music_${musicId}`))
  if (!row) return null
  return mapTrack(row, musicId)
}

export function resolveAlbumSubtitle(
  track: MediaTrackRecord,
  albumId: number | null,
): string {
  if (track.albums.length === 0) return ''

  const preferred =
    albumId != null
      ? track.albums.find((album) => album.id === albumId)
      : undefined

  return (preferred ?? track.albums[0])?.name ?? ''
}
