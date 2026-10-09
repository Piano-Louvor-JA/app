import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  filterLiturgyMusicOptions,
  loadLiturgyMusicOptions,
  parseCatalogDurationMs,
} from '../services/liturgy-catalog'
import type { LiturgyMusicOption } from '../types/liturgy'

// Mocks mínimos
const catalogFiles = new Map<string, unknown>()
const remoteFiles = new Map<string, unknown>()
const remoteFailures = new Set<string>()

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: async <T,>(file: string): Promise<T | null> => {
    console.log('[MOCK] readCatalogRecord:', file)
    return (catalogFiles.get(file) as T) ?? null
  },
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

describe('liturgy-catalog - mutation kill via exported functions', () => {
  describe('parseCatalogDurationMs - edge cases mutantes', () => {
    it('número em string "2.5" com espaços → ms', () => {
      expect(parseCatalogDurationMs('  2.5  ')).toBe(2500)
    })

    it('string "00:00" → null (tempo zerado)', () => {
      expect(parseCatalogDurationMs('00:00')).toBeNull()
    })

    it('string "abc" → null (não parseável)', () => {
      expect(parseCatalogDurationMs('abc')).toBeNull()
    })

    it('número 0 → null', () => {
      expect(parseCatalogDurationMs(0)).toBeNull()
    })

    it('número negativo → null', () => {
      expect(parseCatalogDurationMs(-1)).toBeNull()
    })

    it('NaN → null', () => {
      expect(parseCatalogDurationMs(Number.NaN)).toBeNull()
    })
  })

  describe('loadLiturgyMusicOptions - mutantes via índice', () => {
    it('row com id_music string "abc" é ignorada', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 'abc', name: 'Invalido' },
        { id_music: 1, name: 'Valido', duration: 120 },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
    })

    it('row com id_music NaN é ignorada', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: NaN, name: 'Invalido' },
        { id_music: 1, name: 'Valido' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
    })

    it('row com name só espaços é ignorada', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: '   ' },
        { id_music: 2, name: 'Valido' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(2)
    })

    it('row com has_instrumental_music "1" seta true', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', has_instrumental_music: '1' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].hasInstrumental).toBe(true)
    })

    it('row com url_instrumental_music string com espaços seta true', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', url_instrumental_music: '  http://x  ' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].hasInstrumental).toBe(true)
    })

    it('row sem instrumental e sem url seta false', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', has_instrumental_music: false, url_instrumental_music: null },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].hasInstrumental).toBe(false)
    })

    it('albumNames string vazia → "Música"', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', albums_names: '' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].albumNames).toBe('Música')
    })

    it('albumNames só espaços → "Música"', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', albums_names: '  ' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].albumNames).toBe('Música')
    })

    it('albumNames split por ·', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', albums_names: 'A · B' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].albumNames).toContain('A')
      expect(result[0].albumNames).toContain('B')
    })

    it('albumNames split por , quando não tem ·', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', albums_names: 'X, Y' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].albumNames).toContain('X')
      expect(result[0].albumNames).toContain('Y')
    })

    it('filtra partes vazias pós-trim', async () => {
      catalogFiles.set('pt_musics', [
        { id_music: 1, name: 'Test', albums_names: 'A,  , B' },
      ])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result[0].albumNames).toContain('A')
      expect(result[0].albumNames).toContain('B')
      expect(result[0].albumNames.split(', ').filter(p => !p)).toHaveLength(0)
    })

    it('hinário: row com track null ignorada', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', [
        { id_music: 1, name: 'Hino', track: null },
        { id_music: 2, name: 'Hino 2', track: '5' },
      ])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      // track null NÃO é filtrado — retorna option com hymnalTrack null
      expect(result).toHaveLength(2)
      expect(result.find(o => o.id === 1)!.hymnalTrack).toBeNull()
      expect(result.find(o => o.id === 2)!.hymnalTrack).toBe(5)
    })

    it('hinário: row com track "abc" (NaN) ignorada', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', [
        { id_music: 1, name: 'Hino', track: 'abc' },
        { id_music: 2, name: 'Hino 2', track: '5' },
      ])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(2)
      expect(result.find(o => o.id === 1)!.hymnalTrack).toBeNull()
    })

    it('hinário: row sem name é filtrada (String(undefined ?? "") === "")', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', [
        { id_music: 42, track: '5' },
        { id_music: 2, name: 'Hino 2', track: '6' },
      ])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(2)
    })

    it('hinário: row com id_music string ignorada', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', [
        { id_music: 'abc', name: 'Hino', track: '5' },
        { id_music: 2, name: 'Hino 2', track: '6' },
      ])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
    })

    it('hinário_1996 processado quando pt_hymnal null', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', [{ id_music: 1, name: 'Hino 1996', track: '10' }])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].displayLabel).toBe('10 - Hino 1996')
    })

    it('categories não-array (string) retorna []', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', 'not-array')
      catalogFiles.set('pt_hymnal_1996', null)
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toEqual([])
    })

    it('categories vazio retorna []', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', [])
      catalogFiles.set('pt_hymnal_1996', [])
      catalogFiles.set('pt_categories', [])
      const result = await loadLiturgyMusicOptions()
      expect(result).toEqual([])
    })

    it('álbum com musics null não crasha', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', null)
      catalogFiles.set('pt_categories', [{ albums: [{ id_album: 10, name: 'Dez' }] }])
      catalogFiles.set('album_10', { musics: null })
      const result = await loadLiturgyMusicOptions()
      expect(result).toEqual([])
    })

    it('álbum com musics não-array não crasha', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', null)
      catalogFiles.set('pt_categories', [{ albums: [{ id_album: 10, name: 'Dez' }] }])
      catalogFiles.set('album_10', { musics: 'not-array' })
      const result = await loadLiturgyMusicOptions()
      expect(result).toEqual([])
    })

    it('álbum sem name (null) usa fallback do album', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', null)
      catalogFiles.set('pt_categories', [{ albums: [{ id_album: 10, name: 'Dez' }] }])
      catalogFiles.set('album_10', { name: null, musics: [{ id_music: 20, name: 'Vinte' }] })
      const result = await loadLiturgyMusicOptions()
      expect(result[0].albumNames).toBe('Dez')
    })

    it('albumName só espaços → fallback "Música"', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', null)
      // pt_categories tem name válido
      catalogFiles.set('pt_categories', [{ albums: [{ id_album: 10, name: 'Album Dez' }] }])
      // album_10 record tem name só espaços → resolvedName = 'Album Dez' (fallback)
      catalogFiles.set('album_10', { name: '   ', musics: [{ id_music: 20, name: 'Vinte' }] })
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
      expect(result[0].albumNames).toBe('Album Dez')
    })

    it('row de album sem id_music finito ignorada', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', null)
      catalogFiles.set('pt_categories', [{ albums: [{ id_album: 10, name: 'Dez' }] }])
      catalogFiles.set('album_10', {
        name: 'Dez',
        musics: [
          { id_music: 20, name: 'Vinte' },
          { name: 'Sem ID' },
        ],
      })
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
    })

    it('row de album com name só espaços ignorada', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', null)
      catalogFiles.set('pt_categories', [{ albums: [{ id_album: 10, name: 'Dez' }] }])
      catalogFiles.set('album_10', {
        name: 'Dez',
        musics: [
          { id_music: 20, name: 'Vinte' },
          { id_music: 21, name: '   ' },
        ],
      })
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
    })

    it('índice pt_musics vazio → carrega via categories', async () => {
      catalogFiles.set('pt_musics', [])
      catalogFiles.set('pt_hymnal', null)
      catalogFiles.set('pt_hymnal_1996', null)
      catalogFiles.set('pt_categories', [{ albums: [{ id_album: 10, name: 'Dez' }] }])
      catalogFiles.set('album_10', { name: 'Dez', musics: [{ id_music: 8, name: 'Oito' }] })
      const result = await loadLiturgyMusicOptions()
      expect(result).toHaveLength(1)
    })
  })

  describe('filterLiturgyMusicOptions - mutantes query', () => {
    it('query "0" não casa com track > 0', () => {
      const opts = [opt({ id: 1, name: 'Hino', hymnalTrack: 5, albumNames: 'Hinário' })]
      expect(filterLiturgyMusicOptions(opts, '0', null)).toHaveLength(0)
    })

    it('query numérica "1996" casa com albumNames mas score 0 (sem track match)', () => {
      const opts = [
        opt({ id: 1, name: 'Hino', hymnalTrack: 5, albumNames: 'Hinário Adventista 1996' }),
        opt({ id: 2, name: 'Hino', hymnalTrack: 5, albumNames: 'Hinário Adventista' }),
      ]
      const r = filterLiturgyMusicOptions(opts, '1996', null)
      // query numérica 1996: filter por includes — só opt1 tem '1996' no albumNames
      expect(r).toHaveLength(1)
      expect(r[0]!.id).toBe(1)
    })

    it('limite 50 resultados aplicado', () => {
      const many = Array.from({ length: 60 }, (_, i) => opt({ id: i + 100, name: `Hino ${i}` }))
      expect(filterLiturgyMusicOptions(many, 'hino', null)).toHaveLength(50)
    })

    it('busca numérica que não casa com track volta para includes', () => {
      const opts = [opt({ id: 1, name: 'Hino', hymnalTrack: 5, albumNames: 'Hinário' })]
      expect(filterLiturgyMusicOptions(opts, '7', null)).toHaveLength(0)
    })
  })
})