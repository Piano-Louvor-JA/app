import { describe, expect, it } from 'vitest'

import type { BibleBook, BibleTestament } from '../types/bible'
import { resolveTestament } from '../services/bible-catalog'

const books: BibleBook[] = [
  { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50, bookNumber: 1, languageId: 'pt' },
  { id: 2, name: 'Êxodo', abbreviation: 'Ex', chapters: 40, bookNumber: 2, languageId: 'pt' },
  { id: 66, name: 'Apocalipse', abbreviation: 'Ap', chapters: 22, bookNumber: 66, languageId: 'pt' },
]

/**
 * Espelha a regra de filteredBooks p/ provar D1/D2 sem montar a store inteira.
 * O teste de integração real está em bible-store-search.integration.test.ts.
 */
function filterBooks(list: BibleBook[], query: string, testament: BibleTestament): BibleBook[] {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return list.filter((book) => {
    if (!q) return resolveTestament(book.bookNumber) === testament
    const name = book.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const abbr = book.abbreviation.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return name.includes(q) || abbr.includes(q)
  })
}

describe('filteredBooks — D1: busca independe do testamento', () => {
  it('"apocalipse" com AT ativo retorna Apocalipse', () => {
    const result = filterBooks(books, 'apocalipse', 'ot')
    expect(result.map((b) => b.name)).toEqual(['Apocalipse'])
  })

  it('"genesis" com NT ativo retorna Gênesis', () => {
    const result = filterBooks(books, 'genesis', 'nt')
    expect(result.map((b) => b.name)).toEqual(['Gênesis'])
  })

  it('sem query: filtro AT preserva só AT', () => {
    const result = filterBooks(books, '', 'ot')
    expect(result.map((b) => b.name)).toEqual(['Gênesis', 'Êxodo'])
  })
})

describe('filteredBooks — D2: fold diacrítico', () => {
  it('"genesis" casa "Gênesis"', () => {
    expect(filterBooks(books, 'genesis', 'ot').map((b) => b.name)).toEqual(['Gênesis'])
  })

  it('"ap" casa abreviação de Apocalipse (fold)', () => {
    expect(filterBooks(books, 'ap', 'ot').map((b) => b.name)).toEqual(['Apocalipse'])
  })
})
