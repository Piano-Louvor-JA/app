// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Testes de integracao: validam que TODOS os modulos que fazem fetch
 * da API usam getCurrentApiPrefix() em vez de hardcoded 'pt_'.
 *
 * Cobre o bug fix: https://github.com/pianolouvorja/app/pull/103
 * onde fetches em espanhol continuavam usando pt_hymnal etc.
 */

// Mock workspace-api
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(),
  writeCatalogRecord: vi.fn(),
  resolveDatabaseUrl: vi.fn(() => 'https://api.test'),
  resolveMediaUrl: vi.fn((url: string) => `https://api.test/${url}`),
}))

// Mock desktop-bridge
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
  isDesktopApp: vi.fn(() => false),
}))

// Mock media-paths
vi.mock('../media-paths', () => ({
  resolveRemoteFileUrl: vi.fn((url: string) => `https://api.test/${url}`),
  toRelativeMediaPath: vi.fn((url: string) => url),
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

// Mock remote-catalog (used by album modules)
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(),
}))

// Mock @plugins/i18n
vi.mock('@plugins/i18n', () => ({
  localeToApiPrefix: (locale: string) => {
    const prefix = locale.slice(0, 2).toLowerCase()
    if (prefix === 'en' || prefix === 'es') return prefix
    return 'pt'
  },
  default: {},
}))

// Mock static assets
vi.mock('@assets/library/hymnal.jpeg', () => ({ default: 'hymnal.jpeg' }))
vi.mock('@assets/library/hymnal_1996.jpeg', () => ({ default: 'hymnal_1996.jpeg' }))

import { readCatalogRecord } from '@shared/services/workspace-api'
import { loadLibraryCategories, getCurrentApiPrefix } from '../library-catalog'
import { listAlbumMusicIds, resolveAlbumIdsForMusic } from '../library-download'
import { loadAlbumCategories } from '@modules/albums/services/album-catalog'
import { loadAlbumMusicIndex } from '@modules/albums/services/album-music-search'

import type { LibraryAlbum } from '../types/library'

describe('Integracao: prefixo de idioma em todos os modulos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('library-catalog.ts', () => {
    it('espanhol: loadLibraryCategories busca es_hymnal, es_hymnal_1996, es_categories', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
      vi.mocked(readCatalogRecord).mockResolvedValue([])

      await loadLibraryCategories()

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('es_hymnal')
      expect(calls).toContain('es_hymnal_1996')
      expect(calls).toContain('es_categories')
      expect(calls).not.toContain('pt_hymnal')
      expect(calls).not.toContain('pt_categories')
    })

    it('ingles: loadLibraryCategories busca en_hymnal, en_hymnal_1996, en_categories', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'en' }))
      vi.mocked(readCatalogRecord).mockResolvedValue([])

      await loadLibraryCategories()

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('en_hymnal')
      expect(calls).toContain('en_hymnal_1996')
      expect(calls).toContain('en_categories')
    })
  })

  describe('library-download.ts', () => {
    it('espanhol: resolveAlbumIdsForMusic busca music_{id} no contrato global', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      await resolveAlbumIdsForMusic(42)

      // resolveAlbumIdsForMusic busca music_{id} global (sem prefixo de idioma)
      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('music_42')
    })

    it('espanhol: listAlbumMusicIds busca es_{album.id} para hinario', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      const hymnalAlbum = {
        id: 'hymnal',
        name: 'Hinário',
        subtitle: '',
        coverUrl: null,
        rawCoverUrl: null,
        status: 'idle' as const,
        isHymnal: true,
        progress: 0,
        progressText: '',
        totalCount: 0,
        downloadedCount: 0,
        cancelRequested: false,
        songCount: null,
      }

      await listAlbumMusicIds(hymnalAlbum as LibraryAlbum)

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('es_hymnal')
      expect(calls).not.toContain('pt_hymnal')
    })

    it('portugues: mantem pt_ como prefixo', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'pt-BR' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      const hymnalAlbum = {
        id: 'hymnal',
        name: 'Hinário',
        subtitle: '',
        coverUrl: null,
        rawCoverUrl: null,
        status: 'idle' as const,
        isHymnal: true,
        progress: 0,
        progressText: '',
        totalCount: 0,
        downloadedCount: 0,
        cancelRequested: false,
        songCount: null,
      }

      await listAlbumMusicIds(hymnalAlbum as LibraryAlbum)

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('pt_hymnal')
    })
  })

  describe('album-catalog.ts', () => {
    it('espanhol: loadAlbumCategories busca es_hymnal, es_categories', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      await loadAlbumCategories()

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('es_hymnal')
      expect(calls).toContain('es_hymnal_1996')
      expect(calls).toContain('es_categories')
      expect(calls).not.toContain('pt_hymnal')
    })

    it('ingles: loadAlbumCategories busca en_hymnal, en_categories', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'en' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      await loadAlbumCategories()

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('en_hymnal')
      expect(calls).toContain('en_categories')
    })
  })

  describe('album-music-search.ts', () => {
    it('espanhol: loadAlbumMusicIndex busca es_musics', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      await loadAlbumMusicIndex()

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('es_musics')
      expect(calls).not.toContain('pt_musics')
    })

    it('ingles: loadAlbumMusicIndex busca en_musics', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'en' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      await loadAlbumMusicIndex()

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('en_musics')
    })

    it('portugues: loadAlbumMusicIndex busca pt_musics', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'pt-BR' }))
      vi.mocked(readCatalogRecord).mockResolvedValue(null)

      await loadAlbumMusicIndex()

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      expect(calls).toContain('pt_musics')
    })
  })

  describe('regressao: nenhum modulo usa pt_ hardcoded em espanhol', () => {
    it('completo: em ES, nenhum call deve ter prefixo pt_', async () => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
      vi.mocked(readCatalogRecord).mockResolvedValue([])

      // Dispara todos os modulos
      await loadLibraryCategories()
      await loadAlbumCategories()
      await loadAlbumMusicIndex()

      const hymnalAlbum = {
        id: 'hymnal',
        name: 'Hinário',
        subtitle: '',
        coverUrl: null,
        rawCoverUrl: null,
        status: 'idle' as const,
        isHymnal: true,
        progress: 0,
        progressText: '',
        totalCount: 0,
        downloadedCount: 0,
        cancelRequested: false,
        songCount: null,
      }
      await listAlbumMusicIds(hymnalAlbum as LibraryAlbum)

      const calls = vi.mocked(readCatalogRecord).mock.calls.map((c) => c[0])
      const ptCalls = calls.filter((c) => c.startsWith('pt_'))
      expect(ptCalls).toEqual([])
    })
  })
})
