import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiCandidateBases, fetchWithApiFallback } from '../api-fallback'

// mock de import.meta.env — os módulos leem direto de import.meta.env
const envMock = { env: {} as Record<string, string> }

vi.mock('import.meta.env', () => envMock)

// stub de import.meta.env via Object.defineProperty (vitest não deixa escrever direto)
function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete (import.meta.env as Record<string, unknown>)[key]
  } else {
    ;(import.meta.env as Record<string, unknown>)[key] = value
  }
}

const fetchMock = vi.fn()

// Config de produção — a MESMA do .env de build. Zero default no código:
// sem env, sem candidatos (contrato testado no primeiro describe).
const PROD = {
  database: 'https://api.pianolouvorja.com.br/json_db',
  files: 'https://api.pianolouvorja.com.br/file',
  fallbacks:
    'https://api.louvorja.com.br,https://api.louvorja.workers.dev',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  setEnv('VITE_URL_DATABASE', PROD.database)
  setEnv('VITE_URL_FILES', PROD.files)
  setEnv('VITE_API_FALLBACK_URLS', PROD.fallbacks)
  setEnv('VITE_API_TOKEN', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiCandidateBases', () => {
  it('sem env NENHUMA: defaults públicos — primária pianolouvorja + fallbacks (hotfix 14/09: CI não injeta VITE_*, zero default quebrava toda build de release)', () => {
    setEnv('VITE_URL_DATABASE', undefined)
    setEnv('VITE_URL_FILES', undefined)
    setEnv('VITE_API_FALLBACK_URLS', undefined)
    expect(apiCandidateBases('database')).toEqual([
      'https://api.pianolouvorja.com.br/json_db',
      'https://api.louvorja.com.br/json_db',
      'https://api.louvorja.workers.dev/json_db',
    ])
    expect(apiCandidateBases('files')).toEqual([
      'https://api.pianolouvorja.com.br/file',
      'https://api.louvorja.com.br/file',
      'https://api.louvorja.workers.dev/file',
    ])
  })

  it('env de produção: primária pianolouvorja + fallbacks louvorja/workers', () => {
    const bases = apiCandidateBases('database')
    expect(bases).toEqual([
      'https://api.pianolouvorja.com.br/json_db',
      'https://api.louvorja.com.br/json_db',
      'https://api.louvorja.workers.dev/json_db',
    ])
  })

  it('env apontando pra fallback externo: sobrepõe os defaults', () => {
    setEnv('VITE_API_FALLBACK_URLS', 'https://mirror.example.com')
    const bases = apiCandidateBases('database')
    expect(bases).toEqual([
      'https://api.pianolouvorja.com.br/json_db',
      'https://mirror.example.com/json_db',
    ])
  })

  it('env sem fallbacks: primária + fallbacks default', () => {
    setEnv('VITE_API_FALLBACK_URLS', undefined)
    const bases = apiCandidateBases('database')
    expect(bases).toEqual([
      'https://api.pianolouvorja.com.br/json_db',
      'https://api.louvorja.com.br/json_db',
      'https://api.louvorja.workers.dev/json_db',
    ])
  })

  it('env sem primária: fallbacks default', () => {
    setEnv('VITE_URL_DATABASE', undefined)
    const bases = apiCandidateBases('database')
    expect(bases).toEqual([
      'https://api.pianolouvorja.com.br/json_db',
      'https://api.louvorja.com.br/json_db',
      'https://api.louvorja.workers.dev/json_db',
    ])
  })

  it('env apontando pra primária não duplica host no fallback', () => {
    setEnv('VITE_URL_FILES', 'https://api.pianolouvorja.com.br/file')
    const bases = apiCandidateBases('files')
    expect(bases[0]).toBe('https://api.pianolouvorja.com.br/file')
    expect(bases.filter((b) => b.includes('pianolouvorja'))).toHaveLength(1)
  })

  it('env apontando pra API dos caras: primária ela, fallbacks sem duplicar', () => {
    setEnv('VITE_URL_DATABASE', 'https://api.louvorja.com.br/json_db')
    const bases = apiCandidateBases('database')
    expect(bases[0]).toBe('https://api.louvorja.com.br/json_db')
    // sem duplicar a primária nos fallbacks
    expect(bases.filter((b) => b === 'https://api.louvorja.com.br/json_db')).toHaveLength(1)
    expect(bases).toContain('https://api.louvorja.workers.dev/json_db')
  })

  it('env de dev local (127.0.0.1) mantém fallbacks de produção', () => {
    setEnv('VITE_URL_DATABASE', 'http://127.0.0.1:3100/json_db')
    const bases = apiCandidateBases('database')
    expect(bases[0]).toBe('http://127.0.0.1:3100/json_db')
    expect(bases).toContain('https://api.louvorja.com.br/json_db')
  })

  it('fallbacks com redundância extra da nossa API (futuro): respeita a ordem da env', () => {
    setEnv(
      'VITE_API_FALLBACK_URLS',
      'https://backup.pianolouvorja.com.br, https://api.louvorja.com.br',
    )
    const bases = apiCandidateBases('database')
    expect(bases).toEqual([
      'https://api.pianolouvorja.com.br/json_db',
      'https://backup.pianolouvorja.com.br/json_db',
      'https://api.louvorja.com.br/json_db',
    ])
  })
})

describe('fetchWithApiFallback', () => {
  it('primária ok: nem tenta fallback', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    )
    const { data } = await fetchWithApiFallback<{ ok: number }>('database', 'pt_categories')
    expect(data).toEqual({ ok: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toContain('pianolouvorja')
  })

  it('primária fora (rede) → cai pra api.louvorja.com.br', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: 2 }), { status: 200 }),
      )
    const { data, base } = await fetchWithApiFallback<{ ok: number }>('database', 'pt_categories', { retries: 0, delayMs: 1 })
    expect(data).toEqual({ ok: 2 })
    expect(base).toBe('https://api.louvorja.com.br/json_db')
  })

  it('primária e fallback 1 fora → workers.dev atende', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: 3 }), { status: 200 }),
      )
    const { data, base } = await fetchWithApiFallback<{ ok: number }>('database', 'pt_categories', { retries: 0, delayMs: 1 })
    expect(data).toEqual({ ok: 3 })
    expect(base).toBe('https://api.louvorja.workers.dev/json_db')
  })

  it('todas caídas: propaga o último erro', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      fetchWithApiFallback('database', 'pt_categories', { retries: 0, delayMs: 1 }),
    ).rejects.toThrow('Failed to fetch')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('404 definitivo na primária também migra de host (catálogo pode divergir)', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: 9 }), { status: 200 }),
      )
    const { data, base } = await fetchWithApiFallback<{ ok: number }>('database', 'pt_categories', { retries: 0, delayMs: 1 })
    expect(data).toEqual({ ok: 9 })
    expect(base).toBe('https://api.louvorja.com.br/json_db')
  })
})

describe('fetchWithRetry — ramos de retry (429/5xx/rede, backoff)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('429 na primária: retry na MESMA base com backoff, depois sucesso', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    const promise = fetchWithApiFallback('database', 'x.json')
    // backoff 1000ms
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result.base).toBe(PROD.database)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // ambas as chamadas na MESMA base (rate limit é por host)
    const urls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(urls[0]).toContain('pianolouvorja.com.br')
    expect(urls[1]).toContain('pianolouvorja.com.br')
  })

  it('429 esgota retries na primária: migra pro fallback', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 429 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }))
    const ok = new Response(JSON.stringify({ ok: 1 }), { status: 200 })
    fetchMock.mockResolvedValueOnce(ok)
    const promise = fetchWithApiFallback('database', 'x.json', { retries: 5, delayMs: 10 })
    // esgotar backoffs (5 tentativas * 10ms*1.5^n, folga)
    for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result.base).toContain('louvorja.com.br')
  })

  it('5xx na primária: retry com backoff e sucesso', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    const promise = fetchWithApiFallback('database', 'x.json')
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result.data).toEqual({ ok: 1 })
  })

  it('5xx esgota: próxima base', async () => {
    fetchMock
      .mockResolvedValue(new Response('', { status: 500 }))
    const promise = fetchWithApiFallback('database', 'x.json', { retries: 1, delayMs: 10 })
    const catchPromise = promise.catch((e: Error) => e)
    for (let i = 0; i < 15; i++) await vi.advanceTimersByTimeAsync(1000)
    const err = await catchPromise
    expect(String(err)).toContain('api-exhausted')
  })

  it('erro de rede na primária: retry e depois fallback', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 2 }), { status: 200 }))
    const promise = fetchWithApiFallback('database', 'x.json')
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result.data).toEqual({ ok: 2 })
  })

  it('erro de rede que NÃO é fetch/network error: propaga direto (sem retry)', async () => {
    fetchMock.mockRejectedValue(new Error('abort')).mockRejectedValueOnce(new Error('abort'))
    const catchPromise = fetchWithApiFallback('database', 'x.json').catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(5000)
    const err = await catchPromise
    expect(String(err)).toContain('abort')
  })

  it('baseToHost com base inválida: usa a string crua (catch do URL)', async () => {
    setEnv('VITE_URL_DATABASE', 'nao-e-url')
    setEnv('VITE_API_FALLBACK_URLS', '')
    const bases = apiCandidateBases('database')
    expect(bases[0]).toBe('nao-e-url')
  })

  it('VITE_API_TOKEN presente: header Api-Token vai no fetch', async () => {
    setEnv('VITE_API_TOKEN', 'tok-123')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    await fetchWithApiFallback('database', 'x.json')
    expect(fetchMock.mock.calls[0]![1]).toEqual({ headers: { 'Api-Token': 'tok-123' } })
  })
  it('file com barra inicial: URL montado sem duplicar barra', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 3 }), { status: 200 }))
    const result = await fetchWithApiFallback<{ ok: number }>('database', '/pt_categories')
    expect(result.data).toEqual({ ok: 3 })
    const calledUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(calledUrl).toContain('/json_db/pt_categories')
    expect(calledUrl).not.toContain('//pt_categories')
  })

  it('NetworkError (Safari): retry com backoff e depois sucesso', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('NetworkError when attempting to fetch resource.'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 4 }), { status: 200 }))
    const promise = fetchWithApiFallback('database', 'x.json')
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result.data).toEqual({ ok: 4 })
  })

})