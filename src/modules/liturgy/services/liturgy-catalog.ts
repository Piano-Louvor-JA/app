import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

import type {
  LiturgyBibleBookOption,
  LiturgyMusicOption,
} from '../types/liturgy'

type CatalogHymnalRow = {
  id_music?: number | string
  name?: string
  track?: number | string | null
  duration?: number | string | null
  has_instrumental_music?: number | string | boolean | null
  url_instrumental_music?: string | null
}

type CatalogMusicIndexRow = CatalogHymnalRow & {
  albums?: Array<{ id_album?: number | string; name?: string; track?: number | string | null }>
  albums_names?: string
}

type CatalogAlbumMusicRow = CatalogHymnalRow

type CatalogAlbumRecord = {
  id_album?: number | string
  name?: string
  musics?: CatalogAlbumMusicRow[]
}

type CatalogCategoryAlbum = {
  id_album: number | string
  name?: string
}

type CatalogCategory = {
  albums?: CatalogCategoryAlbum[]
}

type CatalogBibleBookRow = {
  id_bible_book?: number | string
  name?: string
  chapters?: number | string
}

const HYMNAL_SOURCES: Array<{ file: string; albumName: string }> = [
  { file: 'pt_hymnal', albumName: 'Hinário Adventista' },
  { file: 'pt_hymnal_1996', albumName: 'Hinário Adventista 1996' },
]

/** Coletâneas excluídas do catálogo (mesmo critério da biblioteca). */
const EXCLUDED_ALBUM_IDS = new Set([712, 629])

const BOOKS_FILE = 'pt_bible_book'

async function readOrFetchCatalog<T>(filename: string): Promise<T | null> {
  const local = await readCatalogRecord<T>(filename)
  if (local != null) return local

  try {
    return await fetchRemoteCatalogJson<T>(filename)
  } catch (error) {
    console.warn(`[liturgy] falha ao obter catálogo ${filename}`, error)
    return null
  }
}

/** Catálogo hinário usa segundos (número) ou string `HH:MM:SS` / `MM:SS`. */
export function parseCatalogDurationMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw * 1000)
  }

  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part))) return null
    let seconds = 0
    if (parts.length === 3) {
      seconds = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
    } else if (parts.length === 2) {
      seconds = parts[0]! * 60 + parts[1]!
    } else {
      return null
    }
    return seconds > 0 ? Math.round(seconds * 1000) : null
  }

  const asNumber = Number(trimmed)
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null
  return Math.round(asNumber * 1000)
}

function parseTrack(raw: unknown): number | null {
  if (raw == null) return null
  const trackRaw = Number(raw)
  return Number.isFinite(trackRaw) ? trackRaw : null
}

function joinAlbumNames(...parts: Array<string | null | undefined>): string {
  const names = new Set<string>()
  for (const part of parts) {
    if (!part) continue
    for (const name of part.split(/\s*[·|,]\s*/)) {
      const trimmed = name.trim()
      if (trimmed) names.add(trimmed)
    }
  }
  return [...names].join(' · ')
}

function buildDisplayLabel(name: string, hymnalTrack: number | null): string {
  return hymnalTrack != null ? `${hymnalTrack} - ${name}` : name
}

function hasInstrumentalFlag(row: CatalogHymnalRow): boolean {
  if (row.has_instrumental_music === true || row.has_instrumental_music === 1) {
    return true
  }
  if (row.has_instrumental_music === '1') return true
  return Boolean(String(row.url_instrumental_music ?? '').trim())
}

function upsertMusicOption(
  byId: Map<number, LiturgyMusicOption>,
  option: LiturgyMusicOption,
) {
  const existing = byId.get(option.id)
  if (!existing) {
    byId.set(option.id, option)
    return
  }

  const hymnalTrack = existing.hymnalTrack ?? option.hymnalTrack
  byId.set(option.id, {
    ...existing,
    hymnalTrack,
    albumNames: joinAlbumNames(existing.albumNames, option.albumNames),
    displayLabel: buildDisplayLabel(existing.name, hymnalTrack),
    durationMs: existing.durationMs ?? option.durationMs,
    hasInstrumental: existing.hasInstrumental || option.hasInstrumental,
  })
}

function mapMusicOption(
  row: CatalogHymnalRow,
  albumName: string,
  options?: { useTrackInLabel?: boolean },
): LiturgyMusicOption | null {
  const id = Number(row.id_music)
  if (!Number.isFinite(id)) return null

  const name = String(row.name ?? '').trim()
  if (!name) return null

  const hymnalTrack = options?.useTrackInLabel ? parseTrack(row.track) : null

  return {
    id,
    name,
    hymnalTrack,
    albumNames: albumName,
    displayLabel: buildDisplayLabel(name, hymnalTrack),
    durationMs: parseCatalogDurationMs(row.duration),
    hasInstrumental: hasInstrumentalFlag(row),
  }
}

function mapMusicIndexRow(row: CatalogMusicIndexRow): LiturgyMusicOption | null {
  const id = Number(row.id_music)
  if (!Number.isFinite(id)) return null

  const name = String(row.name ?? '').trim()
  if (!name) return null

  const albumNames =
    joinAlbumNames(
      row.albums_names,
      ...(Array.isArray(row.albums)
        ? row.albums.map((album) => album.name)
        : []),
    ) || 'Música'

  const hymnalTrack = parseTrack(row.track)
  const isHymnalAlbum =
    albumNames.includes('Hinário Adventista') ||
    albumNames.includes('Hinário Adventista 1996')

  return {
    id,
    name,
    hymnalTrack: isHymnalAlbum ? hymnalTrack : null,
    albumNames,
    displayLabel: buildDisplayLabel(name, isHymnalAlbum ? hymnalTrack : null),
    durationMs: parseCatalogDurationMs(row.duration),
    hasInstrumental: hasInstrumentalFlag(row),
  }
}

async function loadFromMusicIndex(): Promise<LiturgyMusicOption[] | null> {
  const rows = await readOrFetchCatalog<CatalogMusicIndexRow[]>(
    `${getCurrentApiPrefix()}_musics`,
  )
  if (!rows || !Array.isArray(rows) || rows.length === 0) return null

  const byId = new Map<number, LiturgyMusicOption>()
  for (const row of rows) {
    const mapped = mapMusicIndexRow(row)
    if (mapped) upsertMusicOption(byId, mapped)
  }

  return byId.size > 0 ? [...byId.values()] : null
}

async function loadHymnalOptions(
  byId: Map<number, LiturgyMusicOption>,
): Promise<void> {
  for (const source of HYMNAL_SOURCES) {
    const rows = await readOrFetchCatalog<CatalogHymnalRow[]>(source.file)
    if (!rows || !Array.isArray(rows)) continue

    for (const row of rows) {
      const mapped = mapMusicOption(row, source.albumName, {
        useTrackInLabel: true,
      })
      if (mapped) upsertMusicOption(byId, mapped)
    }
  }
}

async function loadCollectionOptions(
  byId: Map<number, LiturgyMusicOption>,
): Promise<void> {
  const categories = await readOrFetchCatalog<CatalogCategory[]>('pt_categories')
  if (!categories || !Array.isArray(categories)) return

  const albums = new Map<number, string>()
  for (const category of categories) {
    for (const album of category.albums ?? []) {
      const id = Number(album.id_album)
      if (!Number.isFinite(id) || EXCLUDED_ALBUM_IDS.has(id)) continue
      const name = String(album.name ?? '').trim()
      if (!name) continue
      albums.set(id, name)
    }
  }

  const albumEntries = [...albums.entries()]
  const batchSize = 20

  for (let index = 0; index < albumEntries.length; index += batchSize) {
    const batch = albumEntries.slice(index, index + batchSize)
    await Promise.all(
      batch.map(async ([albumId, albumName]) => {
        const record = await readOrFetchCatalog<CatalogAlbumRecord>(
          `album_${albumId}`,
        )
        if (!record?.musics || !Array.isArray(record.musics)) return

        const resolvedName = String(record.name ?? albumName).trim() || albumName
        for (const row of record.musics) {
          const mapped = mapMusicOption(row, resolvedName, {
            useTrackInLabel: false,
          })
          if (mapped) upsertMusicOption(byId, mapped)
        }
      }),
    )
  }
}

export function sortMusicOptions(options: LiturgyMusicOption[]): LiturgyMusicOption[] {
  return [...options].sort((a, b) => {
    const trackA = a.hymnalTrack ?? Number.POSITIVE_INFINITY
    const trackB = b.hymnalTrack ?? Number.POSITIVE_INFINITY
    if (trackA !== trackB) return trackA - trackB
    return a.name.localeCompare(b.name)
  })
}

export async function loadLiturgyMusicOptions(): Promise<LiturgyMusicOption[]> {
  const fromIndex = await loadFromMusicIndex()
  if (fromIndex && fromIndex.length > 0) {
    const byId = new Map(fromIndex.map((entry) => [entry.id, entry]))
    // Índice pode omitir flags de instrumental; hinário completa o dado.
    await loadHymnalOptions(byId)
    return sortMusicOptions([...byId.values()])
  }

  const byId = new Map<number, LiturgyMusicOption>()
  await loadHymnalOptions(byId)
  await loadCollectionOptions(byId)
  return sortMusicOptions([...byId.values()])
}

export async function loadLiturgyBibleBooks(): Promise<LiturgyBibleBookOption[]> {
  const rows = await readOrFetchCatalog<CatalogBibleBookRow[]>(BOOKS_FILE)
  if (!rows || !Array.isArray(rows)) return []

  return rows
    .map((row) => {
      const id = Number(row.id_bible_book)
      const name = String(row.name ?? '').trim()
      const chapters = Number(row.chapters) || 0
      if (!Number.isFinite(id) || !name || chapters <= 0) return null
      return { id, name, chapters } satisfies LiturgyBibleBookOption
    })
    .filter((entry): entry is LiturgyBibleBookOption => entry != null)
}

/** Busca músicas por título, álbum ou número do hinário (máx. 50). */
export function filterLiturgyMusicOptions(
  options: LiturgyMusicOption[],
  query: string,
  selectedId: number | null,
): LiturgyMusicOption[] {
  const selected = options.find((entry) => entry.id === selectedId) ?? null
  const trimmed = query.trim().toLowerCase()

  if (!trimmed) {
    return selected ? [selected] : []
  }

  const isNum = trimmed !== '' && !Number.isNaN(Number(trimmed))
  const numQuery = isNum ? Number(trimmed) : null

  let results = options.filter((entry) => {
    const title = entry.name.toLowerCase()
    const album = entry.albumNames.toLowerCase()
    if (isNum && numQuery != null) {
      return (
        title.includes(trimmed) ||
        album.includes(trimmed) ||
        entry.hymnalTrack === numQuery
      )
    }
    return title.includes(trimmed) || album.includes(trimmed)
  })

  if (isNum && numQuery != null) {
    results = [...results].sort((a, b) => {
      const score = (entry: LiturgyMusicOption) => {
        if (
          entry.hymnalTrack === numQuery &&
          entry.albumNames.includes('Hinário Adventista') &&
          !entry.albumNames.includes('1996')
        ) {
          return 2
        }
        if (
          entry.hymnalTrack === numQuery &&
          entry.albumNames.includes('Hinário Adventista 1996')
        ) {
          return 1
        }
        return 0
      }
      return score(b) - score(a)
    })
  }

  return results.slice(0, 50)
}
