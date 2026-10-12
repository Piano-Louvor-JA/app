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
  RANDOM_RUNTIME_CHANNEL,
  RANDOM_RUNTIME_STORAGE_KEY,
  normalizeRandomRuntime,
  publishRandomRuntime,
  readRandomRuntimeFromStorage,
  writeRandomRuntimeToStorage,
} from '../services/random-runtime'
import { DEFAULT_RANDOM_RUNTIME } from '../types/random'

const EMPTY = { ...DEFAULT_RANDOM_RUNTIME, drawn: [] }

describe('random-runtime — normalizeRandomRuntime', () => {
  it('retorna default para não-objeto', () => {
    for (const raw of [null, undefined, 'x', 5]) {
      expect(normalizeRandomRuntime(raw)).toEqual(EMPTY)
    }
  })

  it('aceita estado válido e filtra arrays não-string', () => {
    const state = normalizeRandomRuntime({
      currentDisplay: 'ana',
      isDrawing: true,
      projecting: true,
      drawn: ['ana', 7, null, 'joão'],
      mode: 'numbers',
    })
    expect(state).toEqual({
      currentDisplay: 'ana',
      isDrawing: true,
      projecting: true,
      drawn: ['ana', 'joão'],
      mode: 'numbers',
    })
  })

  it('coage inválidos para defaults', () => {
    const state = normalizeRandomRuntime({
      currentDisplay: 42,
      isDrawing: 'yes',
      projecting: 'no',
      drawn: 'x',
      mode: 'roulette',
    })
    expect(state).toEqual({
      currentDisplay: '',
      isDrawing: false,
      projecting: false,
      drawn: [],
      mode: 'names',
    })
  })
})

describe('random-runtime — storage roundtrip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('read sem storage retorna default', () => {
    expect(readRandomRuntimeFromStorage()).toEqual({ ...DEFAULT_RANDOM_RUNTIME })
  })

  it('write + read roundtrip', () => {
    const state = { ...EMPTY, currentDisplay: 'ana', isDrawing: true, mode: 'numbers' as const }
    writeRandomRuntimeToStorage(state)
    expect(readRandomRuntimeFromStorage()).toEqual(state)
  })

  it('JSON inválido cai no default sem lançar', () => {
    localStorage.setItem(RANDOM_RUNTIME_STORAGE_KEY, '{x')
    expect(readRandomRuntimeFromStorage()).toEqual({ ...DEFAULT_RANDOM_RUNTIME })
  })

  it('objeto inválido é normalizado', () => {
    localStorage.setItem(RANDOM_RUNTIME_STORAGE_KEY, JSON.stringify({ mode: 'x' }))
    expect(readRandomRuntimeFromStorage().mode).toBe('names')
  })
})

describe('random-runtime — publishRandomRuntime', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('publica no canal e persiste', () => {
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
      const state = { ...EMPTY, currentDisplay: 'joão', projecting: true }
      publishRandomRuntime(state)
      expect(posted).toEqual([state])
      expect(readRandomRuntimeFromStorage()).toEqual(state)
    } finally {
      g.BroadcastChannel = prev
    }
  })
})

describe('random-runtime — channel constantes', () => {
  it('canal e storage key expostos', () => {
    expect(RANDOM_RUNTIME_CHANNEL).toBe('louvorja-random-runtime')
    expect(RANDOM_RUNTIME_STORAGE_KEY).toBe('louvorja-random-runtime-state')
  })
})
