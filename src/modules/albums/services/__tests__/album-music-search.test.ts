// @vitest-environment jsdom
// Cobertura album-music-search: mapeamento do índice, merge por id, flags
// instrumentais, preferência de track do hinário e filtro de busca (gaps_map3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(),
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(),
}))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: vi.fn(() => 'pt'),
}))

vi.mock('../album-tracks', () => ({
  formatCatalogDuration: (v: unknown) =>
    v == null || v === '' ? '--:--' : `${Math.floor(Number(v) / 60)}:${String(Number(v) % 60).padStart(2, '0')}`,
}))

import {
  filterAlbumMusicIndex,
  loadAlbumMusicIndex,
  type AlbumSearchHit,
} from '../album-music-search'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'
import { readCatalogRecord } from '@shared/services/workspace-api'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

const mockRead = vi.mocked(readCatalogRecord)
const mockFetch = vi.mocked(fetchRemoteCatalogJson)
const mockPrefix = vi.mocked(getCurrentApiPrefix)

type Row = Record<string, unknown>

const baseHit = (over: Partial<Row> = {}) => ({
  id_music: 1,
  name: 'Hino Teste',
  duration: 125,
  has_instrumental_music: 0,
  url_instrumental_music: null,
  ...over,
})

describe('loadAlbumMusicIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('usa registro local quando disponível e prefixa o idioma', async () => {
    mockRead.mockResolvedValueOnce([baseHit()])
    const index = await loadAlbumMusicIndex()
    expect(mockPrefix).toHaveBeenCalled()
    expect(mockRead).toHaveBeenCalledWith('pt_musics')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(index).toHaveLength(1)
    expect(index[0]).toMatchObject({
      musicId: 1,
      name: 'Hino Teste',
      albumNames: 'Música',
      isHymnal: false,
      hasInstrumental: false,
      durationLabel: '2:05',
      displayTitle: 'Hino Teste',
      hymnalTracks: [],
      track: null,
    })
  })

  it('cai no fetch remoto quando local é null', async () => {
    mockRead.mockResolvedValueOnce(null)
    mockFetch.mockResolvedValueOnce([baseHit()])
    const index = await loadAlbumMusicIndex()
    expect(mockFetch).toHaveBeenCalledWith('pt_musics')
    expect(index).toHaveLength(1)
  })

  it('retorna [] quando local falha e remoto também falha', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRead.mockResolvedValueOnce(null)
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    const index = await loadAlbumMusicIndex()
    expect(index).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('retorna [] quando resposta não é array não-vazio', async () => {
    mockRead.mockResolvedValueOnce([])
    expect(await loadAlbumMusicIndex()).toEqual([])
    mockRead.mockResolvedValueOnce(null)
    mockFetch.mockResolvedValueOnce('nope' as never)
    expect(await loadAlbumMusicIndex()).toEqual([])
  })

  it('descarta linhas sem id válido ou sem nome', async () => {
    mockRead.mockResolvedValueOnce([
      { id_music: 0, name: 'x' },
      { id_music: 'abc', name: 'y' },
      { id_music: 5, name: '   ' },
      { id_music: null, name: 'z' },
      baseHit(),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index).toHaveLength(1)
    expect(index[0]!.musicId).toBe(1)
  })

  it('mescla linhas duplicadas por musicId (hymnalTracks unidos, albumNames concatenados)', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({
        id_music: 7,
        name: 'Sacro hino',
        albums: [{ id_album: 1, name: 'Hinário Adventista', type: 'hymnal', track: 10 }],
      }),
      baseHit({
        id_music: 7,
        name: 'Sacro hino',
        has_instrumental_music: 1,
        albums: [{ id_album: 2, name: 'Hinário Adventista 1996', type: 'hymnal_1996', track: 11 }],
      }),
    ])
    const [hit] = await loadAlbumMusicIndex()
    expect(hit!.musicId).toBe(7)
    expect(hit!.hymnalTracks).toEqual([10, 11])
    expect(hit!.isHymnal).toBe(true)
    expect(hit!.hasInstrumental).toBe(true)
    // merge: primeiro track (10) e nomes de álbum concatenados
    expect(hit!.track).toBe(10)
    expect(hit!.albumNames).toContain('Hinário Adventista')
    expect(hit!.albumNames).toContain('1996')
  })

  it('track preferido: hinário atual antes do 1996; sem hinário usa row.track quando albums_names menciona Hinário', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({
        id_music: 9,
        name: 'Pref',
        albums_names: 'Hinário Adventista',
        track: 42,
        albums: [
          { id_album: 2, name: 'Hinário Adventista 1996', type: 'hymnal', track: 99 },
        ],
      }),
    ])
    const [hit] = await loadAlbumMusicIndex()
    // preferredHymnalTrack 1ª passada: hinário atual (nome com 'Hinário Adventista' e sem '1996')
    expect(hit!.track).toBe(99)

    mockRead.mockResolvedValueOnce([
      baseHit({
        id_music: 10,
        name: 'Fallback',
        albums_names: 'Hinário Adventista',
        track: 42,
        albums: [],
      }),
    ])
    const [fallback] = await loadAlbumMusicIndex()
    expect(fallback!.track).toBe(42)
    expect(fallback!.isHymnal).toBe(true)
  })

  it('flag instrumental: true/1/"1" e url preenchida; albums_names vira fallback de álbum', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({ id_music: 20, has_instrumental_music: '1', albums: [{ name: ' CD A ' }, { name: 'CD B' }] }),
      baseHit({ id_music: 21, has_instrumental_music: null, url_instrumental_music: ' /x.mp3 ' }),
      baseHit({ id_music: 22, albums_names: '  ' }),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index.find((h) => h.musicId === 20)!.hasInstrumental).toBe(true)
    expect(index.find((h) => h.musicId === 20)!.albumNames).toBe('CD A, CD B')
    expect(index.find((h) => h.musicId === 21)!.hasInstrumental).toBe(true)
    expect(index.find((h) => h.musicId === 22)!.albumNames).toBe('Música')
  })

  it('pivot.track tem prioridade sobre album.track no número do hinário', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({
        id_music: 30,
        albums: [{ id_album: 1, name: 'Hinário Adventista', type: 'hymnal', track: 5, pivot: { track: 77 } }],
      }),
    ])
    const [hit] = await loadAlbumMusicIndex()
    expect(hit!.track).toBe(77)
    expect(hit!.hymnalTracks).toEqual([77])
  })
})

function hit(over: Partial<{
  name: string
  albumNames: string
  track: number | null
  hymnalTracks: number[]
}> = {}) {
  return {
    musicId: 1,
    name: 'Santo',
    track: null,
    durationLabel: '--:--',
    hasInstrumental: false,
    albumNames: 'CD Geral',
    displayTitle: 'Santo',
    isHymnal: false,
    hymnalTracks: [],
    ...over,
  }
}

describe('filterAlbumMusicIndex', () => {
  const index = [
    hit({ musicId: 1, name: 'Santo', track: 1, hymnalTracks: [1], albumNames: 'Hinário Adventista', isHymnal: true }),
    hit({ musicId: 2, name: 'Santo 1996', track: 1, hymnalTracks: [1], albumNames: 'Hinário Adventista 1996', isHymnal: true }),
    hit({ musicId: 3, name: 'Outra', track: 3, hymnalTracks: [3], albumNames: 'CD Geral' }),
    hit({ musicId: 4, name: 'Sem número', track: null, albumNames: 'Coletânea X' }),
  ]

  it('query vazia ou só espaços retorna []', () => {
    expect(filterAlbumMusicIndex(index, '')).toEqual([])
    expect(filterAlbumMusicIndex(index, '   ')).toEqual([])
  })

  it('busca textual por título e por álbum, limite de 50', () => {
    expect(filterAlbumMusicIndex(index, 'santo')).toHaveLength(2)
    expect(filterAlbumMusicIndex(index, 'coletânea')).toHaveLength(1)
    const many = Array.from({ length: 60 }, (_, i) =>
      hit({ musicId: i + 100, name: `Lote ${i}`, albumNames: 'Batch' }),
    )
    expect(filterAlbumMusicIndex(many, 'lote')).toHaveLength(50)
  })

  it('busca por número prioriza hinário atual sobre 1996 e reescreve o track exibido', () => {
    const results = filterAlbumMusicIndex(index, '1')
    expect(results[0]!.musicId).toBe(1)
    expect(results[0]!.track).toBe(1)
    expect(results[0]!.isHymnal).toBe(true)
    expect(results.map((r) => r.musicId)).not.toContain(3)
  })

  it('número que casa só por texto (ex.: "1996" contém "99") entra mas não é promovido a hinário', () => {
    const results = filterAlbumMusicIndex(index, '99')
    // só o álbum "Hinário Adventista 1996" contém "99" no nome
    expect(results.map((r) => r.musicId)).toEqual([2])
    // track original (1) preservado: 99 não está em hymnalTracks nem em track
    expect(results[0]!.track).toBe(1)
  })

  it('entrada sem track com número no título mantém dados originais', () => {
    const local = [hit({ musicId: 9, name: 'Tema 2', track: null, albumNames: 'Álbum' })]
    const results = filterAlbumMusicIndex(local, '2')
    expect(results).toHaveLength(1)
    expect(results[0]!.track).toBeNull()
    expect(results[0]!.isHymnal).toBe(false)
  })

describe('gaps onda1 — normalização de albums e ranking numérico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('type não-hinário com name null avalia o fallback de nome', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({ id_music: 5, name: 'Nome', albums: [{ name: null, type: 'cd', track: 2 }] }),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index[0]!.albumNames).toBe('Música')
  })

  it('row.name null descarta linha (fallback de String null)', async () => {
    mockRead.mockResolvedValueOnce([baseHit({ id_music: 6, name: null })])
    const index = await loadAlbumMusicIndex()
    expect(index).toHaveLength(0)
  })

  it('albums com name null/undefined e tracks inválidos: normaliza sem lançar', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({
        id_music: 7,
        name: 'Fé',
        albums: [
          { name: null, type: 'hymnal', track: 0, pivot: { track: -1 } },
          { name: undefined, type: 'hymnal_1996', track: null },
          { name: 'CD', type: 'cd', track: 3 },
        ],
      }),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index).toHaveLength(1)
    // hinário atual inválido → cai pro 1996 → track null → tracks do hinário vazios → fallback row.track ausente
    expect(index[0]!.track).toBe(null)
    expect(index[0]!.hymnalTracks).toEqual([])
  })

  it('sem hinário válido mas com hymnalTracks coletados: usa hymnalTracks[0]; merge une fallbacks', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({
        id_music: 9,
        name: 'Santo',
        albums: [
          { name: 'Hinário Adventista 1996', type: 'hymnal', track: 12 },
          { name: 'Hinário Adventista', type: 'hymnal', track: 0 },
        ],
      }),
    ])
    const index = await loadAlbumMusicIndex()
    // hinário atual track 0 → inválido; 1996 track 12 válido → preferido 2º loop
    expect(index[0]!.track).toBe(12)
    expect(index[0]!.isHymnal).toBe(true)
    expect(index[0]!.hymnalTracks).toEqual([12])
  })

  it('merge: a null + b track (142 arm1)', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({ id_music: 11, name: 'Graça', albums: [{ name: 'A', type: 'cd', track: null }] }),
      baseHit({ id_music: 11, name: 'Graça', albums: [{ name: 'B', type: 'hymnal', track: 5 }] }),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index[0]!.track).toBe(5)
  })

  it('merge: a/b null + hymnalTracks (arm2); tudo null (arm3); isHymnal via b (146 arm1); albumNames iguais (147 arm0)', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({ id_music: 12, name: 'Kyrie', albums: [{ name: 'Hinário Adventista', type: 'hymnal', track: 0 }] }),
      baseHit({ id_music: 12, name: 'Kyrie', albums: [{ name: 'Hinário Adventista', type: 'hymnal', track: 0 }] }),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index).toHaveLength(1)
  })

  it('merge: ambos não-hinário track null → track null; isHymnal false|false', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({ id_music: 13, name: 'Doxo', albums: [{ name: 'CD P', type: 'cd', track: null }] }),
      baseHit({ id_music: 13, name: 'Doxo', albums: [{ name: 'CD Q', type: 'cd', track: null }] }),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index[0]!.track).toBe(null)
    expect(index[0]!.isHymnal).toBe(false)
  })

  it('merge: track via hymnalTracks[0], isHymnal por track, albumNames distintos', async () => {
    mockRead.mockResolvedValueOnce([
      baseHit({
        id_music: 11,
        name: 'Graça',
        albums: [{ name: 'Hinário Adventista', type: 'hymnal', track: 5 }],
      }),
      baseHit({
        id_music: 11,
        name: 'Graça',
        track: null,
        albums: [{ name: 'CD Especial', type: 'cd', track: null }],
        has_instrumental_music: 1,
      }),
    ])
    const index = await loadAlbumMusicIndex()
    expect(index).toHaveLength(1)
    const hit = index[0]!
    expect(hit.track).toBe(5)
    expect(hit.isHymnal).toBe(true)
    expect(hit.albumNames).toContain('CD Especial')
    expect(hit.hasInstrumental).toBe(true)
  })

  it('busca numérica: sem match numérico score 0; match 1996 fica atrás do hinário atual', async () => {
    const index = [
      {
        musicId: 21, name: 'Velho', track: null, durationLabel: '--:--', hasInstrumental: false,
        albumNames: 'Hinário Adventista 1996', displayTitle: 'Velho', isHymnal: true, hymnalTracks: [40],
      },
      {
        musicId: 22, name: 'Novo', track: 40, durationLabel: '--:--', hasInstrumental: false,
        albumNames: 'Hinário Adventista', displayTitle: 'Novo', isHymnal: true, hymnalTracks: [40],
      },
      {
        musicId: 23, name: 'Outro 40', track: 9, durationLabel: '--:--', hasInstrumental: false,
        albumNames: 'CD X', displayTitle: 'Outro 40', isHymnal: false, hymnalTracks: [],
      },
      {
        musicId: 24, name: 'CD 40', track: null, durationLabel: '--:--', hasInstrumental: false,
        albumNames: 'Coletânea 40', displayTitle: 'CD 40', isHymnal: false, hymnalTracks: [40],
      } as AlbumSearchHit,
      {
        musicId: 25, name: 'Só Texto 40', track: 41, durationLabel: '--:--', hasInstrumental: false,
        albumNames: 'CD Z', displayTitle: 'Só Texto 40', isHymnal: false,
      } as unknown as AlbumSearchHit,
    ]
    const results = filterAlbumMusicIndex(index, '40')
    // 22: track direto (score 2); 21/24: hymnalTracks (atual vs 1996); 23: texto apenas (score 0)
    expect(results.map((r) => r.musicId)).toEqual([22, 21, 23, 24, 25])
    expect(results.find((r) => r.musicId === 24)!.track).toBe(40)
    expect(results.find((r) => r.musicId === 23)!.track).toBe(9)
  })

  it('busca numérica que casa só por texto: entra sem promoção e score 0 (hasNumber false)', async () => {
    const index = [
      {
        musicId: 31, name: 'Amafé 77', track: null, durationLabel: '--:--', hasInstrumental: false,
        albumNames: 'CD Y', displayTitle: 'Amafé 77', isHymnal: false, hymnalTracks: [],
      },
    ]
    const results = filterAlbumMusicIndex(index, '77')
    expect(results.map((r) => r.musicId)).toEqual([31])
    expect(results[0]!.track).toBe(null)
    expect(results[0]!.isHymnal).toBe(false)
  })
})
})
