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
  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
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
