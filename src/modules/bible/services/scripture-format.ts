import type { BibleChapterVerses, BibleSelection } from '../types/bible'

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