// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks — mesmo padrão de library-catalog.test.ts
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(),
  writeCatalogRecord: vi.fn(),
  resolveDatabaseUrl: vi.fn(() => 'https://api.test'),
}))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
  isDesktopApp: vi.fn(() => false),
}))
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'es',
}))
vi.mock('@plugins/i18n', () => ({ localeToApiPrefix: (l: string) => l.slice(0, 2), default: {} }))

import { readCatalogRecord } from '@shared/services/workspace-api'
import { loadAlbumCategories } from '../album-catalog'

function esCategories(): Array<Record<string, unknown>> {
  const album = (id: number, name: string) => ({
    id_album: id,
    name,
    url_image: null,
  })
  return [
    {
      id_category: 12,
      name: 'CDs Oficiales/año',
      slug: 'aym',
      albums: [album(9015, 'JA 2003'), album(9036, 'JA 2026')],
    },
    {
      id_category: 8,
      name: 'Varios',
      slug: 'misc',
      albums: [album(9100, 'Varios 1')],
    },
    {
      id_category: 98,
      name: 'Infantis',
      slug: 'kids',
      albums: [album(9200, 'Kids 1')],
    },
  ]
}

describe('Central de Mídia es — ordenação por slug via loadAlbumCategories (SPEC es-catalog-stale B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'es_hymnal') return [{ id_music: 1 }, { id_music: 2 }]
      if (key === 'es_hymnal_1996') return null
      if (key === 'es_categories') return esCategories()
      return null
    })
  })

  it('hymnals(1) → aym(2) → kids(3) → misc(13): ordem por slug es', async () => {
    const result = await loadAlbumCategories()
    expect(result.map((c) => c.slug ?? c.name)).toEqual([
      'Hinários',
      'aym',
      'kids',
      'misc',
    ])
  })

  it('pass-through: slug presente no AlbumCategory montado', async () => {
    const result = await loadAlbumCategories()
    const aym = result.find((c) => c.slug === 'aym')
    expect(aym?.collections.length).toBe(2)
    expect(aym?.name).toBe('CDs Oficiales/año')
  })

  it('sem slug no payload: fallback nome es "CDs Oficiales/año" = posição 2', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'es_hymnal') return [{ id_music: 1 }]
      if (key === 'es_categories')
        return esCategories().map((c) => ({ ...c, slug: undefined }))
      return null
    })
    const result = await loadAlbumCategories()
    expect(result.map((c) => c.name)).toEqual([
      'Hinários',
      'CDs Oficiales/año',
      'Infantis',
      'Varios',
    ])
  })
})
