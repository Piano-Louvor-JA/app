import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveDatabaseUrl } from '@shared/services/workspace-api'

// Mock browser dependencies to allow module import in Node
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: vi.fn().mockResolvedValue(null),
  setBrowserItem: vi.fn().mockResolvedValue(undefined),
  removeBrowserItem: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@shared/services/user-preferences', () => ({
  loadUserPreferences: vi.fn().mockResolvedValue({}),
  getUserPreference: vi.fn().mockReturnValue(null),
}))

vi.mock('@plugins/i18n', () => ({
  detectInitialLocale: vi.fn().mockReturnValue('pt'),
  localeToApiPrefix: { pt: 'pt', es: 'es', en: 'en' },
}))

// Mock remote-catalog with implementation based on filename
const fetchRemoteCatalogJsonMock = vi.fn((filename: string) => {
  if (filename === 'pt_hymnal') {
    return Promise.resolve([{ id_music: 1, name: 'Hino 1', track: 1 }])
  }
  if (filename === 'pt_hymnal_1996') {
    return Promise.resolve([{ id_music: 2, name: 'Hino 1996', track: 2 }])
  }
  // pt_musics, pt_categories, album_* -> empty
  return Promise.resolve([])
})
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: fetchRemoteCatalogJsonMock,
}))

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete (import.meta.env as Record<string, unknown>)[key]
  } else {
    ;(import.meta.env as Record<string, unknown>)[key] = value
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  fetchRemoteCatalogJsonMock.mockClear()
  setEnv('VITE_URL_DATABASE', 'https://api.test.com/json_db')
  setEnv('VITE_URL_FILES', 'https://api.test.com/file')
  setEnv('VITE_API_TOKEN', undefined)
  setEnv('VITE_API_FALLBACK_URLS', 'https://fallback.test.com')
})

describe('Integration: liturgy-catalog → remote-catalog → cache', () => {
  it('loadLiturgyMusicOptions calls fetchRemoteCatalogJson for pt_hymnal and pt_hymnal_1996', async () => {
    const { loadLiturgyMusicOptions } = await import('../services/liturgy-catalog')
    const result = await loadLiturgyMusicOptions()

    expect(result).toHaveLength(2)
    expect(result[0].albumNames).toBe('Hinário Adventista')
    expect(result[1].albumNames).toBe('Hinário Adventista 1996')
    expect(fetchRemoteCatalogJsonMock).toHaveBeenCalledWith('pt_hymnal')
    expect(fetchRemoteCatalogJsonMock).toHaveBeenCalledWith('pt_hymnal_1996')
  })

  it('resolveDatabaseUrl normalizes trailing slashes for liturgy files', () => {
    setEnv('VITE_URL_DATABASE', 'https://custom.api.com/json_db/')
    const url = resolveDatabaseUrl('pt_hymnal')
    expect(url).toBe('https://custom.api.com/json_db/pt_hymnal')
  })

  it('loadLiturgyMusicOptions handles 429 retry from remote-catalog', async () => {
    let callCount = 0
    fetchRemoteCatalogJsonMock.mockImplementation((filename: string) => {
      callCount++
      if (filename === 'pt_hymnal') {
        if (callCount === 1) return Promise.reject(new Error('rate limited'))
        return Promise.resolve([{ id_music: 1, name: 'Hino 1', track: 1 }])
      }
      if (filename === 'pt_hymnal_1996') {
        return Promise.resolve([{ id_music: 2, name: 'Hino 1996', track: 2 }])
      }
      return Promise.resolve([])
    })

    const { loadLiturgyMusicOptions } = await import('../services/liturgy-catalog')
    const result = await loadLiturgyMusicOptions()

    expect(result).toHaveLength(2)
    // pt_hymnal called twice (retry) + pt_hymnal_1996 + pt_musics + pt_categories
    expect(callCount).toBeGreaterThanOrEqual(3)
  })
})
