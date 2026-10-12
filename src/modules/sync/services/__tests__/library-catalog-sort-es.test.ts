// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

import { sortCategories } from '../library-catalog'
import type { LibraryCategory } from '../../types/library'

describe('sortCategories — ordenação es por slug/nome (SPEC es-catalog-stale B)', () => {
  const cat = (id: string | number, name: string, slug?: string): LibraryCategory => ({
    id,
    name,
    albums: [],
    slug,
  })

  it('es "CDs Oficiales/año" por slug aym fica posição 2, atrás de hymnals', () => {
    const sorted = sortCategories([
      cat('zz-misc', 'Varios', 'misc'),
      cat('hymnals', 'Hinários'),
      cat(12, 'CDs Oficiales/año', 'aym'),
    ]).map((c) => c.slug ?? c.id)
    expect(sorted).toEqual(['hymnals', 'aym', 'misc'])
  })

  it('es "CDs Oficiales/año" por NOME (sem slug) também fica posição 2', () => {
    const sorted = sortCategories([
      cat('zz-outra', 'Varias'),
      cat('hymnals', 'Hinários'),
      cat(12, 'CDs Oficiales/año'),
    ]).map((c) => String(c.id))
    expect(sorted).toEqual(['hymnals', '12', 'zz-outra'])
  })

  it('kids e doxology por slug ordenam 3 e 4', () => {
    const sorted = sortCategories([
      cat('dox-es', 'Doxología', 'doxology'),
      cat('kids-es', 'Infantis', 'kids'),
      cat(12, 'CDs Oficiales/año', 'aym'),
      cat('hymnals', 'Hinários'),
    ]).map((c) => c.slug ?? c.id)
    expect(sorted).toEqual(['hymnals', 'aym', 'kids', 'doxology'])
  })

  it('PT inalterado: CDs Oficiais/Ano por nome = 2, Infantis = 3, Doxologia = 4', () => {
    const sorted = sortCategories([
      cat(99, 'Doxologia'),
      cat(98, 'Infantis'),
      cat('hymnals', 'Hinários'),
      cat(6, 'CDs Oficiais/Ano'),
    ]).map((c) => c.name)
    expect(sorted).toEqual(['Hinários', 'CDs Oficiais/Ano', 'Infantis', 'Doxologia'])
  })

  it('desconhecida (sem slug mapeado) vai pro fim (50), alfabético entre desconhecidas', () => {
    const sorted = sortCategories([
      cat('zzz', 'Zeta'),
      cat('aaa', 'Alfa'),
      cat(12, 'CDs Oficiales/año', 'aym'),
    ]).map((c) => String(c.id))
    expect(sorted).toEqual(['12', 'aaa', 'zzz'])
  })

  it('id sintético preservado: hymnals (id) vence mesmo com slug presente', () => {
    const sorted = sortCategories([
      cat(12, 'CDs Oficiales/año', 'aym'),
      cat('hymnals', 'Himnarios Oficiales', 'hymnals-unmapped'),
    ]).map((c) => String(c.id))
    expect(sorted[0]).toBe('hymnals')
  })
})
