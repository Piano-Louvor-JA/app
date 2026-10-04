import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de album-tracks.ts — faixas de coletâneas/hinários, formatos de
 * duração, letra do catálogo e filtro. Dependências mockadas via vi.mock
 * ANTES do import (workspace-api e remote-catalog não têm side effects que
 * quebrem a injeção do Stryker; custom-catalog é parcialmente mockado).
 */

const readCatalogRecord = vi.fn()
const fetchRemoteCatalogJson = vi.fn()
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: (...a: unknown[]) => readCatalogRecord(...a),
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: (...a: unknown[]) => fetchRemoteCatalogJson(...a),
}))

const listCustomMusics = vi.fn()
vi.mock('@modules/media/services/custom-catalog', () => ({
  listCustomMusics: (...a: unknown[]) => listCustomMusics(...a),
  fromCustomCollectionId: (id: number | string) =>
    Number(id) - 2_000_000,
  toCustomMusicId: (id: number) => id + 1_000_000,
}))

import {
  formatCatalogDuration,
  loadCollectionTracks,
  filterAlbumTracks,
  loadAlbumLyric,
} from '../services/album-tracks'
import type { AlbumCollection } from '../types/albums'

const album = (id: number, kind = 'album'): AlbumCollection =>
  ({
    id,
    kind,
    catalogKey: `cat_${id}.json`,
    name: `C${id}`,
  }) as unknown as AlbumCollection

const hymnal = (id: number): AlbumCollection =>
  ({ ...album(id), kind: 'hymnal' }) as unknown as AlbumCollection

const custom = (localId: number): AlbumCollection =>
  ({
    ...album(2_000_000 + Math.abs(localId)),
    isCustom: true,
  }) as unknown as AlbumCollection

beforeEach(() => {
  vi.clearAllMocks()
})

describe('formatCatalogDuration', () => {
  it('número: segundos -> m:ss', () => {
    expect(formatCatalogDuration(125)).toBe('2:05')
    expect(formatCatalogDuration(65)).toBe('1:05')
    expect(formatCatalogDuration(59.9)).toBe('0:59')
  })

  it('número inválido/negativo/zero -> traço', () => {
    expect(formatCatalogDuration(0)).toBe('—')
    expect(formatCatalogDuration(-5)).toBe('—')
    expect(formatCatalogDuration(Number.NaN)).toBe('—')
  })

  it('não-string (null/undefined/objeto) -> traço', () => {
    expect(formatCatalogDuration(null)).toBe('—')
    expect(formatCatalogDuration(undefined)).toBe('—')
    expect(formatCatalogDuration({})).toBe('—')
  })

  it('string vazia/whitespace -> traço', () => {
    expect(formatCatalogDuration('   ')).toBe('—')
    expect(formatCatalogDuration('')).toBe('—')
  })

  it('HH:MM:SS -> total em minutos', () => {
    expect(formatCatalogDuration('01:02:03')).toBe('62:03')
    expect(formatCatalogDuration('0:05:30')).toBe('5:30')
  })

  it('MM:SS mantém e padra o segundo dígito', () => {
    expect(formatCatalogDuration('3:5')).toBe('3:05')
    expect(formatCatalogDuration('12:34')).toBe('12:34')
  })

  it('string com partes inválidas -> devolve a string original', () => {
    expect(formatCatalogDuration('a:b')).toBe('a:b')
  })


  it('string com 4+ partes numéricas devolve original (L93)', () => {
    expect(formatCatalogDuration('1:2:3:4')).toBe('1:2:3:4')
  })

  it('string numérica pura: segundos -> m:ss; <= 0 -> traço', () => {
    expect(formatCatalogDuration('90')).toBe('1:30')
    expect(formatCatalogDuration('0')).toBe('—')
    expect(formatCatalogDuration('-3')).toBe('—')
  })
})

describe('loadCollectionTracks — custom', () => {
  it('mapeia com offset, oficial sem offset e fallback de nome', async () => {
    listCustomMusics.mockResolvedValue([
      { id: 10, name: 'Local', duration: 95, officialMusicId: null },
      { id: 11, name: null, duration: null, officialMusicId: 77 },
    ])
    const tracks = await loadCollectionTracks(custom(1))
    expect(listCustomMusics).toHaveBeenCalledWith(1)
    expect(tracks[0]).toMatchObject({
      musicId: 1_000_010, // toCustomMusicId(10)
      name: 'Local',
      track: 1,
      durationLabel: '1:35',
      hasInstrumental: false,
    })
    expect(tracks[1]?.musicId).toBe(77) // oficial sem offset
    expect(tracks[1]?.name).toContain('Hino oficial #77')
    expect(tracks[1]?.durationLabel).toBe('—')
  })
})

describe('loadCollectionTracks — hymnal', () => {
  it('lê catálogo local, filtra inválidos, ordena por track', async () => {
    readCatalogRecord.mockResolvedValue([
      { id_music: 3, name: 'C', track: 3, duration: '4:00' },
      { id_music: 1, name: 'A', track: 1 },
      { id_music: 0, name: 'inválido id' }, // id <= 0
      { id_music: 2, name: '   ' }, // sem nome
      { id_music: 'x', name: 'id NaN' },
      { id_music: 2, name: 'B', track: 2, has_instrumental_music: '1' },
    ])
    const tracks = await loadCollectionTracks(hymnal(1))
    expect(readCatalogRecord).toHaveBeenCalledWith('cat_1.json')
    expect(tracks.map((t) => t.name)).toEqual(['A', 'B', 'C'])
    expect(tracks[1]?.hasInstrumental).toBe(true)
    // fallback: faixa sem track vira índice+1 na posição final
    expect(tracks.every((t) => (t.track ?? 0) > 0)).toBe(true)
  })

  it('local vazio -> fetch remoto; remoto falha -> warn e []', async () => {
    readCatalogRecord.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockResolvedValue([
      { id_music: 9, name: 'Z', track: 0, duration: 245 },
    ])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tracks = await loadCollectionTracks(hymnal(2))
    expect(tracks[0]).toMatchObject({
      musicId: 9,
      track: 1, // fallback
      durationLabel: '4:05',
    })
    // remoto também falha -> []
    fetchRemoteCatalogJson.mockRejectedValue(new Error('off'))
    expect(await loadCollectionTracks(hymnal(2))).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('catálogo não-array -> []', async () => {
    readCatalogRecord.mockResolvedValue({ not: 'array' })
    expect(await loadCollectionTracks(hymnal(3))).toEqual([])
  })
})

describe('loadCollectionTracks — album', () => {
  it('lê album.musics e ordena', async () => {
    readCatalogRecord.mockResolvedValue({
      name: 'Album X',
      musics: [
        { id_music: 5, name: 'E', track: 2 },
        { id_music: 4, name: 'D', track: 1, url_instrumental_music: ' /i.mp3 ' },
      ],
    })
    const tracks = await loadCollectionTracks(album(7))
    expect(tracks.map((t) => t.musicId)).toEqual([4, 5])
    expect(tracks[0]?.hasInstrumental).toBe(true) // url presente (trim)
  })

  it('album sem musics (array ausente) -> []', async () => {
    readCatalogRecord.mockResolvedValue({ name: 'vazio' })
    expect(await loadCollectionTracks(album(8))).toEqual([])
    readCatalogRecord.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await loadCollectionTracks(album(8))).toEqual([])
    vi.restoreAllMocks()
  })
})

describe('filterAlbumTracks', () => {
  const tracks = [
    { musicId: 1, name: 'Aleluia', track: 1, durationLabel: '1:00', hasInstrumental: false },
    { musicId: 23, name: 'Santo', track: 2, durationLabel: '2:00', hasInstrumental: false },
  ]

  it('query vazia/whitespace devolve tudo', () => {
    expect(filterAlbumTracks(tracks, '')).toHaveLength(2)
    expect(filterAlbumTracks(tracks, '  ')).toHaveLength(2)
  })


  it('filter: track null -> busca por nome/id ainda funciona', () => {
    const semTrack = [{ musicId: 7, name: 'Sétima', track: null, durationLabel: '', hasInstrumental: false }] as never[]
    expect(filterAlbumTracks(semTrack, 'sét')).toHaveLength(1)
    expect(filterAlbumTracks(semTrack, '7')).toHaveLength(1)
  })

  it('casa por número da faixa, nome e id', () => {
    expect(filterAlbumTracks(tracks, '2')).toHaveLength(1)
    expect(filterAlbumTracks(tracks, 'santo')).toHaveLength(1)
    expect(filterAlbumTracks(tracks, '23')).toHaveLength(1)
    expect(filterAlbumTracks(tracks, 'zzz')).toHaveLength(0)
  })
})

describe('loadAlbumLyric', () => {
  it('id inválido -> null; sem registro -> null', async () => {
    expect(await loadAlbumLyric(0)).toBeNull()
    expect(await loadAlbumLyric(-1)).toBeNull()
    expect(await loadAlbumLyric(Number.NaN)).toBeNull()
    readCatalogRecord.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await loadAlbumLyric(5)).toBeNull()
    vi.restoreAllMocks()
  })

  it('lyric array: ordena, remove HTML e linhas vazias; título fallback', async () => {
    readCatalogRecord.mockResolvedValue({
      name: '  Hino X  ',
      lyric: [
        { order: 2, lyric: 'segunda <b>linha</b>' },
        { order: 1, lyric: 'primeira<br/>linha' },
        { order: 3, lyric: '   ' },
      ],
    })
    const doc = await loadAlbumLyric(5)
    expect(doc?.title).toBe('Hino X')
    expect(doc?.lines.map((l) => l.text)).toEqual(['primeira\nlinha', 'segunda linha'])
    expect(doc?.lines[0]?.order).toBe(1)
  })

  it('lyric objeto (map por id) e título ausente -> fallback music_<id>', async () => {
    readCatalogRecord.mockResolvedValue({
      lyric: {
        b: { order: '2', lyric: 'dois' },
        a: { order: '1', lyric: 'um' },
      },
    })
    const doc = await loadAlbumLyric(9)
    expect(doc?.title).toBe('music_9')
    expect(doc?.lines.map((l) => l.text)).toEqual(['um', 'dois'])
  })
})

describe('gaps — hasInstrumental variantes e formatDurationLabel interno', () => {
  it('has_instrumental_music: true, 1, "1", url com espaços, ausente', async () => {
    readCatalogRecord.mockResolvedValue([
      { id_music: 1, name: 'a', has_instrumental_music: true },
      { id_music: 2, name: 'b', has_instrumental_music: 1 },
      { id_music: 3, name: 'c', has_instrumental_music: '1' },
      { id_music: 4, name: 'd', url_instrumental_music: ' /u.mp3 ' },
      { id_music: 5, name: 'e', has_instrumental_music: 0 },
    ])
    const tracks = await loadCollectionTracks(hymnal(9))
    expect(tracks.map((t) => t.hasInstrumental)).toEqual([
      true, true, true, true, false,
    ])
  })

  it('custom: duration string HH:MM:SS e MM:SS via formatDurationLabel', async () => {
    listCustomMusics.mockResolvedValue([
      { id: 1, name: 'a', duration: '01:02:03', officialMusicId: null },
      { id: 2, name: 'b', duration: '3:04', officialMusicId: null },
      { id: 3, name: 'c', duration: 'estranho', officialMusicId: null },
    ])
    const tracks = await loadCollectionTracks(custom(4))
    expect(tracks[0]?.durationLabel).toBe('62:03')
    expect(tracks[1]?.durationLabel).toBe('3:04')
    expect(tracks[2]?.durationLabel).toBe('estranho') // não numérico -> raw
  })
})
