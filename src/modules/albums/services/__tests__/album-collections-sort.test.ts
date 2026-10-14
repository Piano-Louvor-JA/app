import { describe, expect, it } from 'vitest'

import { sortCollectionsRecentFirst } from '../album-catalog'

import type { AlbumCollection } from '../../types/albums'

function col(id: number | string, name: string): AlbumCollection {
  return {
    id,
    kind: 'album',
    name,
    subtitle: '',
    coverUrl: null,
    trackCount: null,
    catalogKey: `album_${id}`,
  }
}

describe('Central de Mídia — coletâneas da mais recente pra mais antiga', () => {
  it('ES: inverte ordem da API (2003 primeiro) para 2026 primeiro', () => {
    // Ordem CRUA da API STG (order ASC = mais antigo primeiro)
    const apiOrder = [
      col(9015, 'JA 2003 - Enséñame a Servir'),
      col(9016, 'JA 2004 - Señor, Somos Tú Voz'),
      col(9036, 'JA 2026 - Mi Lugar En El Mundo'),
    ]
    const sorted = sortCollectionsRecentFirst(apiOrder).map((c) => c.name)
    expect(sorted).toEqual([
      'JA 2026 - Mi Lugar En El Mundo',
      'JA 2004 - Señor, Somos Tú Voz',
      'JA 2003 - Enséñame a Servir',
    ])
  })

  it('PT: preserva 2026 primeiro (id desc coincide com ordem atual)', () => {
    const apiOrder = [
      col(727, 'Meu Lugar no Mundo'),
      col(723, 'Maranata'),
      col(1, 'Nosso Sol é Jesus'),
    ]
    const sorted = sortCollectionsRecentFirst(apiOrder).map((c) => c.name)
    expect(sorted).toEqual(['Meu Lugar no Mundo', 'Maranata', 'Nosso Sol é Jesus'])
  })

  it('mistura: id numérico antes de id custom (fallback map de capa es/pt)', () => {
    const sorted = sortCollectionsRecentFirst([col('custom', 'Custom'), col(9036, 'JA 2026'), col(9015, 'JA 2003')])
    expect(sorted.map((c) => c.name)).toEqual(['JA 2026', 'JA 2003', 'Custom'])
  })

  it('ids não numéricos caem no fim, alfabético', () => {
    const mixed = [col(9015, 'JA 2003'), col('beta', 'Beta'), col('alfa', 'Alfa')]
    const sorted = sortCollectionsRecentFirst(mixed).map((c) => String(c.id))
    expect(sorted[0]).toBe('9015')
    expect(sorted.slice(1)).toEqual(['alfa', 'beta'])
  })

  it('não muta o array original', () => {
    const apiOrder = [col(9015, 'A'), col(9036, 'B')]
    const copy = [...apiOrder]
    sortCollectionsRecentFirst(apiOrder)
    expect(apiOrder.map((c) => c.name)).toEqual(copy.map((c) => c.name))
  })
})
