import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'
import { resolveDatabaseUrl } from '@shared/services/workspace-api'

// Mock import.meta.env
function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete (import.meta.env as Record<string, unknown>)[key]
  } else {
    ;(import.meta.env as Record<string, unknown>)[key] = value
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.clearAllMocks()
  setEnv('VITE_URL_DATABASE', 'https://api.test.com/json_db')
  setEnv('VITE_URL_FILES', 'https://api.test.com/file')
  setEnv('VITE_API_TOKEN', undefined)
  setEnv('VITE_API_FALLBACK_URLS', 'https://fallback.test.com')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Integration: bootstrap → remote-catalog → cache', () => {
  it('fetchRemoteCatalogJson calls resolveDatabaseUrl and fetch with correct URL', async () => {
    const { fetchRemoteCatalogJson } = await import('@shared/services/remote-catalog')
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ test: 'data' }), { status: 200 })
    )

    const result = await fetchRemoteCatalogJson<{ test: string }>('pt_categories')

    expect(result).toEqual({ test: 'data' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = fetchMock.mock.calls[0]![0]
    expect(calledUrl).toContain('api.test.com/json_db/pt_categories')
    expect(calledUrl).toContain('?')
  })

  it('resolveDatabaseUrl uses VITE_URL_DATABASE with trailing slash handling', () => {
    setEnv('VITE_URL_DATABASE', 'https://custom.api.com/json_db')
    const url = resolveDatabaseUrl('/pt_hymnal')
    expect(url).toBe('https://custom.api.com/json_db/pt_hymnal')

    setEnv('VITE_URL_DATABASE', 'https://custom.api.com/json_db/')
    const url2 = resolveDatabaseUrl('pt_hymnal')
    expect(url2).toBe('https://custom.api.com/json_db/pt_hymnal')
  })

  it('fetchRemoteCatalogJson retries on 429 then succeeds', async () => {
    const { fetchRemoteCatalogJson } = await import('@shared/services/remote-catalog')
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retry: 'ok' }), { status: 200 })
      )

    const result = await fetchRemoteCatalogJson<{ retry: string }>('test_file', 2, 1)

    expect(result).toEqual({ retry: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fetchRemoteCatalogJson delegates to api-fallback cascade after exhausting retries on 5xx', async () => {
    const { fetchRemoteCatalogJson } = await import('@shared/services/remote-catalog')
    // Primary (api.test.com) fails 500 twice (initial + 1 retry)
    // Then api-fallback tries 2 bases (fallback.test.com from env + primary is different host)
    // Each fallback base gets 1 call (retries=0 passed to fetchWithApiFallback)
    fetchMock
      .mockResolvedValueOnce(new Response('server error', { status: 500 }))
      .mockResolvedValueOnce(new Response('server error', { status: 500 }))
      // fallback bases (2 bases with retries=0 = 1 call each)
      .mockResolvedValueOnce(new Response('server error', { status: 500 }))
      .mockResolvedValueOnce(new Response('server error', { status: 500 }))

    await expect(fetchRemoteCatalogJson('test', 1, 1)).rejects.toThrow()
    // 2 primary retries + 2 fallback bases = 4 calls
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('WORKSPACE_RECORD_KEYS.config used by bootstrap matches remote-catalog file param', async () => {
    const { fetchRemoteCatalogJson } = await import('@shared/services/remote-catalog')
    expect(WORKSPACE_RECORD_KEYS.config).toBe('config')
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: '1.0' }), { status: 200 })
    )
    const result = await fetchRemoteCatalogJson<{ version: string }>('config')
    expect(result.version).toBe('1.0')
  })
})
