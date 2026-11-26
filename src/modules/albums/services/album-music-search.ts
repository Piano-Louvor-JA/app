import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'
import { matchesAllTerms } from "@shared/services/search-terms"

import type { AlbumSearchAlbumRef, AlbumSearchHit } from '../types/albums'
import { formatCatalogDuration } from './album-tracks'
import { albumDisableKey } from './disabled-albums'

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
  /** Letra em texto corrido — VEM NO ÍNDICE pt_musics (1944/1956, 03/10). */
  lyric?: string | null
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

function collectAlbumRefs(row: CatalogMusicIndexRow): AlbumSearchAlbumRef[] {
  const refs: AlbumSearchAlbumRef[] = []
  for (const album of row.albums ?? []) {
    const key = albumDisableKey({ id_album: album.id_album, name: album.name, type: album.type })
    if (!key || refs.some((ref) => ref.key === key)) continue
    const track = albumTrackNumber(album)
    refs.push({ key, track: track != null && track > 0 ? track : null, hymnal: isHymnalAlbum(album) })
  }
  return refs
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

  // Busca por letra (issue #360, Opção A): a letra JÁ VEM no índice
  // `${prefix}_musics` (1944/1956 músicas, +~80% do peso do arquivo que
  // baixa como essencial) — basta propagar. Zero download novo.
  const lyricsText = String(row.lyric ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

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
    lyricsText: lyricsText || undefined,
    albumRefs: collectAlbumRefs(row),
  }
}

function mergeHits(a: AlbumSearchHit, b: AlbumSearchHit): AlbumSearchHit {
  const hymnalTracks = [...new Set([...a.hymnalTracks, ...b.hymnalTracks])]
  const track = a.track ?? b.track ?? hymnalTracks[0] ?? null
  return {
    ...a,
    lyricsText: a.lyricsText ?? b.lyricsText,
    track,
    isHymnal: a.isHymnal || b.isHymnal || track != null,
    albumNames: a.albumNames.includes(b.albumNames)
      ? a.albumNames
      : [a.albumNames, b.albumNames].filter(Boolean).join(', '),
    hasInstrumental: a.hasInstrumental || b.hasInstrumental,
    hymnalTracks,
    albumRefs: mergeAlbumRefs(a.albumRefs, b.albumRefs),
  }
}

function mergeAlbumRefs(
  a: AlbumSearchAlbumRef[] | undefined,
  b: AlbumSearchAlbumRef[] | undefined,
): AlbumSearchAlbumRef[] {
  const merged = [...(a ?? [])]
  for (const ref of b ?? []) if (!merged.some((item) => item.key === ref.key)) merged.push(ref)
  return merged
}

/** Carrega o índice global de músicas (prefixado por idioma). */
export async function loadAlbumMusicIndex(): Promise<AlbumSearchHit[]> {
  const langPrefix = getCurrentApiPrefix()
  const rows = await readOrFetchCatalog<CatalogMusicIndexRow[]>(`${langPrefix}_musics`)

  const byId = new Map<number, AlbumSearchHit>()
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const mapped = mapMusicIndexRow(row)
      if (!mapped) continue
      const existing = byId.get(mapped.musicId)
      byId.set(
        mapped.musicId,
        existing ? mergeHits(existing, mapped) : mapped,
      )
    }
  }

  // Busca por letra (03/10): músicas custom LOCAIS entram no índice com
  // `lyricsText` — a letra está no localStorage (offline-first). O hinário
  // e os álbuns oficiais já trazem `lyric` no índice `${prefix}_musics`.
  try {
    const { listAllLocalMusicsWithLyrics } =
      await import('@modules/media/services/local-custom-store')
    for (const local of await listAllLocalMusicsWithLyrics()) {
      const lyricsText = local.lyrics
        .map((l) => l.lyric ?? '')
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      const hit: AlbumSearchHit = {
        musicId: local.id,
        name: local.name,
        track: null,
        durationLabel: '0:00',
        hasInstrumental: false,
        albumNames: 'Minhas Coletâneas',
        displayTitle: local.name,
        isHymnal: false,
        hymnalTracks: [],
        lyricsText,
      }
      const existing = byId.get(local.id)
      byId.set(local.id, existing ? { ...existing, lyricsText } : hit)
    }
  } catch {
    // storage indisponível — índice segue só com o catálogo
  }

  return [...byId.values()]
}

/**
 * Busca por hinos: título, álbum ou número do hinário (máx. 50).
 * Número prioriza Hinário Adventista atual, depois 1996.
 *
 * Relevância (apk#127 / SPEC 10): na busca textual, match de título
 * precede match só de álbum ou de letra. Um termo que casa com o nome
 * da coletânea não pode devolver todas as faixas dela na frente.
 * O fold é o mesmo da busca por termos, para título acentuado não cair
 * na cauda.
 */
function foldSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function relevanceScore(entry: AlbumSearchHit, trimmed: string): number {
  const title = foldSearchText(entry.name)
  const query = foldSearchText(trimmed)
  if (title === query) return 3
  if (title.startsWith(query)) return 2
  if (title.includes(query)) return 1
  return 0
}

/** Número do hinário pelos nomes (índice sem albumRefs: atual 2, 1996 1). */
function hymnalScoreByName(entry: AlbumSearchHit): number {
  if (entry.albumNames.includes('Hinário Adventista') && !entry.albumNames.includes('1996')) return 2
  if (entry.albumNames.includes('Hinário Adventista 1996')) return 1
  return 0
}

/** Número no hinário ATIVO: atual (2) antes de 1996/outros hinários (1). */
function hymnalScoreByAlbum(refs: AlbumSearchAlbumRef[], num: number): number {
  if (refs.some((ref) => ref.key === 'hymnal' && ref.track === num)) return 2
  if (refs.some((ref) => ref.hymnal && ref.track === num)) return 1
  return 0
}

/** Número do hinário a mostrar só com álbuns ativos (atual → 1996 → outro). */
function activeHymnalTrack(refs: AlbumSearchAlbumRef[]): number | null {
  return (
    refs.find((ref) => ref.key === 'hymnal' && ref.track != null)?.track ??
    refs.find((ref) => ref.hymnal && ref.track != null)?.track ??
    null
  )
}

type RankedHit = { hit: AlbumSearchHit; score: number }

/**
 * Busca por hinos: título, álbum ou número do hinário (máx. 50).
 * `disabledAlbums` (chaves de álbum desativado): música que só casa por eles
 * vem `disabled`, depois das ativas — o seletor pula (paridade Classic).
 */
export function filterAlbumMusicIndex(
  index: AlbumSearchHit[],
  query: string,
  disabledAlbums: ReadonlySet<string> = new Set(),
): AlbumSearchHit[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []

  const isNum = /^\d+$/.test(trimmed)
  const numQuery = isNum ? Number(trimmed) : null

  const ranked: RankedHit[] = []
  for (const entry of index) {
    const refs = entry.albumRefs ?? []
    const activeRefs = refs.filter((ref) => !disabledAlbums.has(ref.key))
    const allDisabled = refs.length > 0 && activeRefs.length === 0
    // Busca por termos (03/10): "jesus adoradores 5" acha a música "Jesus"
    // do álbum "Adoradores 5" — substring contígua não existe em campo nenhum.
    // Busca por letra (03/10): `lyricsText` (quando presente) casa trecho/termos.
    const textMatch = matchesAllTerms(entry.name, entry.albumNames, trimmed, entry.lyricsText ?? '')

    if (numQuery != null) {
      const numberHit = entry.track === numQuery || (entry.hymnalTracks ?? []).includes(numQuery)
      if (!numberHit && !textMatch) continue
      const score = !numberHit ? 0 : refs.length > 0 ? hymnalScoreByAlbum(activeRefs, numQuery) : hymnalScoreByName(entry)
      // Casou só pelo número de um álbum desativado (ex.: o 45 do hinário de 1996).
      const activeNumber = refs.length === 0 || activeRefs.some((ref) => ref.hymnal && ref.track === numQuery)
      const disabled = allDisabled || (numberHit && !activeNumber && !textMatch)
      // Exibe o número buscado quando a faixa tem esse track no hinário.
      const hit = numberHit ? { ...entry, track: numQuery, isHymnal: true } : entry
      ranked.push({ hit: disabled ? { ...hit, disabled: true } : hit, score })
      continue
    }

    if (!textMatch) continue
    let hit: AlbumSearchHit = entry
    // Hinário desativado: o número mostrado vem do hinário que segue ativo.
    if (refs.some((ref) => ref.hymnal && disabledAlbums.has(ref.key))) {
      const track = activeHymnalTrack(activeRefs)
      hit = { ...entry, track, isHymnal: track != null }
    }
    // Busca textual: título/número primeiro; match só de álbum vai pro fim
    // (não some, mas não engole a lista — apk#127).
    ranked.push({ hit: allDisabled ? { ...hit, disabled: true } : hit, score: relevanceScore(entry, trimmed) })
  }

  // Ativas antes das desativadas; dentro de cada grupo, o melhor score.
  ranked.sort((a, b) => Number(a.hit.disabled === true) - Number(b.hit.disabled === true) || b.score - a.score)
  return ranked.slice(0, 50).map((item) => item.hit)
}