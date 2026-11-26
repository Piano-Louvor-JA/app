// @vitest-environment jsdom
// liturgy-catalog — parseCatalogDurationMs, sortMusicOptions, filterLiturgyMusicOptions
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  parseCatalogDurationMs,
  sortMusicOptions,
  filterLiturgyMusicOptions,
} from '../liturgy-catalog'
import type { LiturgyMusicOption } from '../../types/liturgy'

// mocks do fetch remoto para os loaders não quebrarem
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(async () => null),
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async () => null),
}))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: vi.fn(() => 'json_db'),
}))

function music(partial: Partial<LiturgyMusicOption> & { id: number; name: string }): LiturgyMusicOption {
  return {
    displayLabel: partial.name,
    albumNames: '',
    ...partial,
  } as LiturgyMusicOption
}

describe('parseCatalogDurationMs', () => {
  it('número em segundos → ms', () => {
    expect(parseCatalogDurationMs(3.5)).toBe(3500)
    expect(parseCatalogDurationMs(120)).toBe(120000)
  })

  it('número inválido → null', () => {
    expect(parseCatalogDurationMs(0)).toBeNull()
    expect(parseCatalogDurationMs(-1)).toBeNull()
    expect(parseCatalogDurationMs(Number.NaN)).toBeNull()
  })

  it('string HH:MM:SS', () => {
    expect(parseCatalogDurationMs('01:01:01')).toBe(3661000)
  })

  it('string MM:SS', () => {
    expect(parseCatalogDurationMs('02:30')).toBe(150000)
  })

  it('string numérica (segundos)', () => {
    expect(parseCatalogDurationMs('90')).toBe(90000)
  })

  it('string inválida → null', () => {
    expect(parseCatalogDurationMs('')).toBeNull()
    expect(parseCatalogDurationMs('   ')).toBeNull()
    expect(parseCatalogDurationMs('abc')).toBeNull()
    expect(parseCatalogDurationMs('1:2:3:4')).toBeNull()
    expect(parseCatalogDurationMs('aa:bb')).toBeNull()
    expect(parseCatalogDurationMs('0:00')).toBeNull()
  })

  it('tipos não suportados → null', () => {
    expect(parseCatalogDurationMs(null)).toBeNull()
    expect(parseCatalogDurationMs({ x: 1 })).toBeNull()
  })
})

describe('sortMusicOptions', () => {
  it('ordena por hymnalTrack e depois por nome', () => {
    const options = [
      music({ id: 3, name: 'Charlie', hymnalTrack: 2 }),
      music({ id: 1, name: 'Zulu', hymnalTrack: 1 }),
      music({ id: 2, name: 'Alpha', hymnalTrack: 2 }),
      music({ id: 4, name: 'Bravo' }), // sem track vai pro fim
    ]
    const sorted = sortMusicOptions(options)
    expect(sorted.map((o) => o.id)).toEqual([1, 2, 3, 4])
  })

  it('não muta o array original', () => {
    const options = [music({ id: 2, name: 'B', hymnalTrack: 2 }), music({ id: 1, name: 'A', hymnalTrack: 1 })]
    const before = [...options]
    sortMusicOptions(options)
    expect(options.map((o) => o.id)).toEqual(before.map((o) => o.id))
  })
})

describe('filterLiturgyMusicOptions', () => {
  const options = [
    music({ id: 1, name: 'Santo Santo Santo', hymnalTrack: 1, albumNames: 'Album A' }),
    music({ id: 2, name: 'Grande é o Senhor', hymnalTrack: 2, albumNames: 'Album B' }),
    music({ id: 3, name: 'Amor de Deus', hymnalTrack: null, albumNames: 'Album A' }),
  ]

  it('query vazia sem seleção: []', () => {
    expect(filterLiturgyMusicOptions(options, '', null)).toEqual([])
  })

  it('query vazia com seleção: só a selecionada', () => {
    expect(filterLiturgyMusicOptions(options, '', 2)).toEqual([options[1]])
  })

  it('busca por nome (case-insensitive)', () => {
    const result = filterLiturgyMusicOptions(options, 'SANTO', null)
    expect(result.some((o) => o.id === 1)).toBe(true)
  })

  it('busca por número do hinário', () => {
    const result = filterLiturgyMusicOptions(options, '2', null)
    expect(result.some((o) => o.id === 2)).toBe(true)
  })

  it('busca por álbum', () => {
    const result = filterLiturgyMusicOptions(options, 'Album B', null)
    expect(result.some((o) => o.id === 2)).toBe(true)
  })
})

describe('loadLiturgyBibleBooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('catálogo local ok: converte linhas para opções', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce([
      { id_bible_book: '1', name: 'Gênesis', chapters: '50' },
      { id_bible_book: 'x', name: '', chapters: 5 },        // inválido
      { id_bible_book: '2', name: 'Êxodo', chapters: '0' }, // chapters 0
    ] as never)
    const { loadLiturgyBibleBooks } = await import('../liturgy-catalog')
    const books = await loadLiturgyBibleBooks()
    expect(books.length).toBe(1)
    expect(books[0]).toEqual({ id: 1, name: 'Gênesis', chapters: 50 })
  })

  it('catálogo null (falha): lista vazia', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockResolvedValueOnce(null as never)
    const { loadLiturgyBibleBooks } = await import('../liturgy-catalog')
    const books = await loadLiturgyBibleBooks()
    expect(books).toEqual([])
  })
})

describe('nome do hinário sem repetir (com e sem acento)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('"Hinario Adventista · Hinário Adventista" vira um só, e continua reconhecido como hinário', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockImplementation(async (name: string) =>
      String(name).endsWith('_musics')
        ? ([
            {
              id_music: '5',
              name: 'Jubilosos Te Adoramos',
              track: '5',
              albums_names: 'Hinario Adventista',
              albums: [{ name: 'Hinário Adventista' }],
            },
            {
              id_music: '170',
              name: 'Só um Passo',
              track: '170',
              albums_names: 'Hinario Adventista 1996 · Hinário Adventista 1996',
            },
          ] as never)
        : (null as never),
    )
    const { loadLiturgyMusicOptions } = await import('../liturgy-catalog')
    const options = await loadLiturgyMusicOptions()
    const jubilosos = options.find((o) => o.id === 5)!
    expect(jubilosos.albumNames).toBe('Hinario Adventista')
    expect(jubilosos.displayLabel).toBe('5 - Jubilosos Te Adoramos')
    const passo = options.find((o) => o.id === 170)!
    expect(passo.albumNames).toBe('Hinario Adventista 1996')
    expect(passo.displayLabel).toBe('170 - Só um Passo')
  })
})

describe('álbuns desativados na busca da liturgia', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('cada música sabe os seus álbuns (hinários pela chave do card, CDs pelo id)', async () => {
    const { readCatalogRecord } = await import('@shared/services/workspace-api')
    vi.mocked(readCatalogRecord).mockImplementation(async (name: string) =>
      String(name).endsWith('_musics')
        ? ([
            { id_music: '1', name: 'Do atual', track: '45', albums: [{ id_album: 900, name: 'Hinário Adventista' }, { id_album: 901, name: 'Hinario Adventista 1996' }] },
            { id_music: '2', name: 'Do CD', albums: [{ id_album: 77, name: 'CD Jovem 2004' }] },
            { id_music: '3', name: 'Só nome', track: '9', albums_names: 'Hinario Adventista 1996' },
          ] as never)
        : (null as never),
    )
    const { loadLiturgyMusicOptions } = await import('../liturgy-catalog')
    const options = await loadLiturgyMusicOptions()
    expect(options.find((o) => o.id === 1)!.albumKeys).toEqual(['hymnal', 'hymnal_1996'])
    expect(options.find((o) => o.id === 2)!.albumKeys).toEqual(['77'])
    expect(options.find((o) => o.id === 3)!.albumKeys).toEqual(['hymnal_1996'])
  })

  it('música só de álbum desativado: aparece desativada e depois das ativas', () => {
    const options = [
      music({ id: 1, name: 'Santo antigo', hymnalTrack: 45, albumNames: 'Hinário Adventista 1996', albumKeys: ['hymnal_1996'] }),
      music({ id: 2, name: 'Santo novo', hymnalTrack: 45, albumNames: 'Hinário Adventista', albumKeys: ['hymnal'] }),
      music({ id: 3, name: 'Santo dos dois', albumKeys: ['hymnal', 'hymnal_1996'] }),
      music({ id: 4, name: 'Santo meu', albumNames: 'Minhas', albumKeys: [] }),
    ]
    const found = filterLiturgyMusicOptions(options, 'santo', null, new Set(['hymnal_1996']))
    expect(found.map((o) => [o.id, o.disabled === true])).toEqual([[2, false], [3, false], [4, false], [1, true]])
    const byNumber = filterLiturgyMusicOptions(options, '45', null, new Set(['hymnal_1996']))
    expect(byNumber.map((o) => [o.id, o.disabled === true])).toEqual([[2, false], [1, true]])
  })

  it('sem nada desativado, nada vem desativado', () => {
    const options = [music({ id: 1, name: 'Santo', albumKeys: ['hymnal_1996'] })]
    expect(filterLiturgyMusicOptions(options, 'santo', null)[0]!.disabled).toBeFalsy()
  })
})
