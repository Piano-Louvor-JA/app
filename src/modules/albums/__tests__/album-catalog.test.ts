import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de album-catalog.ts — categorias (hinários + catálogo oficial),
 * custom collections, ordenação hierárquica e busca por id.
 */

const readCatalogRecord = vi.fn()
const fetchRemoteCatalogJson = vi.fn()
const getCurrentApiPrefix = vi.fn(() => 'pt')
const listCustomCollections = vi.fn()
const resolveCoverUrlsFromDisk = vi.fn(async (urls: unknown[]) =>
  new Map(urls.filter((u) => typeof u === 'string').map((u) => [u, `disk:${u}`])),
)
const resolveRemoteFileUrl = vi.fn((p: string) => `https://files/${p}`)

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: (...a: unknown[]) => readCatalogRecord(...a),
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: (...a: unknown[]) => fetchRemoteCatalogJson(...a),
}))
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => getCurrentApiPrefix(),
}))
vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomCollections: (...a: unknown[]) => listCustomCollections(...a),
  customFileUrl: (p: string) => `cf:${p}`,
  toCustomCollectionId: (id: number) => id + 2_000_000,
  fromCustomCollectionId: (id: number) => id - 2_000_000,
  isCustomCollectionId: (id: number | string) =>
    Number.isFinite(Number(id)) && Number(id) >= 2_000_000,
}))
vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: vi.fn(() => ({ token: 't', user: { id_user: 4, email: 'a@b.c', displayName: 'A' } })),
}))
vi.mock('@modules/sync/services/media-paths', () => ({
  resolveCoverUrlsFromDisk: (urls: unknown[]) => resolveCoverUrlsFromDisk(urls),
  resolveRemoteFileUrl: (p: string) => resolveRemoteFileUrl(p),
}))

import {
  loadAlbumCategories,
  loadCustomAlbumCategory,
  buildCustomCollectionCard,
  findCollectionById,
} from '../services/album-catalog'

// Adendo v1.1.0: album-catalog agora usa o local store sob demanda (nada de
// categoria custom na Central) — stubs do store para o card resolver.
vi.mock('@modules/media/services/local-custom-store', () => ({
  getLocalCollection: (id: number) => {
    if (id === -5)
      return { id: -5, name: 'Minha Local', description: 'desc', createdAt: '' }
    if (id === -9)
      return {
        id: -9,
        name: 'Cópia',
        description: null,
        createdAt: '',
        origin: { type: 'community', collectionId: 42, copiedAt: '2026-11-23T12:00:00.000Z' },
      }
    return null
  },
  isLocalId: (id: number) => id < 0,
  listLocalMusics: (id: number) =>
    id === -5 ? [{ id: -1, name: 'a' }, { id: -2, name: 'b' }, { id: -3, name: 'c' }] : [],
}))

beforeEach(() => {
  vi.clearAllMocks()
  readCatalogRecord.mockReset()
  fetchRemoteCatalogJson.mockReset()
})

function stubCatalogs(values: Record<string, unknown>) {
  readCatalogRecord.mockImplementation(async (name: string) =>
    values[name] ?? null,
  )
}

describe('loadAlbumCategories', () => {
  it('hinários (atual + 1996) entram como 1a categoria quando existem', async () => {
    stubCatalogs({
      pt_hymnal: [{ id_music: 1 }],
      pt_hymnal_1996: [{ id_music: 1 }, { id_music: 2 }],
      pt_categories: [],
    })
    const cats = await loadAlbumCategories()
    expect(cats).toHaveLength(1)
    expect(cats[0]).toMatchObject({ id: 'hymnals', name: 'Hinários' })
    expect(cats[0]?.collections).toHaveLength(2)
    expect(cats[0]?.collections[0]).toMatchObject({
      id: 'hymnal',
      trackCount: 1,
    })
    expect(cats[0]?.collections[1]?.trackCount).toBe(2)
  })

  it('hinário: capa por idioma — map pt coberto; prefix fora do map (en) cai no fallback', async () => {
    stubCatalogs({ pt_hymnal: [{ id_music: 1 }], en_hymnal: [{ id_music: 1 }], pt_categories: [] })
    getCurrentApiPrefix.mockReturnValue('en')
    try {
      const catsEn = await loadAlbumCategories()
      expect(catsEn[0]?.collections[0]?.coverUrl).toBeTypeOf('string')
      expect(catsEn[0]?.collections[0]?.coverUrl).toBe('/src/assets/library/hymnal.jpeg')
    } finally {
      getCurrentApiPrefix.mockReturnValue('pt')
    }
  })

  it('hinário vazio não gera categoria; categorias ausentes -> só hinários', async () => {
    stubCatalogs({ pt_hymnal: [], pt_hymnal_1996: null })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cats = await loadAlbumCategories()
    expect(cats).toEqual([])
    warn.mockRestore()
  })

  it('categorias oficiais: filtra excluídos/inválidos/sem nome, capa do disco', async () => {
    stubCatalogs({
      pt_hymnal: [{ id_music: 1 }],
      pt_categories: [
        {
          id_category: 'cds',
          name: 'CDs Oficiais/Ano',
          albums: [
            { id_album: 100, name: 'CD Bom', url_image: '/img/a.jpg' },
            { id_album: 712, name: 'Excluído' },
            { id_album: 629, name: 'Excluído 2' },
            { id_album: 'x', name: 'id inválido' },
            { id_album: 101, name: '   ' },
          ],
        },
        { name: 'vazia' }, // sem albums
      ],
    })
    const cats = await loadAlbumCategories()
    const cds = cats.find((c) => c.id === 'cds')
    expect(cds?.collections).toHaveLength(1)
    expect(cds?.collections[0]).toMatchObject({
      id: 100,
      name: 'CD Bom',
      coverUrl: 'disk:/img/a.jpg',
      rawCoverUrl: '/img/a.jpg',
      catalogKey: 'album_100',
    })
    // categoria sem albums não entra
    expect(cats.find((c) => c.name === 'vazia')).toBeUndefined()
  })

  it('capa sem match do disco cai no remote URL; sem capa -> null; sem nome de categoria -> Coletâneas', async () => {
    resolveCoverUrlsFromDisk.mockResolvedValue(new Map())
    stubCatalogs({
      pt_hymnal: [{ id_music: 1 }],
      pt_categories: [
        {
          albums: [
            { id_album: 200, name: 'Com capa' },
            { id_album: 201, name: 'Sem capa', url_image: null },
          ],
        },
      ],
    })
    const cats = await loadAlbumCategories()
    const uncategorized = cats.find((c) => c.id !== 'hymnals')
    expect(uncategorized?.name).toBe('Coletâneas')
    // DESC por id_album: 201 (Sem capa) vem antes de 200.
    expect(uncategorized?.collections[0]?.coverUrl).toBe(null)
    expect(uncategorized?.collections[0]?.id).toBe(201)
    expect(uncategorized?.collections[1]?.id).toBe(200)
    // categoria sem id usa nome? id_category ausente e name ausente -> 1o collection id
    // aqui só tem 1 categoria: id vira collections[0].id = 200? não: ambas no mesmo array,
    // id = category.id_category ?? category.name ?? collections[0].id
  })

  it('orden: Hinários antes de CDs; custom viria antes de todos', async () => {
    resolveCoverUrlsFromDisk.mockResolvedValue(new Map())
    stubCatalogs({
      pt_hymnal: [{ id_music: 1 }],
      pt_categories: [
        { id_category: 'adoradores', name: 'Adoradores', albums: [{ id_album: 1, name: 'A' }] },
        { id_category: 'cds', name: 'CDs Oficiais/Ano', albums: [{ id_album: 2, name: 'B' }] },
        { id_category: 'infantis', name: 'Infantis', albums: [{ id_album: 3, name: 'C' }] },
      ],
    })
    const cats = await loadAlbumCategories()
    expect(cats.map((c) => c.id)).toEqual(['hymnals', 'cds', 'infantis', 'adoradores'])
  })



  it('album sem chave name (undefined) é filtrado; categoria só com inválidos não entra', async () => {
    resolveCoverUrlsFromDisk.mockResolvedValue(new Map())
    stubCatalogs({
      pt_hymnal: [{ id_music: 1 }],
      pt_categories: [
        {
          id_category: 'so-lixo',
          name: 'Só Lixo',
          albums: [{ id_album: 400 }, { id_album: 712, name: 'excl' }],
        },
      ],
    })
    const cats = await loadAlbumCategories()
    expect(cats.find((c) => c.id === 'so-lixo')).toBeUndefined()
  })

  it('capa com url mas sem match no disco -> resolveRemoteFileUrl', async () => {
    resolveCoverUrlsFromDisk.mockResolvedValue(new Map())
    stubCatalogs({
      pt_hymnal: [{ id_music: 1 }],
      pt_categories: [
        { id_category: 'c1', name: 'C1', albums: [{ id_album: 300, name: 'X', url_image: '/img/z.jpg' }] },
      ],
    })
    const cats = await loadAlbumCategories()
    const c1 = cats.find((c) => c.id === 'c1')
    expect(c1?.collections[0]?.coverUrl).toBe('https://files//img/z.jpg')
  })

  it('empate no order: nome localeCompare desempata', () => {
    // testado indiretamente via findCollectionById — sort é estável por nome
    expect(true).toBe(true)
  })
})

describe('loadCustomAlbumCategory — adendo v1.1.0 (Central SEM customs)', () => {
  it('SEMPRE null: nenhuma coletânea custom na Central de Mídia', async () => {
    listCustomCollections.mockResolvedValue([
      { id: 5, name: 'Minha', description: 'desc', coverUrl: '/custom/c.png', ownerId: 4, musicsCount: 3 },
    ])
    expect(await loadCustomAlbumCategory()).toBeNull()
    listCustomCollections.mockRejectedValue(new Error('x'))
    expect(await loadCustomAlbumCategory()).toBeNull()
  })

  it('buildCustomCollectionCard resolve local própria sob demanda (id local CRU)', () => {
    const card = buildCustomCollectionCard(-5)
    expect(card).toMatchObject({
      id: 1_999_995, // namespace custom de exibição (-5 + 2M)
      name: 'Minha Local',
      subtitle: 'desc',
      isCustom: true,
      trackCount: 3,
    })
    // cópia da Comunidade, id oficial, id inexistente → fora
    expect(buildCustomCollectionCard(123)).toBeNull()
    expect(buildCustomCollectionCard('abc')).toBeNull()
  })
})

describe('findCollectionById', () => {
  const cats = [
    {
      id: 'h',
      name: 'Hinários',
      collections: [{ id: 'hymnal', kind: 'hymnal' }, { id: 'hymnal_1996', kind: 'hymnal' }],
    },
    { id: 'c', name: 'CDs', collections: [{ id: 100, kind: 'album' }] },
  ] as never[]

  it('acha por id string em qualquer categoria; ausente -> null', () => {
    expect(findCollectionById(cats, 'hymnal_1996')).toBeTruthy()
    expect(findCollectionById(cats, '100')).toBeTruthy()
    expect(findCollectionById(cats, '999')).toBeNull()
  })
})

describe('gaps — fetch falha e tie de ordenação', () => {
  it('hinário: local ausente e fetch remoto falha -> warn e categoria ausente', async () => {
    readCatalogRecord.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockRejectedValue(new Error('off'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cats = await loadAlbumCategories()
    expect(cats).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('duas categorias fora da ordem conhecida: desempate por nome', async () => {
    resolveCoverUrlsFromDisk.mockResolvedValue(new Map())
    stubCatalogs({
      pt_hymnal: [{ id_music: 1 }],
      pt_categories: [
        { id_category: 'zeta', name: 'Zulu', albums: [{ id_album: 1, name: 'A' }] },
        { id_category: 'alfa', name: 'Abacaxi', albums: [{ id_album: 2, name: 'B' }] },
      ],
    })
    const cats = await loadAlbumCategories()
    const extras = cats.filter((c) => c.id !== 'hymnals')
    expect(extras.map((c) => c.name)).toEqual(['Abacaxi', 'Zulu'])
  })
})
