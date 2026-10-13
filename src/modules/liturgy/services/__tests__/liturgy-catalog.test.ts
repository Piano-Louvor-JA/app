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
