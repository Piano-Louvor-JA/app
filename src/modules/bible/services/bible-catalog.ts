import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

import type {
  BibleBook,
  BibleBookTone,
  BibleChapterVerses,
  BibleTestament,
  BibleVersion,
  CatalogBibleBookRow,
  CatalogBibleVersionRow,
} from '../types/bible'

const BOOKS_FILE_BY_PREFIX: Record<string, string> = {
  pt: 'pt_bible_book',
  en: 'pt_bible_book',
  es: 'es_bible_book',
}
const VERSIONS_FILE_BY_PREFIX: Record<string, string> = {
  pt: 'pt_bible_version',
  en: 'pt_bible_version',
  es: 'es_bible_version',
}

/**
 * Idioma ativo para a Bíblia (issue: ao trocar idioma, hinário mudava mas a
 * Bíblia ficava em pt). Reusa a mesma detecção do hinário (getCurrentApiPrefix:
 * user_data.language → fallback pt). `en` não tem catálogo próprio na API —
 * usa o pt (mesmo comportamento do hinário).
 */
function bibleApiPrefix(): string {
  return getCurrentApiPrefix()
}

const BOOKS_FILE = BOOKS_FILE_BY_PREFIX[bibleApiPrefix()] ?? 'pt_bible_book'
const VERSIONS_FILE =
  VERSIONS_FILE_BY_PREFIX[bibleApiPrefix()] ?? 'pt_bible_version'

/** Abreviações conhecidas quando o catálogo/API vem com abbreviation vazia/null. */
const VERSION_ABBREVIATION_BY_NAME: Array<{ match: RegExp; abbr: string }> = [
  { match: /nova\s+almeida\s+atualizada/i, abbr: 'NAA' },
  { match: /almeida\s+corrigida\s+e\s+revisada\s+fiel/i, abbr: 'ACRF' },
  { match: /almeida\s+corrigida\s+e\s+fiel/i, abbr: 'ACF' },
  { match: /almeida\s+revisada\s+imprensa/i, abbr: 'ARIB' },
  { match: /almeida\s+revista\s+e\s+atualizada/i, abbr: 'ARA' },
  { match: /almeida\s+revista\s+e\s+corrigida/i, abbr: 'ARC' },
  { match: /king\s+james\s+atualizada/i, abbr: 'KJA' },
  { match: /nova\s+vers[aã]o\s+internacional/i, abbr: 'NVI' },
  { match: /sagradas\s+escrituras/i, abbr: 'SEV' },
  { match: /reina[-\s]?valera\s*1989/i, abbr: 'RVA' },
  { match: /reina[-\s]?valera/i, abbr: 'RV' },
]

function cleanCatalogText(value: unknown): string {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') {
    return ''
  }
  return text
}

/** Evita `String(null) === "null"` e completa abreviação a partir do nome/id. */
export function resolveVersionAbbreviation(
  abbreviation: unknown,
  name: unknown,
  versionId?: unknown,
): string {
  const fromField = cleanCatalogText(abbreviation)
  if (fromField) return fromField

  const versionName = cleanCatalogText(name)
  for (const entry of VERSION_ABBREVIATION_BY_NAME) {
    if (entry.match.test(versionName)) return entry.abbr
  }

  const idText = cleanCatalogText(versionId)
  if (/^[a-z]{2,6}$/i.test(idText)) return idText.toUpperCase()

  return ''
}

function mapBook(row: CatalogBibleBookRow): BibleBook {
  return {
    id: Number(row.id_bible_book),
    name: cleanCatalogText(row.name) || String(row.name ?? ''),
    abbreviation: cleanCatalogText(row.abbreviation),
    chapters: Number(row.chapters) || 0,
    bookNumber: Number(row.book_number) || 0,
    languageId: cleanCatalogText(row.id_language) || 'pt',
  }
}

function mapVersion(row: CatalogBibleVersionRow): BibleVersion {
  const name = cleanCatalogText(row.name) || String(row.name ?? '')
  return {
    id: Number(row.id_bible_version),
    abbreviation: resolveVersionAbbreviation(
      row.abbreviation,
      name,
      row.id_bible_version,
    ),
    name,
    languageId: cleanCatalogText(row.id_language) || 'pt',
  }
}

async function readOrFetchCatalog<T>(filename: string): Promise<T | null> {
  const local = await readCatalogRecord<T>(filename)
  if (local != null) return local

  try {
    return await fetchRemoteCatalogJson<T>(filename)
  } catch (error) {
    console.warn(`[bible] falha ao obter catálogo ${filename}`, error)
    return null
  }
}

export function resolveTestament(bookNumber: number): BibleTestament {
  return bookNumber <= 39 ? 'ot' : 'nt'
}

/** Tom visual do tile conforme faixas canônicas (Stitch). */
export function resolveBookTone(bookNumber: number): BibleBookTone {
  if (bookNumber <= 5) return 'law'
  if (bookNumber <= 17) return 'history'
  if (bookNumber <= 39) return 'prophets'
  if (bookNumber <= 43) return 'gospels'
  if (bookNumber <= 66) return 'letters'
  return 'neutral'
}

export function chapterRecordKey(
  versionId: number,
  bookId: number,
  chapter: number,
): string {
  return `bible_${versionId}_${bookId}_${chapter}`
}

export async function loadBibleBooks(): Promise<BibleBook[]> {
  const rows = await readOrFetchCatalog<CatalogBibleBookRow[]>(BOOKS_FILE)
  if (!rows || !Array.isArray(rows)) return []
  return rows.map(mapBook)
}

export async function loadBibleVersions(): Promise<BibleVersion[]> {
  const rows = await readOrFetchCatalog<CatalogBibleVersionRow[]>(VERSIONS_FILE)
  if (!rows || !Array.isArray(rows)) return []
  return rows.map(mapVersion)
}

export async function loadChapterVerses(
  versionId: number,
  bookId: number,
  chapter: number,
): Promise<BibleChapterVerses> {
  const key = chapterRecordKey(versionId, bookId, chapter)
  const verses = await readOrFetchCatalog<BibleChapterVerses>(key)
  if (!verses || typeof verses !== 'object') return {}
  return verses
}

/** Preferência padrão: ARA, senão a primeira versão. */
export function pickDefaultVersionId(
  versions: BibleVersion[],
  savedId: number | null,
): number | null {
  if (versions.length === 0) return null

  if (savedId != null && versions.some((version) => version.id === savedId)) {
    return savedId
  }

  const ara = versions.find(
    (version) =>
      version.abbreviation.toUpperCase() === 'ARA' ||
      version.name.toUpperCase() === 'ARA',
  )
  return ara?.id ?? versions[0].id
}
