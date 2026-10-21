import type { BibleBook } from '../types/bible'

export interface ParsedBibleReference { bookId: number; chapter: number; verses: number[] }
const aliases: Record<number, string[]> = {
  1: ['Gn', 'Gen'], 2: ['Ex'], 3: ['Lv'], 4: ['Nb', 'Nm'], 5: ['Dt'], 6: ['Jos'], 7: ['Jg'], 8: ['Rt'],
  19: ['Ps', 'Psaume', 'Salmos'], 20: ['Pr', 'Pv'], 21: ['Ec', 'Qo'], 22: ['Ct'], 23: ['Es', 'Is'],
  40: ['Mt', 'Matthieu', 'Mateus', 'Mateo'], 41: ['Mc', 'Marc', 'Marcos'], 42: ['Lc', 'Luc', 'Lucas'],
  43: ['Jn', 'Jean', 'João', 'Juan'], 44: ['Ac', 'At', 'Actes', 'Atos', 'Hechos'], 45: ['Rm'],
  46: ['1Co'], 47: ['2Co'], 48: ['Ga', 'Gl'], 49: ['Ep', 'Ef'], 50: ['Ph', 'Fp'], 51: ['Col', 'Cl'],
  52: ['1Th', '1Ts'], 53: ['2Th', '2Ts'], 54: ['1Tm'], 55: ['2Tm'], 56: ['Tt'], 57: ['Phm', 'Fm'],
  58: ['He', 'Hb'], 59: ['Jc', 'Tg'], 60: ['1P', '1Pe'], 61: ['2P', '2Pe'], 62: ['1Jn', '1Jo'],
  63: ['2Jn', '2Jo'], 64: ['3Jn', '3Jo'], 65: ['Jude', 'Jd'], 66: ['Ap', 'Apocalypse', 'Apocalipse', 'Apocalipsis'],
}
const normalizeBook = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]/g, '')

/** Références sans interprétation ambiguë : livre, chapitre et versets facultatifs. */
export function parseBibleReference(query: string, books: BibleBook[]): ParsedBibleReference | null {
  const match = query.trim().match(/^(.+?)\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?\s*$/)
  if (!match) return null
  const name = normalizeBook(match[1]!)
  const book = books.find(book => [book.name, book.abbreviation, ...(aliases[book.bookNumber] ?? [])].some(alias => normalizeBook(alias) === name))
  const chapter = Number(match[2])
  if (!book || chapter < 1 || chapter > book.chapters) return null
  if (!match[3]) return { bookId: book.id, chapter, verses: [] }
  const first = Number(match[3]), last = Number(match[4] ?? match[3])
  if (first < 1 || last < first || last > 176) return null
  return { bookId: book.id, chapter, verses: Array.from({ length: last - first + 1 }, (_, index) => first + index) }
}
