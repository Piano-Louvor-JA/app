import manifest from '../data/manifest.json'
import type { BibleBook, BibleChapterVerses, BibleVersion } from '../types/bible'
import { parseBibleReference } from './bible-reference'

export interface BundledBible {
  version: BibleVersion
  books: BibleBook[]
  chapters: Record<string, BibleChapterVerses>
}
export interface BibleSearchHit {
  bookId: number
  bookName: string
  chapter: number
  verse: number
  text: string
}

export const bundledBibleVersions: BibleVersion[] = manifest.map(({ id, name, abbreviation, languageId }) => ({ id, name, abbreviation, languageId }))
const loaders: Record<number, () => Promise<BundledBible>> = {
  1000001: async () => (await import('../data/fraLSG.json')).default,
  1000002: async () => (await import('../data/frajnd.json')).default,
}
const cache = new Map<number, Promise<BundledBible>>()

export function isBundledBible(id: number): boolean {
  return Object.hasOwn(loaders, id)
}

export function loadBundledBible(id = 1000001): Promise<BundledBible> {
  if (!isBundledBible(id)) return Promise.reject(new Error(`Unknown bundled Bible: ${id}`))
  if (!cache.has(id)) cache.set(id, loaders[id]())
  return cache.get(id)!
}

export function foldBibleText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
}

/** AND across terms; the index is built once per edition, on demand. */
const indexes = new Map<number, Array<BibleSearchHit & { normalized: string }>>()
export async function searchBundledBible(versionId: number, query: string, limit = 100): Promise<{ hits: BibleSearchHit[]; total: number }> {
  const terms = foldBibleText(query).trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return { hits: [], total: 0 }
  const bible = await loadBundledBible(versionId)
  const reference = parseBibleReference(query, bible.books)
  if (reference) {
    const chapterVerses = bible.chapters[`${reference.bookId}:${reference.chapter}`] ?? {}
    const numbers = reference.verses.length ? reference.verses : Object.keys(chapterVerses).map(Number)
    if (numbers.some(number => !Object.hasOwn(chapterVerses, String(number)))) return { hits: [], total: 0 }
    const bookName = bible.books.find(book => book.id === reference.bookId)!.name
    const hits = numbers.map(verse => ({ bookId: reference.bookId, bookName, chapter: reference.chapter, verse, text: chapterVerses[String(verse)]! }))
    return { hits: hits.slice(0, Math.max(0, limit)), total: hits.length }
  }
  if (!indexes.has(versionId)) {
    const names = new Map(bible.books.map(book => [book.id, book.name]))
    indexes.set(versionId, Object.entries(bible.chapters).flatMap(([key, verses]) => {
      const [bookId, chapter] = key.split(':').map(Number)
      return Object.entries(verses).map(([verse, text]) => ({ bookId, bookName: names.get(bookId)!, chapter, verse: Number(verse), text, normalized: foldBibleText(text) }))
    }))
  }
  const matches = indexes.get(versionId)!.filter(hit => terms.every(term => hit.normalized.includes(term)))
  return { hits: matches.slice(0, limit).map(({ normalized: _, ...hit }) => hit), total: matches.length }
}
