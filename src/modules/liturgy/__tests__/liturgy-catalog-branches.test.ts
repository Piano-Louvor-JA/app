// Mock localStorage ANTES de QUALQUER import
const mockStorage = new Map<string, string>()
Object.defineProperty(global, 'localStorage', {
  value: { getItem: (k: string) => mockStorage.get(k) ?? null, setItem: (k: string, v: string) => mockStorage.set(k, v), removeItem: (k: string) => mockStorage.delete(k), clear: () => mockStorage.clear() }, writable: true,
})
Object.defineProperty(global, 'sessionStorage', {
  value: { getItem: (k: string) => mockStorage.get(k) ?? null, setItem: (k: string, v: string) => mockStorage.set(k, v), removeItem: (k: string) => mockStorage.delete(k), clear: () => mockStorage.clear() }, writable: true,
})

const { mockFetchRemote, mockReadCatalogRecord, mockGetCurrentApiPrefix } = vi.hoisted(() => ({
  mockFetchRemote: vi.fn(),
  mockReadCatalogRecord: vi.fn(),
  mockGetCurrentApiPrefix: vi.fn(() => 'pt'),
}))

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: mockFetchRemote,
}))
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: mockReadCatalogRecord,
}))
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: mockGetCurrentApiPrefix,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadLiturgyMusicOptions, loadLiturgyBibleBooks, filterLiturgyMusicOptions, parseCatalogDurationMs, sortMusicOptions } from '../services/liturgy-catalog'

describe('liturgy-catalog mutation kill — branches/conditionals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseCatalogDurationMs', () => {
    it('number seconds → ms', () => { expect(parseCatalogDurationMs(120)).toBe(120000) })
    it('string HH:MM:SS', () => { expect(parseCatalogDurationMs('1:30:45')).toBe(5445000) })
    it('string MM:SS', () => { expect(parseCatalogDurationMs('3:45')).toBe(225000) })
    it('string segundos puro', () => { expect(parseCatalogDurationMs('90')).toBe(90000) })
    it('inválidos → null', () => {
      expect(parseCatalogDurationMs('abc')).toBeNull()
      expect(parseCatalogDurationMs('1:2:x')).toBeNull()
      expect(parseCatalogDurationMs(-5)).toBeNull()
      expect(parseCatalogDurationMs(0)).toBeNull()
      expect(parseCatalogDurationMs('')).toBeNull()
      expect(parseCatalogDurationMs(null as any)).toBeNull()
    })
  })

  describe('sortMusicOptions', () => {
    it('ordena por hymnalTrack asc, nulls last', () => {
      const opts = [
        { id: 1, name: 'B', hymnalTrack: 2, albumNames: '', displayLabel: '', durationMs: 0, hasInstrumental: false },
        { id: 2, name: 'A', hymnalTrack: 1, albumNames: '', displayLabel: '', durationMs: 0, hasInstrumental: false },
        { id: 3, name: 'C', hymnalTrack: null, albumNames: '', displayLabel: '', durationMs: 0, hasInstrumental: false },
      ] as any
      const sorted = sortMusicOptions(opts)
      expect(sorted[0].id).toBe(2)
      expect(sorted[1].id).toBe(1)
      expect(sorted[2].id).toBe(3)
    })
    it('mesmo track → localeCompare name', () => {
      const opts = [
        { id: 1, name: 'Zebra', hymnalTrack: 1, albumNames: '', displayLabel: '', durationMs: 0, hasInstrumental: false },
        { id: 2, name: 'Alpha', hymnalTrack: 1, albumNames: '', displayLabel: '', durationMs: 0, hasInstrumental: false },
      ] as any
      expect(sortMusicOptions(opts)[0].name).toBe('Alpha')
    })
  })

  describe('loadLiturgyMusicOptions — branches L285-298', () => {
    it('fromIndex existe → usa índice + completa com hinário', async () => {
      mockReadCatalogRecord.mockImplementation(async (file) => {
        if (file === 'pt_musics') return [{ id_music: 10, name: 'Hino 10', track: 10, duration: '3:00', albums_names: 'Hinário Adventista', albums: [] }]
        return null
      })
      mockFetchRemote.mockImplementation(async (file) => {
        if (file === 'pt_hymnal') return [{ id_music: 10, name: 'Hino 10', track: 10, duration: '3:00', has_instrumental_music: 1 }]
        if (file === 'pt_hymnal_1996') return []
        return null
      })
      const result = await loadLiturgyMusicOptions()
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].hasInstrumental).toBe(true)
    })

    it('fromIndex vazio → fallback hinário + coleções', async () => {
      mockReadCatalogRecord.mockImplementation(async (file) => {
        if (file === 'pt_musics') return []
        if (file === 'pt_categories') return [{ albums: [{ id_album: 100, name: 'Coletânea' }] }]
        if (file === 'album_100') return { name: 'Coletânea', musics: [{ id_music: 7, name: 'Hino 7', track: null, duration: '3:00', has_instrumental_music: false, url_instrumental_music: 'x.mp3' }] }
        return null
      })
      mockFetchRemote.mockImplementation(async (file) => {
        if (file === 'pt_hymnal') return [{ id_music: 5, name: 'Hino 5', track: 5, duration: '2:00', has_instrumental_music: 0 }]
        if (file === 'pt_hymnal_1996') return [{ id_music: 6, name: 'Hino 6', track: 6, duration: '2:30', has_instrumental_music: '1' }]
        return null
      })
      const result = await loadLiturgyMusicOptions()
      expect(result.some(r => r.id === 5)).toBe(true)
      expect(result.some(r => r.id === 6)).toBe(true)
      expect(result.some(r => r.id === 7)).toBe(true)
    })
  })

  describe('loadLiturgyBibleBooks — branches L305-312', () => {
    it('rows válidas → mapeia e filtra', async () => {
      mockReadCatalogRecord.mockResolvedValue([
        { id_bible_book: 1, name: 'Gênesis', chapters: 50 },
        { id_bible_book: '2', name: 'Êxodo', chapters: '40' },
        { id_bible_book: 3, name: '', chapters: 20 },
        { id_bible_book: 4, name: 'Levítico', chapters: 0 },
        { id_bible_book: 'abc', name: 'Números', chapters: 36 },
      ])
      mockFetchRemote.mockResolvedValue(null)
      const result = await loadLiturgyBibleBooks()
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(2)
    })

    it('rows null/undefined → array vazio', async () => {
      mockReadCatalogRecord.mockResolvedValue(null)
      mockFetchRemote.mockResolvedValue(null)
      expect(await loadLiturgyBibleBooks()).toEqual([])
      mockReadCatalogRecord.mockResolvedValue(undefined)
      expect(await loadLiturgyBibleBooks()).toEqual([])
    })

    it('rows não-array → array vazio', async () => {
      mockReadCatalogRecord.mockResolvedValue({} as any)
      mockFetchRemote.mockResolvedValue(null)
      expect(await loadLiturgyBibleBooks()).toEqual([])
    })
  })

  describe('filterLiturgyMusicOptions — branches L321-366', () => {
    const baseOpts = [
      { id: 10, name: 'Hino 10', albumNames: 'Hinário Adventista', hymnalTrack: 10, displayLabel: '', durationMs: 0, hasInstrumental: false },
      { id: 11, name: 'Hino 11', albumNames: 'Hinário Adventista 1996', hymnalTrack: 11, displayLabel: '', durationMs: 0, hasInstrumental: false },
      { id: 12, name: 'Cântico', albumNames: 'Coletânea X', hymnalTrack: null, displayLabel: '', durationMs: 0, hasInstrumental: false },
      { id: 13, name: 'Hino 13', albumNames: 'Hinário Adventista', hymnalTrack: 10, displayLabel: '', durationMs: 0, hasInstrumental: false },
    ] as any

    it('query vazio + selectedId → retorna só selected', () => {
      expect(filterLiturgyMusicOptions(baseOpts, '', 11)).toHaveLength(1)
      expect(filterLiturgyMusicOptions(baseOpts, '', 11)[0].id).toBe(11)
    })

    it('query vazio sem selected → array vazio', () => {
      expect(filterLiturgyMusicOptions(baseOpts, '', null)).toEqual([])
    })

    it('query numérico — match por hymnalTrack', () => {
      const res = filterLiturgyMusicOptions(baseOpts, '10', null)
      expect(res.some(r => r.id === 10)).toBe(true)
      expect(res.some(r => r.id === 13)).toBe(true)
    })

    it('query numérico — match por título/álbum contendo número', () => {
      const res = filterLiturgyMusicOptions(baseOpts, '11', null)
      expect(res.some(r => r.id === 11)).toBe(true)
    })

    it('query texto — match por título', () => {
      const res = filterLiturgyMusicOptions(baseOpts, 'cântico', null)
      expect(res.some(r => r.id === 12)).toBe(true)
    })

    it('query texto — match por álbum', () => {
      const res = filterLiturgyMusicOptions(baseOpts, 'coletânea', null)
      expect(res.some(r => r.id === 12)).toBe(true)
    })

    it('query numérico — sort por score (hinário principal primeiro)', () => {
      const res = filterLiturgyMusicOptions(baseOpts, '10', null)
      expect(res[0].id).toBe(10)
    })

    it('limite 50 resultados', () => {
      const many = Array.from({ length: 60 }, (_, i) => ({
        id: i + 100, name: `Hino ${i}`, albumNames: 'Hinário', hymnalTrack: i + 1, displayLabel: '', durationMs: 0, hasInstrumental: false
      })) as any
      const res = filterLiturgyMusicOptions(many, 'hino', null)
      expect(res.length).toBe(50)
    })
  })
})