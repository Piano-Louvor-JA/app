/**
 * Busca "que entende" o que o operador digita (paridade com o apk,
 * lib/presentation/bible/bible_smart_search.dart): livro, capítulo,
 * versículos ou texto — `jo 3:16`, `jo 3.16`, `jo 3,16`, `jo 3 16`,
 * `jo3:16`, `1 co 13:4-7`, `i coríntios 13`, `primeira coríntios 13`,
 * `salmo 23`, `cantares 2`. A primeira sugestão é a ação do Enter.
 */
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import type { BibleBook } from '../types/bible'

export type BibleSuggestionKind = 'book' | 'reference' | 'text'

export interface BibleSuggestion {
  kind: BibleSuggestionKind
  book?: BibleBook
  chapter?: number
  verses: number[]
  /** Texto buscado (kind === 'text'). */
  query: string
  /** "João", "João 3", "João 3:16-18" ou o texto. */
  label: string
}

const MAX_BOOKS = 6
const MAX_REFERENCES = 3
const MIN_TEXT = 3

/** Apelidos que não saem do nome/abreviação do catálogo (chave dobrada). */
const ALIASES: Record<string, string[]> = {
  sl: ['salmo', 'salmos'],
  cn: ['ct', 'cantico', 'canticos', 'canticodoscanticos', 'cantaresdoscantares'],
}

const REFERENCE =
  /^([1-3]?\s*[a-z][a-z ]*?)\s*(?:(\d+)(?:\s*[:.,\s]\s*(\d[\d,\-\s]*)?)?)?$/

function basic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Minúsculas, sem acento, numeral romano/por extenso no início vira dígito. */
export function foldBibleText(s: string): string {
  return stripAccents(basic(s)).replace(
    /^(primeir[oa]|1[ºªoa]|iii|ii|i|segund[oa]|2[ºªoa]|terceir[oa]|3[ºªoa])\s+(?=[a-z])/,
    (w) => {
      const word = w.trim()
      if (word === 'iii' || word.startsWith('terceir') || word.startsWith('3')) return '3 '
      if (word === 'ii' || word.startsWith('segund') || word.startsWith('2')) return '2 '
      return '1 '
    },
  )
}

export function formatVerseList(input: number[]): string {
  const verses = [...new Set(input.filter((v) => v > 0))].sort((a, b) => a - b)
  if (verses.length === 0) return ''
  const parts: string[] = []
  let start = verses[0]
  let prev = start
  for (const v of verses.slice(1)) {
    if (v === prev + 1) {
      prev = v
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = prev = v
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`)
  return parts.join(',')
}

function parseVerses(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const p = part.trim().replace(/[-\s]+$/, '')
    if (!p) continue
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(p)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      const lo = Math.max(1, Math.min(a, b))
      const hi = Math.max(a, b)
      for (let v = lo; v <= hi && v <= lo + 200; v += 1) out.add(v)
      continue
    }
    const single = Number(p.replace(/\s/g, ''))
    if (Number.isInteger(single) && single >= 1) out.add(single)
  }
  return [...out].sort((a, b) => a - b)
}

function score(book: BibleBook, rawKey: string, key: string): number {
  const abbr = foldBibleText(book.abbreviation).replace(/ /g, '')
  const nameFolded = foldBibleText(book.name)
  const name = nameFolded.replace(/ /g, '')
  const aliases = ALIASES[abbr] ?? []
  if (rawKey && book.abbreviation.toLowerCase().replace(/ /g, '') === rawKey) return 100
  if (abbr === key) return 90
  if (name === key || aliases.includes(key)) return 85
  if (name.startsWith(key)) return 70
  if (aliases.some((a) => a.startsWith(key))) return 60
  if (abbr.startsWith(key)) return 50
  const words = nameFolded.split(' ').filter((w) => !/^\d+$/.test(w))
  if (key.length >= 3 && words.some((w) => w.startsWith(key))) return 30
  return 0
}

function rank(rawKey: string, key: string, books: BibleBook[]): BibleBook[] {
  if (!key) return []
  return books
    .map((b) => ({ b, s: score(b, rawKey, key) }))
    .filter((e) => e.s > 0)
    .sort((x, y) => y.s - x.s || x.b.bookNumber - y.b.bookNumber)
    .map((e) => e.b)
}

function bookSuggestion(book: BibleBook): BibleSuggestion {
  return { kind: 'book', book, verses: [], query: '', label: book.name }
}

export function suggestBible(input: string, books: BibleBook[]): BibleSuggestion[] {
  const raw = basic(input)
  if (!raw) return []
  const folded = foldBibleText(raw)
  const m = REFERENCE.exec(folded)
  const textSuggestion: BibleSuggestion = { kind: 'text', verses: [], query: raw, label: raw }
  if (!m) {
    return /[a-z]/.test(folded) && folded.length >= MIN_TEXT ? [textSuggestion] : []
  }

  const bookPart = m[1].trim()
  // Parte do livro como digitada (com acento): só desempata Jó/Jo.
  const rawBook =
    folded.length === raw.length ? raw.slice(0, bookPart.length).replace(/ /g, '') : ''
  const ranked = rank(rawBook, bookPart.replace(/ /g, ''), books)

  if (m[2] === undefined) {
    return [
      ...ranked.slice(0, MAX_BOOKS).map(bookSuggestion),
      ...(folded.length >= MIN_TEXT ? [textSuggestion] : []),
    ]
  }

  const chapter = Number(m[2])
  const verses = parseVerses(m[3] ?? '')
  const refs = ranked
    .filter((b) => chapter >= 1 && chapter <= b.chapters)
    .slice(0, MAX_REFERENCES)
    .map((book): BibleSuggestion => {
      const v = formatVerseList(verses)
      return {
        kind: 'reference',
        book,
        chapter,
        verses,
        query: '',
        label: v ? `${book.name} ${chapter}:${v}` : `${book.name} ${chapter}`,
      }
    })
  return refs.length > 0 ? refs : ranked.slice(0, MAX_BOOKS).map(bookSuggestion)
}

const RECENTS_KEY = 'bibleRecentSearches'
const MAX_RECENTS = 8

export function loadBibleRecents(): string[] {
  const stored = getUserPreference<unknown>(RECENTS_KEY, [])
  return Array.isArray(stored) ? stored.filter((e): e is string => typeof e === 'string') : []
}

export function addBibleRecent(entry: string): string[] {
  const value = entry.trim()
  if (!value) return loadBibleRecents()
  const next = [
    value,
    ...loadBibleRecents().filter((e) => e.toLowerCase() !== value.toLowerCase()),
  ].slice(0, MAX_RECENTS)
  setUserPreference(RECENTS_KEY, next)
  return next
}

export function clearBibleRecents(): void {
  setUserPreference(RECENTS_KEY, [])
}
