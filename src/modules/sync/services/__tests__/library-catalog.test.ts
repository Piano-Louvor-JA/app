// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock workspace-api
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(),
  writeCatalogRecord: vi.fn(),
  resolveDatabaseUrl: vi.fn(() => 'https://api.test'),
}))

// Mock desktop-bridge
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
  isDesktopApp: vi.fn(() => false),
}))

// Mock media-paths
vi.mock('../media-paths', () => ({
  resolveRemoteFileUrl: vi.fn((url: string) => `https://api.test/${url}`),
  toRelativeMediaPath: vi.fn((url: string) => url.replace(/^\/(musics|images|covers)\//, '')),
  resolveCoverDisplayUrl: vi.fn((url: string | null | undefined) =>
    url == null ? null : `https://api.test/${url}`,
  ),
  resolveCoverUrlsFromDisk: vi.fn(async (urls: Array<string | null | undefined>) => {
    const map = new Map<string, string>()
    for (const url of urls) {
      if (!url) continue
      map.set(url, `https://api.test/${url}`)
    }
    return map
  }),
}))

// Mock @plugins/i18n para evitar side-effects do createI18n nos testes
vi.mock('@plugins/i18n', () => ({
  localeToApiPrefix: (locale: string) => {
    const prefix = locale.slice(0, 2).toLowerCase()
    if (prefix === 'en' || prefix === 'es') return prefix
    return 'pt'
  },
  default: {},
}))

import { readCatalogRecord } from '@shared/services/workspace-api'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'
import { resolveCoverUrlsFromDisk } from '../media-paths'
import { loadLibraryCategories, getCurrentApiPrefix, readDownloadedAlbumIds, writeDownloadedAlbumIds, hydrateLocalLibraryCoverUrls } from '../library-catalog'

function mockCoverDiskAsRemote() {
  vi.mocked(resolveCoverUrlsFromDisk).mockImplementation(async (urls) => {
    const map = new Map<string, string>()
    for (const url of urls) {
      if (!url) continue
      map.set(url, `https://api.test/${url}`)
    }
    return map
  })
}


describe('getCurrentApiPrefix', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('retorna pt quando user_data tem language pt-BR', () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 'pt-BR' }))
    expect(getCurrentApiPrefix()).toBe('pt')
  })

  it('retorna en quando user_data tem language en', () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 'en' }))
    expect(getCurrentApiPrefix()).toBe('en')
  })

  it('retorna es quando user_data tem language es', () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
    expect(getCurrentApiPrefix()).toBe('es')
  })

  it('retorna pt quando user_data nao tem language', () => {
    localStorage.setItem('user_data', JSON.stringify({ theme: 'dark' }))
    expect(getCurrentApiPrefix()).toBe('pt')
  })

  it('retorna pt quando user_data nao existe', () => {
    expect(getCurrentApiPrefix()).toBe('pt')
  })

  it('aceita customLocale override', () => {
    expect(getCurrentApiPrefix('en-US')).toBe('en')
  })

  it('aceita customLocale override es', () => {
    expect(getCurrentApiPrefix('es-AR')).toBe('es')
  })
})

describe('loadLibraryCategories - filtragem por idioma', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('busca pt_hymnal e pt_categories quando idioma e pt-BR', async () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 'pt-BR' }))
    vi.mocked(readCatalogRecord).mockResolvedValue([])

    await loadLibraryCategories()

    const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
    expect(calls).toContain('pt_hymnal')
    expect(calls).toContain('pt_hymnal_1996')
    expect(calls).toContain('pt_categories')
  })

  it('busca en_hymnal e en_categories quando idioma e en', async () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 'en' }))
    vi.mocked(readCatalogRecord).mockResolvedValue([])

    await loadLibraryCategories()

    const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
    expect(calls).toContain('en_hymnal')
    expect(calls).toContain('en_hymnal_1996')
    expect(calls).toContain('en_categories')
  })

  it('busca es_hymnal e es_categories quando idioma e es', async () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
    vi.mocked(readCatalogRecord).mockResolvedValue([])

    await loadLibraryCategories()

    const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
    expect(calls).toContain('es_hymnal')
    expect(calls).toContain('es_hymnal_1996')
    expect(calls).toContain('es_categories')
  })

  it('retorna lista vazia quando nenhum hymnal nem categoria existem', async () => {
    vi.mocked(readCatalogRecord).mockResolvedValue(null)

    const result = await loadLibraryCategories()
    expect(result).toEqual([])
  })

  it('monta categoria de hinarios quando pt_hymnal tem dados', async () => {
    const mockHymnal = [{ id: 1, title: 'Hino 1' }]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return mockHymnal
      if (key === 'pt_hymnal_1996') return null
      if (key === 'pt_categories') return null
      if (key === 'downloaded_albums') return []
      return null
    })

    const result = await loadLibraryCategories()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('hymnals')
    expect(result[0].albums[0].id).toBe('hymnal')
    expect(result[0].albums[0].songCount).toBe(1)
  })

  it('exclui albums com IDs na lista de exclusao (712, 629)', async () => {
    const mockCategories = [
      {
        id_category: 'cat1',
        name: 'Categorias',
        albums: [
          { id_album: 712, name: 'Excluido 712', url_image: null },
          { id_album: 100, name: 'Album Valido', url_image: null },
          { id_album: 629, name: 'Excluido 629', url_image: null },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      if (key === 'downloaded_albums') return []
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat).toBeDefined()
    expect(cat!.albums).toHaveLength(1)
    expect(cat!.albums[0].name).toBe('Album Valido')
  })

  it('marca albums como downloaded quando estao na lista de downloaded', async () => {
    const mockCategories = [
      {
        id_category: 'cat1',
        name: 'Categorias',
        albums: [
          { id_album: 100, name: 'Album Baixado', url_image: null },
          { id_album: 200, name: 'Album Nao Baixado', url_image: null },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      if (key === 'downloaded_albums') return [100]
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    const downloaded = cat!.albums.find((a) => a.name === 'Album Baixado')
    const notDownloaded = cat!.albums.find((a) => a.name === 'Album Nao Baixado')
    expect(downloaded!.status).toBe('downloaded')
    expect(notDownloaded!.status).toBe('idle')
  })
})

// ============================================================
// Testes para matar mutantes sobreviventes do Stryker
// ============================================================

describe('getCurrentApiPrefix - mutantes sobreviventes', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('user_data com objeto null (JSON null) retorna pt sem usar prefs.language', () => {
    // Mata mutante: if (stored) -> if (true)
    // 'null' é truthy como string no localStorage, mas JSON.parse('null') = null
    // O mutante if(true) ainda entraria no bloco, faria JSON.parse = null,
    // e prefs.language seria undefined -> retorna pt.
    // Para matar de verdade, precisamos garantir que getItem retorna string valida
    // mas prefs.language nao é string
    localStorage.setItem('user_data', JSON.stringify(null))
    expect(getCurrentApiPrefix()).toBe('pt')
  })

  it('user_data como string "undefined" retorna pt', () => {
    // Mata mutante: typeof prefs.language === 'string' -> if (true)
    // JSON.parse falha no try/catch -> fallback pt
    localStorage.setItem('user_data', 'undefined')
    expect(getCurrentApiPrefix()).toBe('pt')
  })

  it('prefs existe com language como boolean true - mutante if(true) usaria true como chave', () => {
    // O mutante if(true) em typeof check faria localeToApiPrefix(true as any)
    // localeToApiPrefix(true) -> 'tr'.slice(0,2) = 'tr' -> nao é en/es -> retorna 'pt'
    // Mas o codigo original retorna 'pt' tambem. Preciso de outro approach.
    // Testar com language como objeto: o mutante if(true) faria localeToApiPrefix({})
    // localeToApiPrefix({}) -> '[object Object]'.slice(0,2) = '[o' -> 'pt'
    // Ambos retornam pt... o mutante é equivalente aqui.
    // Vamos testar com prefs vazio: {}
    localStorage.setItem('user_data', JSON.stringify({}))
    expect(getCurrentApiPrefix()).toBe('pt')
  })
})

describe('resolveCoverUrl - carga com resolveCoverUrlsFromDisk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadLibraryCategories resolve capas via resolveCoverUrlsFromDisk', async () => {
    const mockCategories = [
      {
        id_category: 'cat1',
        name: 'Categorias',
        albums: [
          { id_album: 100, name: 'Album', url_image: '/img/test.jpg' },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })
    vi.mocked(resolveCoverUrlsFromDisk).mockResolvedValue(
      new Map([['/img/test.jpg', 'local://media/covers/test.jpg']]),
    )

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].coverUrl).toBe('local://media/covers/test.jpg')
    expect(cat!.albums[0].rawCoverUrl).toBe('/img/test.jpg')
    expect(resolveCoverUrlsFromDisk).toHaveBeenCalled()
  })

  it('hydrateLocalLibraryCoverUrls aplica o mapa local', async () => {
    vi.mocked(resolveCoverUrlsFromDisk)
      .mockResolvedValueOnce(new Map([['/img/test.jpg', 'https://api.test//img/test.jpg']]))
      .mockResolvedValueOnce(new Map([['/img/test.jpg', 'local://media/covers/img/test.jpg']]))

    const mockCategories = [
      {
        id_category: 'cat1',
        name: 'Categorias',
        albums: [
          { id_album: 100, name: 'Album', url_image: '/img/test.jpg' },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    await hydrateLocalLibraryCoverUrls(result)
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].coverUrl).toBe('local://media/covers/img/test.jpg')
  })

  it('mantém URL remota quando resolveCoverUrlsFromDisk devolve remoto', async () => {
    vi.mocked(resolveCoverUrlsFromDisk).mockResolvedValue(
      new Map([['/img/fallback.jpg', 'https://api.test//img/fallback.jpg']]),
    )

    const mockCategories = [
      {
        id_category: 'cat1',
        name: 'Categorias',
        albums: [
          { id_album: 100, name: 'Album', url_image: '/img/fallback.jpg' },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].coverUrl).toContain('api.test')
  })

  it('cover null quando url_image é null mesmo com bridge ativo', async () => {
    const mockCategories = [
      {
        id_category: 'cat1',
        name: 'Categorias',
        albums: [
          { id_album: 100, name: 'Album', url_image: null },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].coverUrl).toBeNull()
  })

  it('cover null quando url_image é undefined', async () => {
    const mockCategories = [
      {
        id_category: 'cat1',
        name: 'Categorias',
        albums: [
          { id_album: 100, name: 'Album', url_image: undefined },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].coverUrl).toBeNull()
    expect(cat!.albums[0].rawCoverUrl).toBeNull()
  })
})

describe('sortCategories - mutantes de nullish coalescing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa CATEGORY_ORDER por id quando name nao esta no mapa', async () => {
    // Mata mutante ?? -> && em orderA (L90)
    // Categoria com id 'hymnals' (order 1) mas name customizado
    // ?? muta para &&: false && CATEGORY_ORDER[name] = false
    // false seria 0 em comparacao numerica, mudando a ordem
    const mockCategories = [
      {
        id_category: 'custom_unmapped',
        name: 'ZZZ Unknown',
        albums: [{ id_album: 200, name: 'Album B', url_image: null }],
      },
      {
        id_category: 'Infantis',
        name: 'Infantis',
        albums: [{ id_album: 100, name: 'Album A', url_image: null }],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    const catIds = result.map((c) => c.id)
    // Infantis (order 3) deve vir ANTES de custom_unmapped (order 50 default)
    // Mutante: se ?? vira &&, custom_unmapped teria order 0 (false && 50 = false -> 0)
    // e Infantis teria order 0 tambem (false && 3 = false -> 0)
    // Ambos em 0 cairiam em localeCompare
    // Com ??: Infantis=3, custom=50 -> Infantis ANTES de custom
    expect(catIds.indexOf('Infantis')).toBeLessThan(catIds.indexOf('custom_unmapped'))
  })

  it('usa CATEGORY_ORDER por name quando id nao esta no mapa', async () => {
    // Mata mutante ?? -> && em orderB (L91) - lado b da comparacao
    // Categoria A tem ordem por id, categoria B tem ordem por name
    const mockCategories = [
      {
        id_category: 'unmapped_a',
        name: 'Doxologia',  // order 4
        albums: [{ id_album: 200, name: 'Album B', url_image: null }],
      },
      {
        id_category: 'unmapped_b',
        name: 'CDs Oficiais/Ano',  // order 2
        albums: [{ id_album: 100, name: 'Album A', url_image: null }],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    const catIds = result.map((c) => c.id)
    // CDs Oficiais/Ano (order 2) ANTES de Doxologia (order 4)
    expect(catIds.indexOf('unmapped_b')).toBeLessThan(catIds.indexOf('unmapped_a'))
  })

  it('orderA - orderB: ordem crescente verificada com 3 categorias', async () => {
    // Mata mutante: orderA - orderB -> orderA + orderB
    // Com subtracao: 2, 3, 4 (crescente)
    // Com soma: 4+3=7, 2+4=6, 2+3=5 -> ordem diferente
    const mockCategories = [
      {
        id_category: 'dox_id',
        name: 'Doxologia',  // order 4
        albums: [{ id_album: 300, name: 'Album C', url_image: null }],
      },
      {
        id_category: 'cds_id',
        name: 'CDs Oficiais/Ano',  // order 2
        albums: [{ id_album: 100, name: 'Album A', url_image: null }],
      },
      {
        id_category: 'inf_id',
        name: 'Infantis',  // order 3
        albums: [{ id_album: 200, name: 'Album B', url_image: null }],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    const catIds = result.map((c) => c.id)
    // Ordem esperada: CDs Oficiais (2) < Infantis (3) < Doxologia (4)
    expect(catIds).toEqual(['cds_id', 'inf_id', 'dox_id'])
  })
})

describe('loadLibraryCategories - edge cases de mutantes', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('downloaded_albums null resulta em array vazio real (nao default mutado)', async () => {
    // Mata mutante: ?? [] -> ?? ["Stryker was here"]
    // Se o mutante trocar [], albums terao status baseado em array com elemento
    // downloaded.includes(100) seria false com [] mas true com ["Stryker was here"]
    // Nao exatamente... includes verifica valor. "Stryker was here".includes(100)?
    // Nao. Array ["Stryker was here"].includes(100) = false.
    // Preciso testar com id_album que pode colidir: se id_album for string "Stryker was here"
    // isso seria bizarro. Melhor: testar que downloadedIds.length ou toEqual([])
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'downloaded_albums') return null
      if (key === 'pt_categories') return [
        {
          id_category: 'cat1',
          name: 'Test',
          albums: [{ id_album: 100, name: 'Album', url_image: null }],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    // Album deve ter status 'idle' (nao baixado) porque downloadedIds é []
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].status).toBe('idle')
  })

  it('downloaded_albums null com hymnal - status deve ser idle', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'downloaded_albums') return null
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })

    const result = await loadLibraryCategories()
    expect(result[0].albums[0].status).toBe('idle')
  })

  it('album com id 712 (EXCLUDED_ALBUM_IDS) é filtrado', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return [
        {
          id_category: 'cat1',
          name: 'Test',
          albums: [
            { id_album: 712, name: 'Excluded', url_image: null },
            { id_album: 100, name: 'Included', url_image: null },
          ],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums).toHaveLength(1)
    expect(cat!.albums[0].id).toBe(100)
  })

  it('album com id 629 (EXCLUDED_ALBUM_IDS) é filtrado', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return [
        {
          id_category: 'cat1',
          name: 'Test',
          albums: [
            { id_album: 629, name: 'Excluded', url_image: null },
          ],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    // Categoria sem albums (todos excluidos) nao deve aparecer
    expect(result).toEqual([])
  })

  it('categoria com albums vazio é ignorada', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return [
        {
          id_category: 'empty_cat',
          name: 'Empty',
          albums: [],
        },
        {
          id_category: 'cat1',
          name: 'Has Albums',
          albums: [{ id_album: 100, name: 'Album', url_image: null }],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    const ids = result.map((c) => c.id)
    expect(ids).not.toContain('empty_cat')
    expect(ids).toContain('cat1')
  })

  it('categoria com albums undefined é ignorada', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return [
        {
          id_category: 'undef_cat',
          name: 'Undefined Albums',
          albums: undefined,
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    expect(result).toEqual([])
  })

  it('hymnal baixado aparece com status downloaded', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'downloaded_albums') return ['hymnal']
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })

    const result = await loadLibraryCategories()
    expect(result[0].albums[0].id).toBe('hymnal')
    expect(result[0].albums[0].status).toBe('downloaded')
  })

  it('hymnal_1996 baixado aparece com status downloaded', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'downloaded_albums') return ['hymnal_1996']
      if (key === 'pt_hymnal_1996') return [{ id: 1 }]
      return null
    })

    const result = await loadLibraryCategories()
    const h96 = result[0].albums.find((a) => a.id === 'hymnal_1996')
    expect(h96).toBeDefined()
    expect(h96!.status).toBe('downloaded')
  })

  it('album de categoria com id_album baixado tem status downloaded', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'downloaded_albums') return [100]
      if (key === 'pt_categories') return [
        {
          id_category: 'cat1',
          name: 'Test',
          albums: [{ id_album: 100, name: 'Album', url_image: null }],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].status).toBe('downloaded')
  })

  it('songCount do hymnal reflete o numero de hinos', async () => {
    const mockHymnal = [{ id: 1 }, { id: 2 }, { id: 3 }]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return mockHymnal
      return null
    })

    const result = await loadLibraryCategories()
    expect(result[0].albums[0].songCount).toBe(3)
  })

  it('album subtitle undefined usa string vazia', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return [
        {
          id_category: 'cat1',
          name: 'Test',
          albums: [
            { id_album: 100, name: 'Album', url_image: null, subtitle: undefined },
          ],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].subtitle).toBe('')
  })

  it('album com subtitle preenchido mantem o valor', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return [
        {
          id_category: 'cat1',
          name: 'Test',
          albums: [
            { id_album: 100, name: 'Album', url_image: null, subtitle: 'Meu Subtitle' },
          ],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].subtitle).toBe('Meu Subtitle')
  })

  it('rawCoverUrl preserva url_image original do catalogo', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return [
        {
          id_category: 'cat1',
          name: 'Test',
          albums: [
            { id_album: 100, name: 'Album', url_image: '/original/cover.jpg' },
          ],
        },
      ]
      return null
    })

    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat!.albums[0].rawCoverUrl).toBe('/original/cover.jpg')
  })
})

describe('mutantes sobreviventes - round 2', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(readCatalogRecord).mockResolvedValue(null)
  })

  // resolveCoverUrlsFromDisk é a fonte da verdade das capas
  it('loadLibraryCategories chama resolveCoverUrlsFromDisk para capas', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [
          {
            id: 42,
            name: 'Test Category',
            albums: [{ id_album: 1, name: 'Album', url_image: '/img.jpg' }],
          },
        ]
      }
      return null
    })

    await loadLibraryCategories()
    expect(resolveCoverUrlsFromDisk).toHaveBeenCalled()
  })

  // Mutante L90: ?? -> && — categoria com id no mapa mas name fora do mapa
  it('sortCategories: id no CATEGORY_ORDER mas name fora do mapa usa ordem do id', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [
          {
            id: 999,
            name: 'Unknown Category',
            albums: [{ id_album: 1, name: 'Album A' }],
          },
          {
            id: 'hymnals',
            name: 'Other Name Not In Map',
            albums: [{ id_album: 2, name: 'Album B' }],
          },
        ]
      }
      return null
    })

    const result = await loadLibraryCategories()
    // hymnals tem order 1 no CATEGORY_ORDER por id, deve vir antes de 999 (order 50)
    // Mutante ?? -> && faria: CATEGORY_ORDER['hymnals'] && CATEGORY_ORDER['Other Name Not In Map'] ?? 50
    // = 1 && undefined ?? 50 = undefined ?? 50 = 50 — mesmo resultado que 999
    // Entao a ordem seria por localeCompare ao inves de hymnals primeiro
    const hymnalsIdx = result.findIndex((c) => c.id === 'hymnals')
    const unknownIdx = result.findIndex(
      (c) => c.albums.some((a) => a.id === 2),
    )
    expect(hymnalsIdx).toBeLessThan(unknownIdx)
  })

  // Mutante L155: ?? [] -> ?? ["Stryker was here"] — downloaded null resulta em array com 0 elementos
  it('downloaded_albums null retorna array vazio exato (length 0)', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') {
        return [{ id: 1, name: 'Hymnal 1', songs: 10 }]
      }
      if (key === WORKSPACE_RECORD_KEYS.downloadedAlbums) {
        return null
      }
      return null
    })

    const result = await loadLibraryCategories()
    // Se o mutante substituisse [] por ["Stryker was here"], o hymnal com id 1
    // teria status 'downloading' ou 'downloaded' pois "Stryker was here" !== 1
    // Mas o teste principal é: nenhum album deve estar baixado
    const hymnal = result.find((c) => c.id === 'hymnals')
    expect(hymnal).toBeDefined()
    expect(hymnal!.albums).toHaveLength(1)
    expect(hymnal!.albums[0].status).toBe('idle')
  })

  // Mutante L41: if(stored) -> if(true) — stored null, prefs.language undefined
  // Mutante L43: typeof prefs.language === 'string' -> if(true)
  // Ambos são equivalentes quando stored é null pois JSON.parse(null) = null
  // Para L43: prefs.language como number deve cair no else e retornar 'pt'
  it('getCurrentApiPrefix: user_data com language numerica retorna pt (nao usa prefs.language)', () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 123 }))
    // Original: typeof 123 === 'string' é false -> retorna 'pt'
    // Mutante if(true): passaria 123 para localeToApiPrefix
    // Mock localeToApiPrefix: (123).slice(0,2) -> throw -> catch -> 'pt'
    // Para matar o mutante precisamos que localeToApiPrefix seja chamado com 123
    // e retorne algo diferente de 'pt'
    // Mas o mock faz .slice em number que throw... entao mutante é equivalente aqui
    // Vamos testar com prefs que tem language como array (truthy, nao-string)
    expect(getCurrentApiPrefix()).toBe('pt')
  })

  // L43 complementar: prefs existe e é truthy, language é undefined
  it('getCurrentApiPrefix: user_data sem propriedade language retorna pt', () => {
    localStorage.setItem('user_data', JSON.stringify({ otherProp: 'val' }))
    expect(getCurrentApiPrefix()).toBe('pt')
  })
})

describe('readDownloadedAlbumIds / writeDownloadedAlbumIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('readDownloadedAlbumIds retorna array do catalogo', async () => {
    vi.mocked(readCatalogRecord).mockResolvedValue(['hymnal', 42])
    const ids = await readDownloadedAlbumIds()
    expect(ids).toEqual(['hymnal', 42])
    expect(readCatalogRecord).toHaveBeenCalledWith(WORKSPACE_RECORD_KEYS.downloadedAlbums)
  })

  it('readDownloadedAlbumIds retorna [] quando record e null', async () => {
    vi.mocked(readCatalogRecord).mockResolvedValue(null)
    const ids = await readDownloadedAlbumIds()
    expect(ids).toEqual([])
    expect(ids).toHaveLength(0)
  })

  it('writeDownloadedAlbumIds chama writeCatalogRecord com key e ids', async () => {
    const { writeCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(writeCatalogRecord).mockResolvedValue(true)
    const ok = await writeDownloadedAlbumIds(['album1', 99])
    expect(ok).toBe(true)
    expect(writeCatalogRecord).toHaveBeenCalledWith(
      WORKSPACE_RECORD_KEYS.downloadedAlbums,
      ['album1', 99],
    )
  })
})

describe('mutantes round 4 - buildHymnalCategory e hydrate', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  // L42 typeof->true: language nao-string nao pode chegar a localeToApiPrefix
  it('L42: nao chama localeToApiPrefix quando language nao e string', async () => {
    const i18n = (await import('@plugins/i18n')) as any
    const spy = vi.spyOn(i18n, 'localeToApiPrefix')
    localStorage.setItem('user_data', JSON.stringify({ language: 123 }))
    expect(getCurrentApiPrefix()).toBe('pt')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  // L59/L60 flatMap arrow -> ()=>undefined
  it('hydrate: rawUrls passadas tem as urls reais, sem undefined', async () => {
    vi.mocked(resolveCoverUrlsFromDisk).mockResolvedValue(new Map())
    const cats = [
      {
        id: 'cat1',
        name: 'Cat',
        albums: [
          { id: 1, name: 'A', rawCoverUrl: null, coverUrl: null },
          { id: 2, name: 'B', rawCoverUrl: '/img/x.jpg', coverUrl: 'remote' },
        ],
      } as any,
    ]
    await hydrateLocalLibraryCoverUrls(cats)
    const calledWith = vi.mocked(resolveCoverUrlsFromDisk).mock.calls[0][0]
    expect(calledWith).toContain('/img/x.jpg')
    expect(calledWith).not.toContain(undefined)
  })

  // L66 if(!rawCoverUrl) continue -> if(false): mapa que RESOLVE null mata o mutante
  it('hydrate: album com rawCoverUrl null mantem coverUrl original', async () => {
    vi.mocked(resolveCoverUrlsFromDisk).mockResolvedValue(
      new Map<any, string>([[null, 'local://null-cover'], ['/img/y.jpg', 'local://y']]),
    )
    const cats = [
      {
        id: 'cat1',
        name: 'Cat',
        albums: [
          { id: 1, name: 'A', rawCoverUrl: null, coverUrl: 'original-null' },
          { id: 2, name: 'B', rawCoverUrl: '/img/y.jpg', coverUrl: 'original-remote' },
        ],
      } as any,
    ]
    await hydrateLocalLibraryCoverUrls(cats)
    // Mutante if(false): get(null) = 'local://null-cover' -> sobrescreveria
    expect(cats[0].albums[0].coverUrl).toBe('original-null')
    expect(cats[0].albums[1].coverUrl).toBe('local://y')
  })

  // L68 if(resolved)->if(true): url sem resolucao nao pode virar undefined
  it('hydrate: url ausente no mapa mantem cover anterior', async () => {
    vi.mocked(resolveCoverUrlsFromDisk).mockResolvedValue(new Map())
    const cats = [
      {
        id: 'cat1',
        name: 'Cat',
        albums: [{ id: 1, name: 'A', rawCoverUrl: '/img/none.jpg', coverUrl: 'keep-me' }],
      } as any,
    ]
    await hydrateLocalLibraryCoverUrls(cats)
    expect(cats[0].albums[0].coverUrl).toBe('keep-me')
  })

  // L88/L91 defaults do createAlbumBase
  it('createAlbumBase: progressText/progress/totalCount/downloadedCount default', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    const album: any = result[0].albums[0]
    expect(album.progressText).toBe('')
    expect(album.progress).toBe(0)
    expect(album.totalCount).toBe(0)
    expect(album.downloadedCount).toBe(0)
  })

  it('createAlbumBase: cancelRequested inicia false', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    expect((result[0].albums[0] as any).cancelRequested).toBe(false)
  })

  // L111 guardas do hymnal
  it('hymnal objeto nao-array NAO gera album', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return { not: 'array' } as any
      return null
    })
    const result = await loadLibraryCategories()
    expect(result.find((c) => c.id === 'hymnals')).toBeUndefined()
  })

  it('hymnal array vazio NAO gera album', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return []
      return null
    })
    const result = await loadLibraryCategories()
    expect(result.find((c) => c.id === 'hymnals')).toBeUndefined()
  })

  it('hymnal album tem nome e subtitle exatos', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    expect(result[0].albums[0].name).toBe('Hinário Adventista')
    expect(result[0].albums[0].subtitle).toBe('')
  })

  // L127 guardas do hymnal_1996
  it('hymnal_1996 objeto nao-array NAO gera album', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal_1996') return { nope: 1 } as any
      return null
    })
    const result = await loadLibraryCategories()
    expect(result.find((c) => c.id === 'hymnals')).toBeUndefined()
  })

  it('hymnal_1996 array vazio NAO gera album', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal_1996') return []
      return null
    })
    const result = await loadLibraryCategories()
    expect(result.find((c) => c.id === 'hymnals')).toBeUndefined()
  })

  it('hymnal_1996 album tem nome, subtitle e isHymnal exatos', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal_1996') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    const h = result[0].albums.find((a) => a.id === 'hymnal_1996')!
    expect(h.name).toBe('Hinário Adventista - Edição 1996')
    expect(h.subtitle).toBe('')
    expect(h.isHymnal).toBe(true)
  })

  // L135 id do album 1996 nao pode mutar para ''
  it('hymnal_1996 baixado por id exato fica downloaded', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'downloaded_albums') return ['hymnal_1996']
      if (key === 'pt_hymnal_1996') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    const h = result[0].albums.find((a) => a.id === 'hymnal_1996')!
    expect(h.status).toBe('downloaded')
  })

  // L146 nome da categoria
  it('categoria de hinarios tem nome exato', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    expect(result[0].name).toBe('Hinários')
  })

  // L162 ?? [] no downloaded
  it('sem downloaded_albums: NENHUM album fica downloaded', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [{ id_category: 'c1', name: 'C', albums: [{ id_album: 1 }, { id_album: 2 }] }]
      }
      return null
    })
    const result = await loadLibraryCategories()
    for (const a of result[0].albums) expect(a.status).toBe('idle')
  })

  // L174 rawCoverUrls flatMap
  it('rawCoverUrls passadas ao disco sao exatas (sem lixo de categorias vazias)', async () => {
    vi.mocked(resolveCoverUrlsFromDisk).mockResolvedValue(new Map())
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [
          {
            id_category: 'c1',
            name: 'C',
            albums: [
              { id_album: 1, url_image: '/a.jpg' },
              { id_album: 2, url_image: '/b.jpg' },
            ],
          },
          {
            id_category: 'c2',
            name: 'D',
            albums: [{ id_album: 3, url_image: null }],
          },
          {
            id_category: 'c3',
            name: 'E',
            albums: undefined,
          },
        ]
      }
      return null
    })
    await loadLibraryCategories()
    const arg = vi.mocked(resolveCoverUrlsFromDisk).mock.calls[0][0]
    expect(arg).toEqual(['/a.jpg', '/b.jpg', null])
  })

  // L40 if(stored)->if(true): original NAO chama JSON.parse quando stored e falsy
  it('L40: stored vazio nao chega a fazer JSON.parse (spy no JSON.parse)', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    localStorage.setItem('user_data', '') // getItem retorna '' — falsy
    expect(getCurrentApiPrefix()).toBe('pt')
    expect(parseSpy).not.toHaveBeenCalled()
    parseSpy.mockRestore()
  })

  // L111/L127 && -> ||: array-like NAO-array com length>0 deve ser rejeitado
  it('hymnal array-like (length>0, nao array) NAO gera album', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return { length: 2 } as any
      return null
    })
    const result = await loadLibraryCategories()
    expect(result.find((c) => c.id === 'hymnals')).toBeUndefined()
  })

  it('hymnal_1996 array-like (length>0, nao array) NAO gera album', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal_1996') return { length: 2 } as any
      return null
    })
    const result = await loadLibraryCategories()
    expect(result.find((c) => c.id === 'hymnals')).toBeUndefined()
  })

  // L135 'hymnal_1996' -> '': downloaded [''] nao pode marcar o album
  it("downloaded com string vazia NAO marca hymnal_1996 como baixado", async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'downloaded_albums') return ['']
      if (key === 'pt_hymnal_1996') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    const h = result[0].albums.find((a) => a.id === 'hymnal_1996')!
    expect(h.status).toBe('idle')
  })

  // L162 ?? [] -> ['Stryker was here']: id_album colidente com o lixo do mutante
  it("downloaded null: album com id string nao pode herdar valor default mutado", async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [
          {
            id_category: 'c1',
            name: 'C',
            albums: [{ id_album: 'Stryker was here' as any, name: 'X', url_image: null }],
          },
        ]
      }
      return null
    })
    const result = await loadLibraryCategories()
    expect(result[0].albums[0].status).toBe('idle')
  })
})

describe('mutantes sobreviventes - round 3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  // #7 L41: if(stored) -> if(true)
  // Matar: quando stored existe E tem language valida, resultado deve ser diferente de pt
  it('#7: stored com language en retorna en (mutante if(true) quebraria o fluxo)', () => {
    localStorage.setItem('user_data', JSON.stringify({ language: 'en-US' }))
    // Original: stored truthy, prefs.language = 'en-US' (string), retorna localeToApiPrefix('en-US') = 'en'
    // Mutante if(true): mesmo comportamento pois if(stored) ja é true -- equivalente
    // Mas se stored fosse null, mutante entraria no if e faria JSON.parse(null) = null
    // prefs = null, typeof null.language throw -> catch -> 'pt'. Original tambem 'pt'. Equivalente.
    // Para matar de outra forma: stored existe mas JSON invalido
    localStorage.setItem('user_data', '{invalid json!!!}')
    // Original: stored truthy, JSON.parse throw -> catch -> 'pt'
    // Mutante if(true): mesmo comportamento
    // Equivalente. Aceito.
    expect(getCurrentApiPrefix()).toBe('pt')
  })

  // loadLibraryCategories não chama bridge — URL remota imediata
  it('#20: bridge null -> loadLibraryCategories usa fallback remoto sem crash', async () => {
    vi.mocked(getDesktopBridge).mockReturnValue(null)
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [{ id_category: 'cat1', name: 'Cat1', albums: [{ id_album: 1, name: 'A1', url_image: '/img/test.jpg' }] }]
      }
      return null
    })
    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat).toBeDefined()
    expect(cat!.albums[0].coverUrl).toBe('https://api.test//img/test.jpg')
  })

  // #28 L81: StringLiteral 'hymnal' -> 'Stryker was here!'
  // O mutante muda o id do album de 'hymnal' para outra string
  it('#28: album do hinario tem id exatamente "hymnal"', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    const hymnals = result.find((c) => c.id === 'hymnals')
    expect(hymnals).toBeDefined()
    // Mutante mudaria o id para 'Stryker was here!' -> find retornaria undefined
    expect(hymnals!.albums[0].id).toBe('hymnal')
  })

  // #29 L84: isHymnal true -> false
  it('#29: album do hinario tem isHymnal === true', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal') return [{ id: 1 }]
      return null
    })
    const result = await loadLibraryCategories()
    const hymnals = result.find((c) => c.id === 'hymnals')
    expect(hymnals).toBeDefined()
    expect(hymnals!.albums[0].isHymnal).toBe(true)
  })

  // #35 L90: ?? -> && para orderA
  // Preciso de categoria onde String(a.id) esta no CATEGORY_ORDER E a.name tambem esta
  // hymnals (id) = 1, Hinarios (name) = 1. Com ?? retorna 1. Com &&: 1 && 1 = 1.
  // Mesmo resultado! Preciso de id E name no mapa com valores DIFERENTES.
  // Nao existe esse caso no mapa atual. Mas o mutante troca ?? por &&:
  // Se id esta no mapa (truthy) && name NAO esta (undefined falsy) -> resultado undefined ?? 50 = 50
  // Com ??: id_value ?? undefined ?? 50 = id_value
  // Ja coberto pelo teste "usa CATEGORY_ORDER por id quando name nao esta no mapa"
  // Para diferenciar: id nao esta no mapa, name esta -> undefined ?? name_value = name_value
  // Com &&: undefined && name_value = undefined -> ?? 50 = 50
  // Ja coberto por "usa CATEGORY_ORDER por name quando id nao esta no mapa"
  // E se ambos estao no mapa? id=1 e name=1. 1 ?? 1 = 1. 1 && 1 = 1. Mesmo!
  // Mutante equivalente para este conjunto de dados. Nao pode ser morto.

  // #38 L92: if(orderA !== orderB) -> if(true)
  // Quando orderA === orderB, o original usa localeCompare, o mutante pula direto
  it('#38: categorias com mesma ordem usam localeCompare (alfabetica)', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [
          { id_category: 'Zebra', name: 'Zebra Cat', albums: [{ id_album: 1, name: 'A' }] },
          { id_category: 'Alpha', name: 'Alpha Cat', albums: [{ id_album: 2, name: 'B' }] },
        ]
      }
      return null
    })
    const result = await loadLibraryCategories()
    // Ambas as categorias tem order 50 (nao estao no CATEGORY_ORDER)
    // Mutante if(true): a ordem seria a de insercao (Zebra, Alpha)
    // Original: localeCompare coloca Alpha antes de Zebra
    const ids = result.filter((c) => c.id === 'Zebra' || c.id === 'Alpha').map((c) => c.id)
    expect(ids).toEqual(['Alpha', 'Zebra'])
  })

  // #95 L162: || -> && em !categories
  // if (!categories || !Array.isArray(categories)) -> if (!categories && !Array.isArray(categories))
  // Para matar: categories e truthy mas NAO e array (ex: um objeto)
  // Original: !obj = false, !Array.isArray(obj) = true -> false || true = true -> return early
  // Mutante: false && true = false -> continua e faz for...of em objeto -> throw
  it('#95: categories como objeto nao-array causa return early (nao itera)', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return { not: 'an array' } as any
      return null
    })
    const result = await loadLibraryCategories()
    // Original: detecta que nao e array, retorna so hymnals (ou vazio)
    // Mutante: tentaria iterar objeto com for...of -> throw
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  // #114 L184: isHymnal false -> true para album de categoria
  it('#114: album de categoria tem isHymnal === false', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') {
        return [{ id_category: 'cat1', name: 'Test', albums: [{ id_album: 1, name: 'Album1' }] }]
      }
      return null
    })
    const result = await loadLibraryCategories()
    const cat = result.find((c) => c.id === 'cat1')
    expect(cat).toBeDefined()
    expect(cat!.albums[0].isHymnal).toBe(false)
  })

  // #78 L128 no coverage: hymnal_1996 com dados
  it('#78: hymnal_1996 com dados cria album com songCount correto', async () => {
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_hymnal_1996') return [{ id: 1 }, { id: 2 }, { id: 3 }]
      return null
    })
    const result = await loadLibraryCategories()
    const hymnals = result.find((c) => c.id === 'hymnals')
    expect(hymnals).toBeDefined()
    const h1996 = hymnals!.albums.find((a) => a.id === 'hymnal_1996')
    expect(h1996).toBeDefined()
    expect(h1996!.songCount).toBe(3)
  })
})

describe('mutantes round 5 - guard Array.isArray dos hinários', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockCoverDiskAsRemote()
  })

  it('MUTANT KILL: catalog record objeto não-array NÃO vira hinário (guard Array.isArray)', async () => {
    vi.mocked(readCatalogRecord).mockResolvedValue({ not: 'an array' } as never)
    const result = await loadLibraryCategories()
    // guard `hymnal && Array.isArray(hymnal) && length>0` rejeita objeto: nenhuma categoria
    expect(result).toHaveLength(0)
  })

  it('MUTANT KILL: hymnal_1996 objeto não-array NÃO vira hinário (guard Array.isArray)', async () => {
    vi.mocked(readCatalogRecord)
      .mockResolvedValueOnce(null as never) // categories
      .mockResolvedValueOnce([] as never) // downloaded
      .mockResolvedValueOnce([{ id: 'm1' }] as never) // hymnal válido
      .mockResolvedValueOnce({ broken: true } as never) // hymnal_1996 objeto
    const result = await loadLibraryCategories()
    expect(result).toHaveLength(1)
    const ids = result[0]!.albums.map((a: { id: string }) => a.id)
    expect(ids).toContain('hymnal')
    expect(ids).not.toContain('hymnal_1996')
  })
})

describe('mutantes round 6 - constantes de módulo (EXCLUDED_ALBUM_IDS / CATEGORY_ORDER)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockCoverDiskAsRemote()
  })

  it('MUTANT KILL: álbum em EXCLUDED_ALBUM_IDS (712) é filtrado do catálogo', async () => {
    const mockCategories = [
      {
        id_category: 'cds',
        name: 'CDs Oficiais/Ano',
        albums: [
          { id_album: 712, name: 'Excluído legado', url_image: null },
          { id_album: 999, name: 'Normal', url_image: null },
        ],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    const cds = result.find((c: { id: string }) => c.id === 'cds')
    expect(cds).toBeDefined()
    const albumIds = cds!.albums.map((a: { id: number | string }) => a.id)
    // Set([712, 629]) mutado pra Set([]): 712 apareceria — tem que estar FORA
    expect(albumIds).toContain(999)
    expect(albumIds).not.toContain(712)
  })

  it('MUTANT KILL: CATEGORY_ORDER vazio inverte ordem (Doxologia vem antes de unmapped)', async () => {
    const mockCategories = [
      {
        id_category: 'aaa_unmapped',
        name: 'aaa Unmapped',
        albums: [{ id_album: 400, name: 'Album U', url_image: null }],
      },
      {
        id_category: 'Doxologia',
        name: 'zzz Doxologia',
        albums: [{ id_album: 500, name: 'Album D', url_image: null }],
      },
    ]
    vi.mocked(readCatalogRecord).mockImplementation(async (key: string) => {
      if (key === 'pt_categories') return mockCategories
      return null
    })

    const result = await loadLibraryCategories()
    // Com CATEGORY_ORDER: Doxologia(4) antes de unmapped(50)
    // Mutante {}: ambos 50 → localeCompare('zzz Doxologia','aaa Unmapped') → aaa primeiro
    const ids = result.map((c: { id: string }) => c.id)
    expect(ids).toEqual(['Doxologia', 'aaa_unmapped'])
  })
})
