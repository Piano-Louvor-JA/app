import {
  chapterRecordKey,
  cleanCatalogText,
  pickDefaultVersionId,
  resolveBookTone,
  resolveTestament,
  resolveVersionAbbreviation,
} from '@louvorja/shared/services'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'

import type {
  BibleBook,
  BibleBookTone,
  BibleChapterVerses,
  BibleTestament,
  BibleVersion,
  CatalogBibleBookRow,
  CatalogBibleVersionRow,
} from '@louvorja/shared/types'

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
 *
 * Import dinâmico: resolveBookTone e os demais helpers não devem carregar o
 * i18n só porque o módulo foi importado.
 */
async function bibleCatalogFile(kind: 'book' | 'version'): Promise<string> {
  const { getCurrentApiPrefix } = await import(
    '@modules/sync/services/library-catalog'
  )
  const prefix = getCurrentApiPrefix()
  if (kind === 'book') return BOOKS_FILE_BY_PREFIX[prefix] ?? 'pt_bible_book'
  return VERSIONS_FILE_BY_PREFIX[prefix] ?? 'pt_bible_version'
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

export {
  chapterRecordKey,
  cleanCatalogText,
  pickDefaultVersionId,
  resolveBookTone,
  resolveTestament,
  resolveVersionAbbreviation,
} from '@louvorja/shared/services'

export async function loadBibleBooks(): Promise<BibleBook[]> {
  const rows = await readOrFetchCatalog<CatalogBibleBookRow[]>(
    await bibleCatalogFile('book'),
  )
  if (!rows || !Array.isArray(rows)) return []
  return rows.map(mapBook)
}

export async function loadBibleVersions(): Promise<BibleVersion[]> {
  const rows = await readOrFetchCatalog<CatalogBibleVersionRow[]>(
    await bibleCatalogFile('version'),
  )
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