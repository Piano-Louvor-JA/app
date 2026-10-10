import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

vi.mock('../types/countdown', async () => {
  const actual = await vi.importActual<typeof import('../types/countdown')>('../types/countdown')
  return {
    ...actual,
    DEFAULT_COUNTDOWN_RUNTIME: {
      ...actual.DEFAULT_COUNTDOWN_RUNTIME,
      untilHour: undefined,
      untilMinute: undefined,
    },
  }
})

const dom = new JSDOM('', { url: 'http://localhost/' })
const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.localStorage = dom.window.localStorage
if (typeof BroadcastChannel === 'function') g.BroadcastChannel = BroadcastChannel

import {
  COUNTDOWN_RUNTIME_CHANNEL,
  COUNTDOWN_RUNTIME_STORAGE_KEY,
  normalizeCountdownRuntime,
  publishCountdownRuntime,
  readCountdownRuntimeFromStorage,
  writeCountdownRuntimeToStorage,
} from '../services/countdown-runtime'
import {
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_COUNTDOWN_RUNTIME,
} from '../types/countdown'

const EMPTY = {
  ...DEFAULT_COUNTDOWN_RUNTIME,
  untilHour: 18,
  untilMinute: 0,
  savedTimesMs: [],
  durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
}

describe('countdown-runtime — normalize', () => {
  it('não-objeto → default completo', () => {
    for (const raw of [null, undefined, 'x', 1]) {
      expect(normalizeCountdownRuntime(raw)).toEqual({
        ...EMPTY,
        untilHour: undefined,
        untilMinute: undefined,
      })
    }
  })

  it('aceita estado válido e filtra savedTimes não-numéricos', () => {
    expect(normalizeCountdownRuntime({
      status: 'running', projecting: true, segmentStartedAt: 10,
      accumulatedMs: 20, durationMs: 30, savedTimesMs: [1, NaN, 'x', 2], finished: true,
    })).toEqual({
      ...EMPTY,
      status: 'running', projecting: true, segmentStartedAt: 10,
      accumulatedMs: 20, durationMs: 30, savedTimesMs: [1, 2], finished: true,
    })
  })

  it('normaliza status/números/booleans inválidos e clampa duração negativa', () => {
    const state = normalizeCountdownRuntime({
      status: 'broken', projecting: 'yes', segmentStartedAt: Infinity,
      accumulatedMs: 'x', durationMs: -1, savedTimesMs: 'x', finished: 'yes',
    })
    expect(state).toEqual({ ...EMPTY, projecting: false, durationMs: 0 })
  })

  it('mode until: branch true e fallbacks de untilHour/untilMinute do DEFAULT', () => {
    const state = normalizeCountdownRuntime({ mode: 'until' })
    expect(state.mode).toBe('until')
    expect(state.untilHour).toBe(18)
    expect(state.untilMinute).toBe(0)
  })
})

describe('countdown-runtime — storage', () => {
  beforeEach(() => localStorage.clear())

  it('sem storage ou JSON inválido → default', () => {
    expect(readCountdownRuntimeFromStorage()).toEqual({
      ...EMPTY,
      untilHour: undefined,
      untilMinute: undefined,
    })
    localStorage.setItem(COUNTDOWN_RUNTIME_STORAGE_KEY, '{bad')
    expect(readCountdownRuntimeFromStorage()).toEqual({
      ...EMPTY,
      untilHour: undefined,
      untilMinute: undefined,
    })
  })

  it('write/read faz roundtrip', () => {
    const state = { ...EMPTY, status: 'paused' as const, projecting: true, accumulatedMs: 55 }
    writeCountdownRuntimeToStorage(state)
    expect(readCountdownRuntimeFromStorage()).toEqual(state)
  })

  it('objeto do storage é normalizado', () => {
    localStorage.setItem(COUNTDOWN_RUNTIME_STORAGE_KEY, JSON.stringify({ durationMs: -1 }))
    expect(readCountdownRuntimeFromStorage().durationMs).toBe(0)
  })
})

describe('countdown-runtime — publish', () => {
  beforeEach(() => localStorage.clear())

  it('persiste e posta o mesmo estado no canal', () => {
    const posted: unknown[] = []
    class FakeChannel {
      constructor(_name: string) {}
      postMessage(value: unknown) { posted.push(value) }
      close() {}
    }
    const prev = g.BroadcastChannel
    g.BroadcastChannel = FakeChannel
    try {
      const state = { ...EMPTY, projecting: true }
      publishCountdownRuntime(state)
      expect(posted).toEqual([state])
      expect(readCountdownRuntimeFromStorage()).toEqual(state)
    } finally {
      g.BroadcastChannel = prev
    }
  })

  it('expõe o canal esperado', () => {
    expect(COUNTDOWN_RUNTIME_CHANNEL).toBe('louvorja-countdown-runtime')
  })
}
)
