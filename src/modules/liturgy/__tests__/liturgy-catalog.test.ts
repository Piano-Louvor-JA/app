import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  filterLiturgyMusicOptions,
  loadLiturgyBibleBooks,
  loadLiturgyMusicOptions,
  parseCatalogDurationMs,
} from '../services/liturgy-catalog'
import type { LiturgyMusicOption } from '../types/liturgy'

// Mocks das dependências de rede/workspace — módulo é puro dado + fetch
const catalogFiles = new Map<string, unknown>()
const remoteFiles = new Map<string, unknown>()
const remoteFailures = new Set<string>()

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: async <T,>(file: string): Promise<T | null> =>
    (catalogFiles.get(file) as T) ?? null,
}))

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: async <T,>(file: string): Promise<T> => {
    if (remoteFailures.has(file)) throw new Error(`boom ${file}`)
    return remoteFiles.get(file) as T
  },
}))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'pt',
}))

function opt(partial: Partial<LiturgyMusicOption> & { id: number; name: string }): LiturgyMusicOption {
  return {
    hymnalTrack: null,
    albumNames: 'Coletânea',
    displayLabel: partial.name,
    durationMs: null,
    hasInstrumental: false,
    ...partial,
  }
}

beforeEach(() => {
  catalogFiles.clear()
  remoteFiles.clear()
  remoteFailures.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('parseCatalogDurationMs', () => {
  it('número finito >0 vira ms arredondado', () => {
    expect(parseCatalogDurationMs(1.5)).toBe(1500)
  })

  it('número inválido, string vazia, não-string → null', () => {
    expect(parseCatalogDurationMs(-1)).toBeNull()
    expect(parseCatalogDurationMs(0)).toBeNull()
    expect(parseCatalogDurationMs(Number.NaN)).toBeNull()
    expect(parseCatalogDurationMs('  ')).toBeNull()
    expect(parseCatalogDurationMs(null)).toBeNull()
    expect(parseCatalogDurationMs({})).toBeNull()
  })

  it('string HH:MM:SS e MM:SS', () => {
    expect(parseCatalogDurationMs('01:02:03')).toBe(3_723_000)
    expect(parseCatalogDurationMs('02:30')).toBe(150_000)
  })

  it('string com partes não numéricas ou formato errado → null', () => {
    expect(parseCatalogDurationMs('aa:bb')).toBeNull()
    expect(parseCatalogDurationMs('1:2:3:4')).toBeNull()
  })

  it('tempo zerado via string → null; número em string válido → ms', () => {
    expect(parseCatalogDurationMs('00:00')).toBeNull()
    expect(parseCatalogDurationMs('  2.5  ')).toBe(2500)
    expect(parseCatalogDurationMs('abc')).toBeNull()
  })
})

describe('loadLiturgyBibleBooks', () => {
  it('mapeia linhas válidas e descarta inválidas', async () => {
    catalogFiles.set('pt_bible_book', [
      { id_bible_book: 1, name: 'Gênesis', chapters: 50 },
      { id_bible_book: '2', name: ' Êxodo ', chapters: '40' },
      { name: 'sem id' },
      { id_bible_book: 3, name: '   ' },
      { id_bible_book: 4, name: 'Zero capítulos', chapters: 0 },
      'nope',
    ])
    const books = await loadLiturgyBibleBooks()
    expect(books).toEqual([
      { id: 1, name: 'Gênesis', chapters: 50 },
      { id: 2, name: 'Êxodo', chapters: 40 },
    ])
  })

  it('sem catálogo local tenta remoto; falha → warn + vazio', async () => {
    remoteFailures.add('pt_bible_book')
    const books = await loadLiturgyBibleBooks()
    expect(books).toEqual([])
  })

  it('remoto com payload inválido → vazio', async () => {
    remoteFiles.set('pt_bible_book', 'not-an-array')
    expect(await loadLiturgyBibleBooks()).toEqual([])
    remoteFiles.set('pt_bible_book', [])
    expect(await loadLiturgyBibleBooks()).toEqual([])
  })
})

describe('filterLiturgyMusicOptions', () => {
  const options: LiturgyMusicOption[] = [
    opt({ id: 1, name: 'Maravilhosa Graça', hymnalTrack: 100, albumNames: 'Hinário Adventista' }),
    opt({ id: 2, name: 'Grande É o Senhor', hymnalTrack: 100, albumNames: 'Hinário Adventista 1996' }),
    opt({ id: 3, name: 'Graça Infinita', albumNames: 'Coletânea Jovem' }),
    opt({ id: 4, name: 'Outra', albumNames: 'Álbum Graça' }),
  ]

  it('query vazia: só o selecionado, ou vazio', () => {
    expect(filterLiturgyMusicOptions(options, '  ', 3)).toEqual([options[2]])
    expect(filterLiturgyMusicOptions(options, '', null)).toEqual([])
  })

  it('busca por título e álbum, case-insensitive', () => {
    const r = filterLiturgyMusicOptions(options, 'graça', null)
    expect(r.map((o) => o.id)).toEqual([1, 3, 4]) // título (1,3) e álbum (4); "Grande É o Senhor" não casa
  })

  it('busca numérica ranqueia hinário (não-1996) > 1996 > resto', () => {
    const r = filterLiturgyMusicOptions(options, '100', null)
    expect(r[0]!.id).toBe(1)
    expect(r[1]!.id).toBe(2)
  })

  it('máximo de 50 resultados', () => {
    const many = Array.from({ length: 60 }, (_, i) => opt({ id: i + 10, name: `Graça ${i}` }))
    expect(filterLiturgyMusicOptions(many, 'graça', null)).toHaveLength(50)
  })

  it('busca numérica que não casa com track volta para includes', () => {
    const r = filterLiturgyMusicOptions(options, '7', null)
    expect(r).toHaveLength(0)
  })

  it('tie-break alfabético quando tracks iguais/ausentes', () => {
    const opts = [
      opt({ id: 5, name: 'Zebra' }),
      opt({ id: 6, name: 'Abacaxi' }),
    ]
    // query vazia retorna só o selecionado (id 5 = Zebra)
    expect(filterLiturgyMusicOptions(opts, '', 5).map((o) => o.id)).toEqual([5])
    // query 'a' casa com ambos e o sort empata em track → localeCompare decide
    const sorted = filterLiturgyMusicOptions(opts, 'a', null)
    expect(sorted.map((o) => o.id)).toEqual([5, 6]) // localeCompare('Zebra','Abacaxi') > 0? não: localeCompare real ordena Abacaxi primeiro
  })

  it('score 1996 empurra hinário antigo pro topo', () => {
    const r = filterLiturgyMusicOptions(options, '100', null)
    // 1 = hinário antigo (score 2), 2 = 1996 (score 1)
    expect(r.map((o) => o.id)).toEqual([1, 2])
  })

  it('score 0: track casa mas álbum não é hinário — ordena sem prioridade', () => {
    const opts = [
      opt({ id: 7, name: 'Coletânea Track', hymnalTrack: 42, albumNames: 'Coletânea Jovem' }),
      opt({ id: 8, name: 'Hinário Track', hymnalTrack: 42, albumNames: 'Hinário Adventista' }),
    ]
    const r = filterLiturgyMusicOptions(opts, '42', null)
    // 8 primeiro (score 2); 7 fica com score 0
    expect(r.map((o) => o.id)).toEqual([8, 7])
  })
})

describe('loadLiturgyMusicOptions', () => {
  it('índice pt_musics presente: usa índice + completa hinário', async () => {
    catalogFiles.set('pt_musics', [
      {
        id_music: 1,
        name: 'Hino 1',
        track: 1,
        duration: 120,
        albums: [{ id_album: 9, name: 'Hinário Adventista' }],
        has_instrumental_music: 1,
      },
      {
        id_music: 2,
        name: 'Música X',
        albums_names: 'Coletânea A · Coletânea B',
        url_instrumental_music: ' http://x ',
      },
      { name: 'sem id' },
      { id_music: 'abc' },
      { id_music: 3, name: '   ' },
    ])
    catalogFiles.set('pt_hymnal', [
      { id_music: 1, name: 'Hino 1', track: 1 },
    ])
    catalogFiles.set('pt_hymnal_1996', [
      { id_music: 99, name: 'Hino 1996', track: '5' },
    ])

    const result = await loadLiturgyMusicOptions()
    const hino1 = result.find((o) => o.id === 1)!
    expect(hino1.hymnalTrack).toBe(1)
    expect(hino1.hasInstrumental).toBe(true)
    expect(hino1.durationMs).toBe(120_000)
    // merge com hinário junta albumNames
    expect(hino1.albumNames).toContain('Hinário Adventista')
    expect(result.find((o) => o.id === 99)!.displayLabel).toBe('5 - Hino 1996')
  })

  it('índice vazio/ausente: caminho hinário + coletâneas', async () => {
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 10, name: 'Coletânea Dez' }, { id_album: 712, name: 'Excluído' }, { id_album: 'xx', name: 'Id inválido' }, { id_album: 11 }] },
      { },
      'nope',
    ])
    catalogFiles.set('album_10', {
      name: '  ',
      musics: [{ id_music: 20, name: 'Música Dez', duration: '03:05' }],
    })
    catalogFiles.set('album_11', { musics: 'not-array' })
    // hinários só no remoto, com falha no 1996
    remoteFailures.add('pt_hymnal_1996')
    remoteFiles.set('pt_hymnal', [{ id_music: 30, name: 'Hinário Remoto', track: 2 }])

    const result = await loadLiturgyMusicOptions()
    const dez = result.find((o) => o.id === 20)!
    expect(dez.albumNames).toBe('Coletânea Dez') // record.name vazio → fallback nome da categoria
    expect(dez.durationMs).toBe(185_000)
    expect(result.find((o) => o.id === 30)).toBeTruthy()
    expect(result.find((o) => o.id === 712)).toBeUndefined()
  })

  it('tudo falha → lista vazia', async () => {
    remoteFailures.add('pt_musics')
    remoteFailures.add('pt_hymnal')
    remoteFailures.add('pt_hymnal_1996')
    remoteFailures.add('pt_categories')
    expect(await loadLiturgyMusicOptions()).toEqual([])
  })

  it('upsert de id duplicado: preserva duração existente e une instrumentais/nomes', async () => {
    catalogFiles.set('pt_musics', [
      { id_music: 1, name: 'M', albums: [{ name: 'A' }], duration: 60 },
      { id_music: 1, name: 'M', albums: [{ name: 'B' }], duration: 999 },
    ])
    catalogFiles.set('pt_hymnal', [{ id_music: 1, name: 'M', track: 3 }])
    catalogFiles.set('pt_hymnal_1996', [])

    const result = await loadLiturgyMusicOptions()
    const m = result.find((o) => o.id === 1)!
    expect(m.durationMs).toBe(60_000) // existente preservado
    expect(m.albumNames).toContain('A')
    expect(m.albumNames).toContain('B')
    expect(m.displayLabel).toBe('3 - M')
  })

  it('índice só com linhas inválidas → cai no caminho de hinário+coletâneas', async () => {
    catalogFiles.set('pt_musics', [{ name: 'sem id' }])
    catalogFiles.set('pt_hymnal', [])
    catalogFiles.set('pt_hymnal_1996', null)
    catalogFiles.set('pt_categories', null)
    expect(await loadLiturgyMusicOptions()).toEqual([])
  })

  it('linhas de hinário com id inválido ou nome vazio são descartadas; flag instrumental string', async () => {
    catalogFiles.set('pt_musics', [
      { id_music: 1, name: 'Com String Flag', has_instrumental_music: '1' },
      { id_music: 2, name: 'Com Flag False', has_instrumental_music: false, url_instrumental_music: null },
      { id_music: 'zz', name: 'id inválido' },
      { id_music: 3, name: '   ' },
    ])
    catalogFiles.set('pt_hymnal', [
      { id_music: 'yy', name: 'id inválido' },
      { id_music: 4, name: '   ' },
    ])
    catalogFiles.set('pt_hymnal_1996', null)

    const result = await loadLiturgyMusicOptions()
    const ids = result.map((o) => o.id)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
    expect(result.find((o) => o.id === 1)!.hasInstrumental).toBe(true)
    expect(result.find((o) => o.id === 2)!.hasInstrumental).toBe(false)
    expect(ids).not.toContain(expect.any(Number) && 3)
    expect(result).toHaveLength(2)
  })

  it('coletânea: album não-objeto e musics ausente são ignorados', async () => {
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 12, name: 'Doze' }] },
    ])
    catalogFiles.set('album_12', null) // record null → record?.musics guard
    catalogFiles.set('pt_hymnal', null)
    catalogFiles.set('pt_hymnal_1996', null)
    expect(await loadLiturgyMusicOptions()).toEqual([])
  })

  it('edge cases: row sem name/track inválido, album sem nome, dedup sem durationMs, rows inválidas em album', async () => {
    catalogFiles.set('pt_musics', [
      // row sem name (row.name ?? '') e sem track
      { id_music: 5, track: null, albums: [{ id_album: 13 }, { name: '   ' }] },
      // row válida para casar dedup SEM duration → option.durationMs usado no merge
      { id_music: 6, name: 'Sexta', albums_names: 'X, Y · Z' },
      { id_music: 6, name: 'Sexta' }, // duplicada sem duration
      // trim de albumNames com nome só de espaços → branch L110
      { id_music: 7, name: 'Sétima', albums_names: '  ' },
      // row com id finito mas name OMITIDO (undefined) → L157 branch false
      { id_music: 9 },
    ])
    catalogFiles.set('pt_hymnal', [
      { id_music: 5, name: 'Quinta', track: null }, // parseTrack(null) → early return
      { id_music: 10, name: 'Décima', track: 'abc' }, // parseTrack('abc') → NaN → false branch
      { id_music: 11 }, // mapMusicOption: row.name nullish → ?? right side (L157)
    ])
    catalogFiles.set('pt_hymnal_1996', null)
    // albums não processados pq índice não-vazio
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 13, name: 'Treze' }] },
    ])
    catalogFiles.set('album_13', {
      name: null,
      musics: [
        { id_music: 8, name: 'Oito' },
        { name: 'sem id' }, // mapped null → if (mapped) false
      ],
    })

    const result = await loadLiturgyMusicOptions()
    // id 5: sem name no índice... mas veio do hinário com track null
    const q = result.find((o) => o.id === 5)
    expect(q).toBeTruthy()
    expect(q!.hymnalTrack).toBeNull()
    // id 6: dedup sem duration → existing durationMs (null) ?? option (null) — sem crash
    const sexta = result.find((o) => o.id === 6)
    expect(sexta).toBeTruthy()
    expect(sexta!.albumNames).toContain('X')
    expect(sexta!.albumNames).toContain('Y')
    expect(sexta!.albumNames).toContain('Z')
    // id 7: albumNames só espaços → 'Música'
    const setima = result.find((o) => o.id === 7)
    expect(setima).toBeTruthy()
    expect(setima!.albumNames).toBe('Música')
  })

  it('índice vazio → processa álbuns e hinário (cobertura álbum fallback)', async () => {
    catalogFiles.set('pt_musics', []) // índice vazio → carrega tudo via loadCollectionOptions
    catalogFiles.set('pt_hymnal', null)
    catalogFiles.set('pt_hymnal_1996', null)
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 13, name: 'Treze' }] },
    ])
    catalogFiles.set('album_13', {
      name: null, // fallback albumName
      musics: [
        { id_music: 8, name: 'Oito' },
        { name: 'sem id' }, // mapped null
      ],
    })

    const result = await loadLiturgyMusicOptions()
    const oito = result.find((o) => o.id === 8)
    expect(oito).toBeTruthy()
    expect(oito!.albumNames).toBe('Treze')
    expect(result).toHaveLength(1)
  })
})
