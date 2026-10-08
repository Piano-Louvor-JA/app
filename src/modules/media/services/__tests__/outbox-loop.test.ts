// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  countPending: vi.fn(async () => 0),
  flushOutbox: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../auth-client', () => ({
  getAuthSession: mocks.getAuthSession,
  authHeaders: vi.fn(() => ({})),
}))

vi.mock('../outbox', () => ({
  countPending: mocks.countPending,
  flushOutbox: mocks.flushOutbox,
}))

vi.mock('../custom-catalog', () => ({
  customApiUrl: vi.fn((p: string) => `https://api.test/v1/custom${p}`),
}))

import { tryFlush, startOutboxLoop, stopOutboxLoop } from '../outbox-loop'

describe('outbox-loop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthSession.mockReturnValue(null)
    mocks.countPending.mockResolvedValue(0)
    mocks.flushOutbox.mockResolvedValue({ ok: true })
    vi.useFakeTimers()
    stopOutboxLoop()
  })

  afterEach(() => {
    stopOutboxLoop()
    vi.useRealTimers()
  })

  it('tryFlush sem sessão: false e não chama flush', async () => {
    expect(await tryFlush()).toBe(false)
    expect(mocks.flushOutbox).not.toHaveBeenCalled()
  })

  it('tryFlush com sessão e fila vazia: true sem flush', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok' })
    expect(await tryFlush()).toBe(true)
    expect(mocks.flushOutbox).not.toHaveBeenCalled()
  })

  it('tryFlush com fila pendente: flush com authorization header', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok-123' })
    mocks.countPending.mockResolvedValue(3)
    expect(await tryFlush()).toBe(true)
    expect(mocks.flushOutbox).toHaveBeenCalledWith('https://api.test/v1/custom', {
      authorization: 'Bearer tok-123',
    })
  })

  it('tryFlush flush falha: retorna false', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok' })
    mocks.countPending.mockResolvedValue(2)
    mocks.flushOutbox.mockResolvedValue({ ok: false })
    expect(await tryFlush()).toBe(false)
  })

  it('tryFlush concorrente: segundo call é ignorado (flushing guard)', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok' })
    mocks.countPending.mockResolvedValue(2)
    let resolveFlush!: (v: { ok: boolean }) => void
    mocks.flushOutbox.mockImplementation(() => new Promise((r) => { resolveFlush = r }))
    const p1 = tryFlush()
    await vi.advanceTimersByTimeAsync(0) // deixa p1 chegar no flushing=true
    const p2 = await tryFlush()
    expect(p2).toBe(false)
    resolveFlush({ ok: true })
    expect(await p1).toBe(true)
  })

  it('startOutboxLoop: idempotente e flush imediato', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok' })
    mocks.countPending.mockResolvedValue(1)
    startOutboxLoop()
    startOutboxLoop() // segunda chamada: ignorada (timer já existe)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.flushOutbox).toHaveBeenCalledTimes(1)
  })

  it('ciclo periódico de 60s: tenta flush a cada intervalo', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok' })
    mocks.countPending.mockResolvedValue(1)
    startOutboxLoop()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    const base = mocks.flushOutbox.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.flushOutbox.mock.calls.length).toBeGreaterThan(base)
  })

  it('stopOutboxLoop: para o ciclo', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok' })
    mocks.countPending.mockResolvedValue(1)
    startOutboxLoop()
    await vi.advanceTimersByTimeAsync(0)
    stopOutboxLoop()
    const calls = mocks.flushOutbox.mock.calls.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(mocks.flushOutbox.mock.calls.length).toBe(calls)
  })

  it('evento online: flush imediato ao reconectar', async () => {
    mocks.getAuthSession.mockReturnValue({ token: 'tok' })
    mocks.countPending.mockResolvedValue(1)
    startOutboxLoop()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    mocks.flushOutbox.mockClear()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.flushOutbox).toHaveBeenCalled()
  })
})
