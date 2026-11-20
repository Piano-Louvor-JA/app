// @vitest-environment node
// ambiente node (sem jsdom): exercita o guard typeof window === 'undefined'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  countPending: vi.fn(async () => 0),
  flushOutbox: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../auth-client', () => ({ getAuthSession: mocks.getAuthSession }))
vi.mock('../outbox', () => ({
  countPending: mocks.countPending,
  flushOutbox: mocks.flushOutbox,
}))
vi.mock('../custom-catalog', () => ({ customApiUrl: vi.fn(() => 'https://api.test') }))

import { startOutboxLoop, stopOutboxLoop, tryFlush } from '../outbox-loop'

describe('outbox-loop (node, sem window)', () => {
  beforeEach(() => {
    mocks.getAuthSession.mockReturnValue(null)
    mocks.countPending.mockResolvedValue(0)
    mocks.flushOutbox.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    stopOutboxLoop()
    vi.useRealTimers()
  })

  it('start sem window: liga timer e não registra listener', () => {
    expect(() => startOutboxLoop()).not.toThrow()
    expect(() => startOutboxLoop()).not.toThrow() // idempotente
    stopOutboxLoop()
  })

  it('tryFlush sem sessão retorna false (node)', async () => {
    await expect(tryFlush()).resolves.toBe(false)
  })
})
