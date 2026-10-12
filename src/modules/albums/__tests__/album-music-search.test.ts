import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de album-music-search.ts — índice global de músicas, merge de
 * hits duplicados, preferência de faixa do hinário (atual > 1996 > qualquer)
 * e filtro busca por nome/álbum/número.
 */

const readCatalogRecord = vi.fn()
const fetchRemoteCatalogJson = vi.fn()
const getCurrentApiPrefix = vi.fn(() => 'pt')
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: (...a: unknown[]) => readCatalogRecord(...a),
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: (...a: unknown[]) => fetchRemoteCatalogJson(...a),
}))
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => getCurrentApiPrefix(),
}))

import {
  loadAlbumMusicIndex,
  filterAlbumMusicIndex,
} from '../services/album-music-search'

beforeEach(() => {
  vi.clearAllMocks()
  readCatalogRecord.mockReset()
  fetchRemoteCatalogJson.mockReset()
})

describe('loadAlbumMusicIndex', () => {
  it('usa prefixo do idioma; filtra ids/nomes inválidos; dedupe por id com merge', async () => {
    readCatalogRecord.mockResolvedValue([
      {
        id_music: 1,
        name: 'Dup',
        albums: [
          { id_album: 1, name: 'Hinário Adventista', pivot: { track: 10 } },
          { id_album: 2, name: 'Outro CD' },
        ],
      },
      {
        id_music: 1,
        name: 'Dup',
        albums: [{ id_album: 2, name: 'Outro CD', track: 5 }],
        duration: 100,
        has_instrumental_music: 1,
      },
      { id_music: 0, name: 'id inválido' },
      { id_music: 2, name: '   ' },
    ])
    const index = await loadAlbumMusicIndex()
    expect(readCatalogRecord).toHaveBeenCalledWith('pt_musics')
    expect(index).toHaveLength(1)
    const hit = index[0]!
    expect(hit.hymnalTracks).toEqual([10]) // merge: só tracks de hinário
    expect(hit.hasInstrumental).toBe(true) // merge OR
    expect(hit.albumNames).toContain('Outro CD')
    expect(hit.track).toBe(10) // preferência hinário atual
    expect(hit.isHymnal).toBe(true)
  })

  it('sem prefixo?? default pt; catálogo vazio/não-array/falha -> []', async () => {
    readCatalogRecord.mockResolvedValue([])
    expect(await loadAlbumMusicIndex()).toEqual([])
    readCatalogRecord.mockResolvedValue('não array')
    expect(await loadAlbumMusicIndex()).toEqual([])
    readCatalogRecord.mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchRemoteCatalogJson.mockRejectedValue(new Error('off'))
    expect(await loadAlbumMusicIndex()).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('preferência de faixa do hinário', () => {
  it('1996 usado quando atual não tem track; type hymnal case-insensitive', async () => {
    readCatalogRecord.mockResolvedValue([
      {
        id_music: 1,
        name: 'X',
        albums: [
          { id_album: 1, name: 'Hinário Adventista 1996', pivot: { track: 199 } },
          { id_album: 2, name: 'Outro', track: 3 },
        ],
      },
      {
        id_music: 2,
        name: 'Y',
        albums: [{ id_album: 3, type: 'HYMNAL', track: 7 }],
      },
    ])
    const index = await loadAlbumMusicIndex()
    expect(index[0]?.track).toBe(199)
    expect(index[0]?.isHymnal).toBe(true)
    expect(index[1]?.track).toBe(7)
    expect(index[1]?.isHymnal).toBe(true)
  })

  it('fallback: albums_names com Hinário + row.track; sem nada -> null/não-hino', async () => {
    readCatalogRecord.mockResolvedValue([
      {
        id_music: 1,
        name: 'A',
        albums_names: 'Hinário Adventista',
        track: 42,
      },
      { id_music: 2, name: 'B', albums_names: 'CD Comum', track: 9 },
      { id_music: 3, name: 'C' },
    ])
    const index = await loadAlbumMusicIndex()
    expect(index[0]).toMatchObject({ track: 42, isHymnal: true })
    expect(index[1]).toMatchObject({ track: null, isHymnal: false })
    expect(index[2]?.albumNames).toBe('Música') // fallback do label
  })

  it('hymnalTracks do collect: só track > 0 e dedupe', async () => {
    readCatalogRecord.mockResolvedValue([
      {
        id_music: 1,
        name: 'D',
        albums: [
          { id_album: 1, name: 'Hinário Adventista', track: 0 },
          { id_album: 1, name: 'Hinário Adventista', track: 12 },
          { id_album: 1, name: 'Hinário Adventista', track: 12 },
        ],
      },
    ])
    const index = await loadAlbumMusicIndex()
    expect(index[0]?.hymnalTracks).toEqual([12])
  })
})

describe('filterAlbumMusicIndex', () => {
  const makeIndex = (over: Partial<Record<string, unknown>> = {}) => [
    {
      musicId: 1,
      name: 'Aleluia',
      track: 10,
      albumNames: 'Hinário Adventista',
      isHymnal: true,
      hymnalTracks: [10],
      hasInstrumental: false,
      displayTitle: 'Aleluia',
      ...over,
    },
    {
      musicId: 2,
      name: 'Santo',
      track: 20,
      albumNames: 'Hinário Adventista 1996',
      isHymnal: true,
      hymnalTracks: [20],
      hasInstrumental: false,
      displayTitle: 'Santo',
    },
    {
      musicId: 3,
      name: 'Grande É o Senhor',
      track: null,
      albumNames: 'CD Louvor',
      isHymnal: false,
      hymnalTracks: [],
      hasInstrumental: false,
      displayTitle: 'Grande É o Senhor',
    },
  ] as never[]

  it('query vazia -> []', () => {
    expect(filterAlbumMusicIndex(makeIndex(), '')).toEqual([])
    expect(filterAlbumMusicIndex(makeIndex(), '  ')).toEqual([])
  })

  it('texto: casa nome e álbum, case-insensitive', () => {
    expect(filterAlbumMusicIndex(makeIndex(), 'aleluia')).toHaveLength(1)
    expect(filterAlbumMusicIndex(makeIndex(), 'hinário adventista')).toHaveLength(2)
    expect(filterAlbumMusicIndex(makeIndex(), 'zzz')).toHaveLength(0)
  })

  it('número: casa track, hymnalTracks, título e álbum; reescreve track', () => {
    const hits = filterAlbumMusicIndex(makeIndex(), '10')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ track: 10, isHymnal: true, musicId: 1 })
    // número presente em albumNames mas não como track: match e reescrita
    const hits2 = filterAlbumMusicIndex(makeIndex(), '1996')
    expect(hits2[0]?.musicId).toBe(2)
  })

  it('orden: hinário atual (2) > 1996 (1) > sem número (0)', () => {
    const hits = filterAlbumMusicIndex(makeIndex(), '20')
    // '20': Santo track 20 == 20 (score 1: álbum 1996); Aleluia track 10,
    // título/álbum sem '20' -> não casa. Grande: track null, 'cd louvor' sem 20.
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ musicId: 2, track: 20 })
  })

  it('score: atual antes de 1996 quando ambos casam o número', () => {
    const hits = filterAlbumMusicIndex(
      [
        {
          musicId: 1,
          name: 'Hino Dois',
          track: 2,
          albumNames: 'Hinário Adventista 1996',
          isHymnal: true,
          hymnalTracks: [2],
          hasInstrumental: false,
          displayTitle: 'Hino Dois',
        },
        {
          musicId: 2,
          name: 'Hino Dois Atual',
          track: 2,
          albumNames: 'Hinário Adventista',
          isHymnal: true,
          hymnalTracks: [2],
          hasInstrumental: false,
          displayTitle: 'Hino Dois Atual',
        },
        {
          musicId: 3,
          name: 'Sem Número Dois',
          track: null,
          albumNames: 'Hinário Adventista',
          isHymnal: true,
          hymnalTracks: [],
          hasInstrumental: false,
          displayTitle: 'Sem Número Dois',
        },
      ] as never[],
      '2',
    )
    expect(hits[0]?.musicId).toBe(2) // score 2: atual
    expect(hits[1]?.musicId).toBe(1) // score 1: 1996
    // 3o casa por título 'dois' mas sem número: score 0 fica por último
  })

  it('limite de 50 resultados', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      musicId: i + 1,
      name: `Música ${i}`,
      track: null,
      albumNames: 'álbum qualquer',
      isHymnal: false,
      hymnalTracks: [],
      hasInstrumental: false,
      displayTitle: `Música ${i}`,
    })) as never[]
    expect(filterAlbumMusicIndex(many, 'música')).toHaveLength(50)
  })


  it('score 0: número casa em álbum comum (não hinário)', () => {
    const hits = filterAlbumMusicIndex(
      [
        {
          musicId: 5,
          name: 'Faixa 30',
          track: 30,
          albumNames: 'CD Comum 30',
          isHymnal: false,
          hymnalTracks: [],
          hasInstrumental: false,
          displayTitle: 'Faixa 30',
        },
      {
        musicId: 6,
        name: 'Outra 30',
        track: 30,
        albumNames: 'CD Comum',
        isHymnal: false,
        hymnalTracks: [],
        hasInstrumental: false,
        displayTitle: 'Outra 30',
      },
      ] as never[],
      '30',
    )
    expect(hits).toHaveLength(2)
    expect(hits[0]).toMatchObject({ musicId: 5, track: 30, isHymnal: true }) // reescrito
  })

  it('busca numérica sem track match: entry sem o número mantém track', () => {
    const idx = [
      {
        musicId: 9,
        name: 'Título 10',
        track: 3,
        albumNames: 'CD X',
        isHymnal: false,
        hymnalTracks: [],
        hasInstrumental: false,
        displayTitle: 'Título 10',
      },
    ] as never[]
    const hits = filterAlbumMusicIndex(idx, '10')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ track: 3, isHymnal: false })
  })
  describe('gaps — instrumental/url, hymnal_1996, nome vazio, fetch fallback', () => {
    it('hasInstrumental via url_instrumental_music string', async () => {
      readCatalogRecord.mockResolvedValue([
        { id_music: 7, name: 'Com URL', url_instrumental_music: 'https://x/y.mp3' },
        { id_music: 8, name: 'Sem URL', url_instrumental_music: '   ' },
      ])
      const idx = await loadAlbumMusicIndex()
      const com = idx.find((h) => h.musicId === 7)
      const sem = idx.find((h) => h.musicId === 8)
      expect(com?.hasInstrumental).toBe(true)
      expect(sem?.hasInstrumental).toBe(false)
    })

    it('isHymnal via type hymnal_1996', async () => {
      readCatalogRecord.mockResolvedValue([
        { id_music: 9, name: 'X', albums: [{ id_album: 5, name: 'Coletânea', type: 'hymnal_1996', pivot: { track: 3 } }] },
      ])
      const idx = await loadAlbumMusicIndex()
      expect(idx[0]?.isHymnal).toBe(true)
    })

    it('isHymnal via nome contendo Hinário Adventista', async () => {
      readCatalogRecord.mockResolvedValue([
        { id_music: 10, name: 'Y', albums: [{ id_album: 6, name: 'Hinário Adventista 2', pivot: { track: 4 } }] },
      ])
      const idx = await loadAlbumMusicIndex()
      expect(idx[0]?.isHymnal).toBe(true)
    })

    it('row com nome vazio é descartada', async () => {
      readCatalogRecord.mockResolvedValue([
        { id_music: 11, name: '   ' },
        { id_music: 12, name: 'Válida' },
      ])
      const idx = await loadAlbumMusicIndex()
      expect(idx.find((h) => h.musicId === 11)).toBeUndefined()
      expect(idx.find((h) => h.musicId === 12)).toBeTruthy()
    })

    it('local null → fetch remoto; erro no fetch → []', async () => {
      readCatalogRecord.mockResolvedValue(null)
      fetchRemoteCatalogJson.mockResolvedValue([
        { id_music: 20, name: 'Remota' },
      ])
      let idx = await loadAlbumMusicIndex()
      expect(idx.length).toBe(1)
      fetchRemoteCatalogJson.mockRejectedValue(new Error('off'))
      idx = await loadAlbumMusicIndex()
      expect(idx).toEqual([])
    })

    it('filtro vazio → []', () => {
      expect(filterAlbumMusicIndex([{ musicId: 1, name: 'A', albumNames: 'B', hymnalTracks: [], isHymnal: false, hasInstrumental: false } as never], '  ')).toEqual([])
    })

    it('merge de duplicados: albumNames combinados sem repetir', async () => {
      readCatalogRecord.mockResolvedValue([
        { id_music: 30, name: 'M', albums: [{ id_album: 1, name: 'CD A', pivot: { track: 1 } }] },
        { id_music: 30, name: 'M', albums: [{ id_album: 1, name: 'CD A', pivot: { track: 1 } }] },
      ])
      const idx = await loadAlbumMusicIndex()
      expect(idx.length).toBe(1)
      expect(idx[0].albumNames).toBe('CD A')
    })
  })

})