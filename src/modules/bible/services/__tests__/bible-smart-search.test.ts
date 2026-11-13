import { describe, expect, it } from 'vitest'

import { suggestBible } from '../bible-smart-search'
import type { BibleBook } from '../../types/bible'

const book = (id: number, name: string, abbreviation: string, chapters: number): BibleBook => ({
  id,
  name,
  abbreviation,
  chapters,
  bookNumber: id,
  languageId: 'pt',
})

const books: BibleBook[] = [
  book(1, 'Gênesis', 'Gn', 50),
  book(18, 'Jó', 'Jó', 42),
  book(19, 'Salmos', 'Sl', 150),
  book(43, 'João', 'Jo', 21),
  book(46, 'I Coríntios', '1Co', 16),
]

describe('suggestBible', () => {
  it('"jo 3:16" → João 3 [16]', () => {
    const first = suggestBible('jo 3:16', books)[0]
    expect(first.kind).toBe('reference')
    expect(first.book?.name).toBe('João')
    expect(first.chapter).toBe(3)
    expect(first.verses).toEqual([16])
  })

  it('"jó 1" (com acento) → Jó', () => {
    const first = suggestBible('jó 1', books)[0]
    expect(first.kind).toBe('reference')
    expect(first.book?.name).toBe('Jó')
    expect(first.chapter).toBe(1)
  })

  it('"jo 38" → Jó 38 (João só tem 21 capítulos)', () => {
    const refs = suggestBible('jo 38', books).filter((s) => s.kind === 'reference')
    expect(refs.map((s) => s.book?.name)).toEqual(['Jó'])
    expect(refs[0].chapter).toBe(38)
  })

  it('"1 co 13:4-7" → I Coríntios 13 [4,5,6,7]', () => {
    const first = suggestBible('1 co 13:4-7', books)[0]
    expect(first.kind).toBe('reference')
    expect(first.book?.name).toBe('I Coríntios')
    expect(first.chapter).toBe(13)
    expect(first.verses).toEqual([4, 5, 6, 7])
  })

  it('"primeira corintios 13" resolve I Coríntios 13', () => {
    const first = suggestBible('primeira corintios 13', books)[0]
    expect(first.kind).toBe('reference')
    expect(first.book?.name).toBe('I Coríntios')
    expect(first.chapter).toBe(13)
    expect(first.verses).toEqual([])
  })

  it('"salmo 23" → Salmos 23', () => {
    const first = suggestBible('salmo 23', books)[0]
    expect(first.kind).toBe('reference')
    expect(first.book?.name).toBe('Salmos')
    expect(first.chapter).toBe(23)
  })

  it('"amor" → única sugestão de texto', () => {
    const result = suggestBible('amor', books)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('text')
    expect(result[0].query).toBe('amor')
  })

  it('entrada vazia → []', () => {
    expect(suggestBible('', books)).toEqual([])
    expect(suggestBible('   ', books)).toEqual([])
  })
})
