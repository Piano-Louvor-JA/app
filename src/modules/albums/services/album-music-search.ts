import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

import type { AlbumSearchHit } from '../types/albums'
import { formatCatalogDuration } from './album-tracks'

type CatalogMusicAlbum = {
  id_album?: number | string
  name?: string
  track?: number | string | null
  type?: string
  pivot?: {
    track?: number | string | null
  } | null
}

type CatalogMusicIndexRow = {
  id_music?: number | string
  name?: string
  track?: number | string | null
  duration?: number | string | null
  has_instrumental_music?: number | string | boolean | null
  url_instrumental_music?: string | null
  albums?: CatalogMusicAlbum[]
  albums_names?: string
}

async function readOrFetchCatalog<T>(filename: string): Promise<T | null> {
  const local = await readCatalogRecord<T>(filename)
  if (local != null) return local
  try {
    return await fetchRemoteCatalogJson<T>(filename)
  } catch (error) {
    console.warn(`[albums] falha ao obter índice ${filename}`, error)
    return null
  }
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function hasInstrumentalFlag(row: CatalogMusicIndexRow): boolean {
  if (row.has_instrumental_music === true || row.has_instrumental_music === 1) {
    return true
  }
  if (row.has_instrumental_music === '1') return true
  return Boolean(String(row.url_instrumental_music ?? '').trim())
}

function joinAlbumNames(row: CatalogMusicIndexRow): string {
  const fromField = String(row.albums_names ?? '').trim()
  if (fromField) return fromField
  const fromAlbums = (row.albums ?? [])
    .map((album) => String(album.name ?? '').trim())
    .filter(Boolean)
  return fromAlbums.join(', ')
}

function albumTrackNumber(album: CatalogMusicAlbum): number | null {
  return asNumber(album.pivot?.track ?? album.track)
}

function isHymnalAlbum(album: CatalogMusicAlbum): boolean {
  const type = String(album.type ?? '').toLowerCase()
  if (type === 'hymnal' || type === 'hymnal_1996') return true
  const name = String(album.name ?? '')
  return name.includes('Hinário Adventista')
}

function collectHymnalTracks(row: CatalogMusicIndexRow): number[] {
  const tracks: number[] = []
  for (const album of row.albums ?? []) {
    if (!isHymnalAlbum(album)) continue
    const track = albumTrackNumber(album)
    if (track != null && track > 0) tracks.push(track)
  }
  return tracks
}

function preferredHymnalTrack(
  row: CatalogMusicIndexRow,
  hymnalTracks: number[],
): { track: number | null; isHymnal: boolean } {
  // Preferência: Hinário atual → 1996 → qualquer.
  for (const album of row.albums ?? []) {
    if (!isHymnalAlbum(album)) continue
    const name = String(album.name ?? '')
    if (name.includes('Hinário Adventista') && !name.includes('1996')) {
      const track = albumTrackNumber(album)
      if (track != null && track > 0) return { track, isHymnal: true }
    }
  }
  for (const album of row.albums ?? []) {
    if (!isHymnalAlbum(album)) continue
    const track = albumTrackNumber(album)
    if (track != null && track > 0) return { track, isHymnal: true }
  }

  /* v8 ignore next 3 -- se algum hinário tem track>0 os loops acima já retornaram */
  if (hymnalTracks[0] != null) {
    return { track: hymnalTracks[0], isHymnal: true }
  }

  const albumNames = joinAlbumNames(row)
  const looksHymnal = albumNames.includes('Hinário Adventista')
  const fallback = asNumber(row.track)
  if (looksHymnal && fallback != null && fallback > 0) {
    return { track: fallback, isHymnal: true }
  }

  return { track: null, isHymnal: false }
}

function mapMusicIndexRow(row: CatalogMusicIndexRow): AlbumSearchHit | null {
  const musicId = asNumber(row.id_music)
  if (musicId == null || musicId <= 0) return null

  const name = String(row.name ?? '').trim()
  if (!name) return null

  const hymnalTracks = collectHymnalTracks(row)
  const { track, isHymnal } = preferredHymnalTrack(row, hymnalTracks)
  const albumNames = joinAlbumNames(row) || 'Música'

  return {
    musicId,
    name,
    track,
    durationLabel: formatCatalogDuration(row.duration),
    hasInstrumental: hasInstrumentalFlag(row),
    albumNames,
    displayTitle: name,
    isHymnal,
    hymnalTracks: [...new Set(hymnalTracks)],
  }
}

function mergeHits(a: AlbumSearchHit, b: AlbumSearchHit): AlbumSearchHit {
  const hymnalTracks = [...new Set([...a.hymnalTracks, ...b.hymnalTracks])]
  const track = a.track ?? b.track ?? hymnalTracks[0] ?? null
  return {
    ...a,
    track,
    isHymnal: a.isHymnal || b.isHymnal || track != null,
    albumNames: a.albumNames.includes(b.albumNames)
      ? a.albumNames
      : [a.albumNames, b.albumNames].filter(Boolean).join(', '),
    hasInstrumental: a.hasInstrumental || b.hasInstrumental,
    hymnalTracks,
  }
}

/** Carrega o índice global de músicas (prefixado por idioma). */
export async function loadAlbumMusicIndex(): Promise<AlbumSearchHit[]> {
  const langPrefix = getCurrentApiPrefix()
  const rows = await readOrFetchCatalog<CatalogMusicIndexRow[]>(`${langPrefix}_musics`)
  if (!Array.isArray(rows) || rows.length === 0) return []

  const byId = new Map<number, AlbumSearchHit>()
  for (const row of rows) {
    const mapped = mapMusicIndexRow(row)
    if (!mapped) continue
    const existing = byId.get(mapped.musicId)
    byId.set(
      mapped.musicId,
      existing ? mergeHits(existing, mapped) : mapped,
    )
  }

  return [...byId.values()]
}

/**
 * Busca estilo Home legado: nome, álbum ou número do hinário (máx. 50).
 * Número prioriza Hinário Adventista atual, depois 1996.
 */
export function filterAlbumMusicIndex(
  index: AlbumSearchHit[],
  query: string,
): AlbumSearchHit[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []

  const isNum = /^\d+$/.test(trimmed)
  const numQuery = isNum ? Number(trimmed) : null

  let results = index.filter((entry) => {
    const title = entry.name.toLowerCase()
    const album = entry.albumNames.toLowerCase()
    if (isNum && numQuery != null) {
      return (
        entry.track === numQuery ||
        (entry.hymnalTracks ?? []).includes(numQuery) ||
        title.includes(trimmed) ||
        album.includes(trimmed)
      )
    }
    return title.includes(trimmed) || album.includes(trimmed)
  })

  if (isNum && numQuery != null) {
    // Exibe o número buscado quando a faixa tem esse track no hinário.
    results = results.map((entry) => {
      if (
        !(entry.hymnalTracks ?? []).includes(numQuery) &&
        entry.track !== numQuery
      ) {
        return entry
      }
      return {
        ...entry,
        track: numQuery,
        isHymnal: true,
      }
    })

    results = [...results].sort((a, b) => {
      const score = (entry: AlbumSearchHit) => {
        const hasNumber =
          entry.track === numQuery ||
          (entry.hymnalTracks ?? []).includes(numQuery)
        if (!hasNumber) return 0
        if (
          entry.albumNames.includes('Hinário Adventista') &&
          !entry.albumNames.includes('1996')
        ) {
          return 2
        }
        if (entry.albumNames.includes('Hinário Adventista 1996')) {
          return 1
        }
        return 0
      }
      return score(b) - score(a)
    })
  }

  return results.slice(0, 50)
}
