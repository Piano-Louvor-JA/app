import { describe, expect, it } from 'vitest'

import type { BibleBook } from '../types/bible'
import { parseBibleReference } from '../services/scripture-format'

const books: BibleBook[] = [
  { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50, bookNumber: 1, languageId: 'pt' },
  { id: 2, name: 'Êxodo', abbreviation: 'Ex', chapters: 40, bookNumber: 2, languageId: 'pt' },
  { id: 46, name: '1 Coríntios', abbreviation: '1Co', chapters: 16, bookNumber: 46, languageId: 'pt' },
  { id: 66, name: 'Apocalipse', abbreviation: 'Ap', chapters: 22, bookNumber: 66, languageId: 'pt' },
]

describe('parseBibleReference — formatos completos', () => {
  it('livro sem acento: genesis', () => {
    const parsed = parseBibleReference('genesis', books)
    expect(parsed?.book.id).toBe(1)
    expect(parsed?.chapter).toBeNull()
    expect(parsed?.verses).toEqual([])
  })

  it('livro com acento: Gênesis', () => {
    expect(parseBibleReference('Gênesis', books)?.book.id).toBe(1)
  })

  it('livro + capítulo: genesis 1', () => {
    const parsed = parseBibleReference('genesis 1', books)
    expect(parsed?.book.id).toBe(1)
    expect(parsed?.chapter).toBe(1)
    expect(parsed?.verses).toEqual([])
  })

  it('livro + capítulo + versículo: genesis 1:1', () => {
    const parsed = parseBibleReference('genesis 1:1', books)
    expect(parsed?.book.id).toBe(1)
    expect(parsed?.chapter).toBe(1)
    expect(parsed?.verses).toEqual([1])
  })

  it('intervalo com lista: genesis 1:1-4, 6', () => {
    const parsed = parseBibleReference('genesis 1:1-4, 6', books)
    expect(parsed?.book.id).toBe(1)
    expect(parsed?.chapter).toBe(1)
    expect(parsed?.verses).toEqual([1, 2, 3, 4, 6])
  })

  it('sem espaços na lista: genesis 1:1-4,6', () => {
    expect(parseBibleReference('genesis 1:1-4,6', books)?.verses).toEqual([1, 2, 3, 4, 6])
  })

  it('ponto como separador: genesis 1.1-3', () => {
    expect(parseBibleReference('genesis 1.1-3', books)?.verses).toEqual([1, 2, 3])
  })

  it('abreviação: gn 1:1-4, 6', () => {
    const parsed = parseBibleReference('gn 1:1-4, 6', books)
    expect(parsed?.book.id).toBe(1)
    expect(parsed?.verses).toEqual([1, 2, 3, 4, 6])
  })

  it('prefixo do nome: gene', () => {
    expect(parseBibleReference('gene', books)?.book.id).toBe(1)
  })

  it('abreviação com número: 1co 13:1-3', () => {
    const parsed = parseBibleReference('1co 13:1-3', books)
    expect(parsed?.book.id).toBe(46)
    expect(parsed?.chapter).toBe(13)
    expect(parsed?.verses).toEqual([1, 2, 3])
  })
})

describe('parseBibleReference — entradas tortas → null', () => {
  it('genesis :', () => {
    expect(parseBibleReference('genesis :', books)).toBeNull()
  })

  it('genesis 1:', () => {
    expect(parseBibleReference('genesis 1:', books)).toBeNull()
  })

  it('só números: 1:1', () => {
    expect(parseBibleReference('1:1', books)).toBeNull()
  })

  it('livro inexistente: judas 2', () => {
    expect(parseBibleReference('judass 1:1', books)).toBeNull()
  })

  it('vazio', () => {
    expect(parseBibleReference('', books)).toBeNull()
    expect(parseBibleReference('   ', books)).toBeNull()
  })

  it('ambíguo por prefixo → null (grid segue fluxo normal)', () => {
    // 'jó' → Jó; mas em catálogo real 'jo' casa Joel E João (ambíguo).
    // No catálogo de teste: 'genesis' não é prefixo de nenhum outro — único.
    // Caso ambíguo verdadeiro precisa de 2 livros com mesmo prefixo:
    const ambiguous = parseBibleReference('g', [
      ...books,
      { id: 57, name: 'Gálatas', abbreviation: 'Gl', chapters: 6, bookNumber: 48, languageId: 'pt' },
    ])
    // 'g' casa Gênesis E Gálatas por prefixo → ambíguo
    expect(ambiguous).toBeNull()
  })
})

describe('parseBibleReference — precedência', () => {
  it('abreviação exata vence sobre prefixo de nome', () => {
    // 'ap' = abreviação exata de Apocalipse
    expect(parseBibleReference('ap 1:1', books)?.book.id).toBe(66)
  })
})
