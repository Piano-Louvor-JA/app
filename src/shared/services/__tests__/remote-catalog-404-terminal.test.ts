// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regressão ES 11/10: registro remoto AUSENTE (404) é condição terminal.
 * Não deve cascatear para hosts fallback nem gerar retry storm — os hosts
 * louvorja/workers respondem 404 + falha CORS, e o player afoga em
 * "TypeError: Failed to fetch" (feedback devmode ES, log 23:28).
 *
 * Decisão análoga à de track-media (02/10): id negativo nunca consulta o
 * remoto; aqui generalizamos: 404 = arquivo inexistente = terminal.
 */

const mocks = vi.hoisted(() => {
  const state = {
    dbUrl: 'http://db.local',
    token: 'tok' as string | undefined,
    fetch: vi.fn(),
    fallback: vi.fn(async () => ({ data: { via: 'fallback' } })),
  }
  return { state }
})

vi.mock('@shared/services/workspace-api', () => ({
  resolveDatabaseUrl: vi.fn((path: string) => `${mocks.state.dbUrl}${path}`),
}))

vi.mock('@shared/services/api-fallback', () => ({
  fetchWithApiFallback: vi.fn((...args: [string, string, object]) =>
    mocks.state.fallback(...args),
  ),
}))

import { fetchRemoteCatalogJson } from '../remote-catalog'

function mockFetchResponse(status: number, body: unknown = { ok: true }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.fallback.mockResolvedValue({ data: { via: 'fallback' } })
  vi.stubGlobal('fetch', mocks.state.fetch)
  vi.stubEnv('VITE_API_TOKEN', 'tok')
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('fetchRemoteCatalogJson — 404 terminal (regressão ES 11/10)', () => {
  it('404 na primária: NÃO cascateia para fallback e NÃO retenta (terminal)', async () => {
    mocks.state.fetch.mockResolvedValue(mockFetchResponse(404))
    await expect(fetchRemoteCatalogJson('es_music_90168')).rejects.toThrow(
      'Servidor retornou erro 404',
    )
    // exatamente 1 chamada de rede — sem retry, sem cascata
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.state.fallback).not.toHaveBeenCalled()
  })

  it('404 não vira "Failed to fetch" recuperável: erro de domínio preserva status', async () => {
    mocks.state.fetch.mockResolvedValue(mockFetchResponse(404))
    await expect(fetchRemoteCatalogJson('es_music_99999')).rejects.toThrow(
      /404/,
    )
    expect(mocks.state.fallback).not.toHaveBeenCalled()
  })

  it('403/4xx (exceto 429) também é terminal: sem cascata', async () => {
    mocks.state.fetch.mockResolvedValue(mockFetchResponse(403))
    await expect(fetchRemoteCatalogJson('es_music_90168')).rejects.toThrow(
      'Servidor retornou erro 403',
    )
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.state.fallback).not.toHaveBeenCalled()
  })

  it('erro de rede REAL continua cascateando para fallback (transitório ≠ ausente)', async () => {
    mocks.state.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const data = await fetchRemoteCatalogJson('catalog', 0, 0)
    expect(data).toEqual({ via: 'fallback' })
    expect(mocks.state.fallback).toHaveBeenCalledTimes(1)
  })

  it('500 continua com retry/backoff e depois cascata (servidor doente ≠ ausente)', async () => {
    mocks.state.fetch.mockResolvedValue(mockFetchResponse(500))
    const data = await fetchRemoteCatalogJson('catalog', 0, 0)
    // retries=0: sem backoff, direto pra cascata
    expect(data).toEqual({ via: 'fallback' })
    expect(mocks.state.fetch).toHaveBeenCalledTimes(1)
  })
})
