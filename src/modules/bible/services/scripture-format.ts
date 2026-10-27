import type { BibleBook, BibleChapterVerses, BibleSelection } from '../types/bible'

/** Minúsculas + sem diacríticos (mesma regra de search-terms.ts). */
function foldText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Resultado do parser de referência completa. */
export interface ParsedBibleReference {
  book: BibleBook
  chapter: number | null
  verses: number[]
}

/** Agrupa números em intervalos legíveis (ex.: 1-3,5). */
export function formatVerseIntervals(verses: number[]): string {
  if (verses.length === 0) return ''

  const sorted = [...verses].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let end = sorted[0]

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]
    if (current === end + 1) {
      end = current
      continue
    }
    parts.push(start === end ? String(start) : `${start}-${end}`)
    start = current
    end = current
  }

  parts.push(start === end ? String(start) : `${start}-${end}`)
  return parts.join(',')
}

/** Monta a referência bíblica exibida/projetada. */
export function formatScripturalReference(selection: {
  bookName: string
  chapter: number | null
  verses: number[]
  versionAbbreviation?: string
}): string {
  if (!selection.bookName || !selection.chapter) return ''

  const versePart =
    selection.verses.length > 0 ? `:${formatVerseIntervals(selection.verses)}` : ''
  const versionPart =
    selection.versionAbbreviation &&
    selection.versionAbbreviation.toLowerCase() !== 'null'
      ? ` (${selection.versionAbbreviation})`
      : ''

  return `${selection.bookName} ${selection.chapter}${versePart}${versionPart}`
}

/** Concatena o texto dos versículos selecionados. */
export function buildProjectionText(
  verses: BibleChapterVerses,
  selected: number[],
): string {
  return selected
    .map((num) => verses[String(num)])
    .filter((text): text is string => Boolean(text))
    .join(' ')
}

/** Adiciona ao conjunto os versículos existentes do intervalo (ordem livre). */
function addVerseRange(
  selected: Set<number>,
  from: number,
  to: number,
  verses: BibleChapterVerses,
): void {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  for (let i = lo; i <= hi; i += 1) {
    if (verses[String(i)]) selected.add(i)
  }
}

/** Interpreta UM item da query (`1`, `1-3`). Retorna apenas versículos existentes. */
function parseSinglePart(part: string, verses: BibleChapterVerses): number[] {
  const trimmed = part.trim()
  if (!trimmed) return []

  if (!trimmed.includes('-')) {
    const num = Number(trimmed)
    return !Number.isNaN(num) && verses[String(num)] ? [num] : []
  }

  const [startStr, endStr] = trimmed.split('-')
  const start = Number(startStr?.trim())
  const end = Number(endStr?.trim())
  if (Number.isNaN(start) || Number.isNaN(end)) return []

  const selected = new Set<number>()
  addVerseRange(selected, start, end, verses)
  return Array.from(selected)
}

/**
 * Interpreta busca por números/intervalos (`1`, `1-3`, `1,3-5`).
 * Retorna apenas versículos existentes no capítulo, ordenados.
 */
export function parseVerseQuery(
  query: string,
  verses: BibleChapterVerses,
): number[] {
  const all = new Set<number>()
  for (const part of query.split(',')) {
    for (const v of parseSinglePart(part, verses)) all.add(v)
  }
  return Array.from(all).sort((a, b) => a - b)
}

export function emptySelection(): BibleSelection {
  return {
    versionId: null,
    bookId: null,
    versionAbbreviation: '',
    bookName: '',
    chapter: 1,
    verses: [],
    scripturalReference: '',
    text: '',
  }
}

/**
 * Interpreta uma lista/intervalo de versículos (`1-4, 6`) em números.
 * Estrutura apenas — validação de existência fica no consumidor (SPEC R3).
 */
function parseVerseList(raw: string): number[] {
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) return []
    if (!trimmed.includes('-')) {
      const num = Number(trimmed)
      if (!Number.isInteger(num) || num < 1) return []
      out.add(num)
      continue
    }
    const [startStr, endStr] = trimmed.split('-')
    const start = Number(startStr?.trim())
    const end = Number(endStr?.trim())
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) return []
    for (let i = Math.min(start, end); i <= Math.max(start, end); i += 1) out.add(i)
  }
  return Array.from(out).sort((a, b) => a - b)
}

/**
 * Interpreta referência bíblica completa no campo de busca de livros.
 * Formatos: `genesis` | `genesis 1` | `genesis 1:1` | `genesis 1:1-4, 6` |
 * `gn 1.1-3` (abreviação, ponto ou dois-pontos).
 *
 * Match do livro: fold diacrítico; abreviação exata vence; senão prefixo do
 * nome — prefixo ambíguo (mais de um livro) → null (grid segue fluxo normal).
 * Entrada torta → null, nunca throw.
 */
export function parseBibleReference(
  query: string,
  books: BibleBook[],
): ParsedBibleReference | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  // Normaliza travessões tipográficos (en/em dash) e hífens Unicode → "-"
  // (usuário colando "genesis 1:1–4, 6" de outro app).
  const normalized = trimmed.replace(/[\u2010-\u2015]/g, '-')

  // Separa nome do livro (tudo até o último espaço antes de número) do resto.
  // Formas tortas ("genesis 1:", "genesis :") não casam e o bookPart resultante
  // não bate em livro algum → null naturalmente.
  const match = normalized.match(/^(.+?)\s+(\d+)(?:[.:]([\d\s,-]+))?$/)

  let bookPart = trimmed
  let chapter: number | null = null
  let versePart: string | null = null

  if (match) {
    bookPart = match[1] ?? ''
    chapter = Number(match[2])
    versePart = match[3] ?? null
  }

  if (versePart !== null && !versePart) return null

  const folded = foldText(bookPart)
  if (!folded) return null

  // 1) abreviação exata (fold)
  const byAbbr = books.find((book) => foldText(book.abbreviation) === folded)
  if (byAbbr) {
    return { book: byAbbr, chapter, verses: versePart ? parseVerseList(versePart) : [] }
  }

  // 2) prefixo do nome — único match vira livro; ambíguo → null
  const byPrefix = books.filter((book) => foldText(book.name).startsWith(folded))
  if (byPrefix.length === 1) {
    return { book: byPrefix[0]!, chapter, verses: versePart ? parseVerseList(versePart) : [] }
  }

  // 3) sem capítulo e sem versículo: aceita também "contém" quando único
  if (chapter === null && byPrefix.length === 0) {
    const byContains = books.filter((book) => foldText(book.name).includes(folded))
    if (byContains.length === 1) {
      return { book: byContains[0]!, chapter: null, verses: [] }
    }
  }

  return null
}
