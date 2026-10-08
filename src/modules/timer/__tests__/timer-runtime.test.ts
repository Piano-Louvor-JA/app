import { beforeEach, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

// JSDOM global (padrão palco-bridge-random.integration.test.ts)
const dom = new JSDOM('', { url: 'http://localhost/' })
const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.localStorage = dom.window.localStorage
// jsdom não implementa BroadcastChannel — usar o nativo do Node 18+
if (typeof BroadcastChannel === 'function') g.BroadcastChannel = BroadcastChannel

import {
  TIMER_RUNTIME_CHANNEL,
  TIMER_RUNTIME_STORAGE_KEY,
  normalizeTimerRuntime,
  publishTimerRuntime,
  readTimerRuntimeFromStorage,
  writeTimerRuntimeToStorage,
} from '../services/timer-runtime'
import { DEFAULT_TIMER_RUNTIME } from '../types/timer'

const EMPTY = { ...DEFAULT_TIMER_RUNTIME, savedTimesMs: [] }

describe('timer-runtime — normalizeTimerRuntime', () => {
  it('retorna estado default para input não-objeto', () => {
    for (const raw of [null, undefined, 'running', 7]) {
      expect(normalizeTimerRuntime(raw)).toEqual(EMPTY)
    }
  })

  it('aceita estado completo válido', () => {
    const state = normalizeTimerRuntime({
      status: 'running',
      projecting: true,
      segmentStartedAt: 123,
      accumulatedMs: 456,
      savedTimesMs: [100, 200.7, 'x', null, NaN],
    })
    expect(state).toEqual({
      status: 'running',
      projecting: true,
      segmentStartedAt: 123,
      accumulatedMs: 456,
      savedTimesMs: [100, 200.7],
    })
  })

  it('coage campos inválidos para defaults', () => {
    const state = normalizeTimerRuntime({
      status: 'warp',
      projecting: 'yes',
      segmentStartedAt: 'abc',
      accumulatedMs: 'abc',
      savedTimesMs: 'nope',
    })
    expect(state.status).toBe(EMPTY.status)
    expect(state.projecting).toBe(false)
    expect(state.segmentStartedAt).toBeNull()
    expect(state.accumulatedMs).toBe(0)
    expect(state.savedTimesMs).toEqual([])
  })

  it('Infinity não é número finito → null', () => {
    expect(normalizeTimerRuntime({ segmentStartedAt: Infinity }).segmentStartedAt).toBeNull()
    expect(normalizeTimerRuntime({ accumulatedMs: Infinity }).accumulatedMs).toBe(0)
  })
})

describe('timer-runtime — storage roundtrip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('read sem storage retorna default', () => {
    expect(readTimerRuntimeFromStorage()).toEqual(EMPTY)
  })

  it('write + read devolve o estado (roundtrip)', () => {
    const state = { ...EMPTY, status: 'paused' as const, accumulatedMs: 999, projecting: true }
    writeTimerRuntimeToStorage(state)
    expect(readTimerRuntimeFromStorage()).toEqual(state)
  })

  it('storage corrompido (JSON inválido) cai no default sem lançar', () => {
    localStorage.setItem(TIMER_RUNTIME_STORAGE_KEY, '{quebrado')
    expect(readTimerRuntimeFromStorage()).toEqual(EMPTY)
  })

  it('storage com objeto inválido é normalizado', () => {
    localStorage.setItem(TIMER_RUNTIME_STORAGE_KEY, JSON.stringify({ status: 'x' }))
    expect(readTimerRuntimeFromStorage().status).toBe(EMPTY.status)
  })
})

describe('timer-runtime — publishTimerRuntime', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('publica o estado no canal e persiste', () => {
    const posted: unknown[] = []
    class FakeChannel {
      constructor(_name: string) {}
      postMessage(data: unknown) {
        posted.push(data)
      }
      close() {}
    }
    const prev = g.BroadcastChannel
    g.BroadcastChannel = FakeChannel

    try {
      const state = { ...EMPTY, status: 'running' as const, accumulatedMs: 42, projecting: true }
      publishTimerRuntime(state)
      expect(posted).toEqual([state])
      expect(readTimerRuntimeFromStorage()).toEqual(state)
    } finally {
      g.BroadcastChannel = prev
    }
  })
})
