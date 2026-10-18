import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// fetch mockado: 200 = serviço vivo
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// URL sem ?projection e sem opener = contexto operador
vi.stubGlobal('location', { search: '' })

describe('useApiConnectivity (issue 321)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.useFakeTimers()
  })
  afterEach(async () => {
    const mod = await import('../useApiConnectivity')
    mod.useApiConnectivity().stop()
    vi.useRealTimers()
  })

  async function load() {
    const mod = await import('../useApiConnectivity')
    return mod.useApiConnectivity()
  }

  it('estado inicial ok', async () => {
    const { state } = await load()
    expect(state.value).toBe('ok')
  })

  it('API responde 200 → ok', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const { state, start } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    expect(state.value).toBe('ok')
  })

  it('API fora (fetch throw em todos os fallbacks) → offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { state, start } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    expect(state.value).toBe('offline')
  })

  it('volta pra ok quando o serviço retorna (reconexão automática)', async () => {
    let calls = 0
    fetchMock.mockImplementation(async () => {
      calls += 1
      if (calls <= 3) throw new TypeError('Failed to fetch')
      return new Response(null, { status: 200 })
    })
    const { state, start } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    expect(state.value).toBe('offline')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(state.value).toBe('ok')
  })

  it('sonda /v1/health da origem da API, nunca a lista de músicas (pesada)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const { start } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((url) => /^https?:\/\/[^/]+\/v1\/health$/.test(url))).toBe(true)
    expect(urls.some((url) => url.includes('_musics'))).toBe(false)
  })

  it('qualquer resposta HTTP conta como serviço no ar (ex.: 404 no host legado)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const { state, start } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    expect(state.value).toBe('ok')
  })

  it('conectado: só checa de novo a cada 60 s', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const { start } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    const afterFirst = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(45_000)
    expect(fetchMock.mock.calls.length).toBe(afterFirst)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchMock.mock.calls.length).toBe(afterFirst + 1)
  })

  it('janela oculta pausa a checagem; ao voltar, checa na hora', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    let visibility: DocumentVisibilityState = 'visible'
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    try {
      const { start } = await load()
      start()
      await vi.advanceTimersByTimeAsync(10)
      const afterFirst = fetchMock.mock.calls.length

      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(300_000)
      expect(fetchMock.mock.calls.length).toBe(afterFirst)

      visibility = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(10)
      expect(fetchMock.mock.calls.length).toBe(afterFirst + 1)
    } finally {
      spy.mockRestore()
    }
  })

  it('start() repetido não duplica as checagens', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const { start } = await load()
    start()
    start()
    await vi.advanceTimersByTimeAsync(10)
    const afterFirst = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock.mock.calls.length).toBe(afterFirst * 2)
  })

  it('stop() encerra os agendamentos', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const { start, stop } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    stop()
    const calls = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(600_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10)
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('usa fallbacks em cascata antes de declarar offline', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('pianolouvorja')) throw new TypeError('down')
      return new Response(null, { status: 200 })
    })
    const { state, start } = await load()
    start()
    await vi.advanceTimersByTimeAsync(10)
    expect(state.value).toBe('ok')
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
