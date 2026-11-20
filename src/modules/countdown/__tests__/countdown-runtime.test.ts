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
vi.stubGlobal('window', dom.window)
vi.stubGlobal('localStorage', dom.window.localStorage)
if (typeof BroadcastChannel === 'function') g.BroadcastChannel = BroadcastChannel

import {
  COUNTDOWN_RUNTIME_CHANNEL,
  COUNTDOWN_RUNTIME_STORAGE_KEY,
  normalizeCountdownRuntime,
  publishCountdownRuntime,
  readCountdownRuntimeFromStorage,
  readTimerRuntimeFromStorage,
  TIMER_RUNTIME_STORAGE_KEY,
  writeCountdownRuntimeToStorage,
  writeTimerRuntimeToStorage,
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

  it('leva o vídeo da Escola Sabatina só se estiver na pasta do vídeo personalizado', () => {
    const videoPath = 'modulos/escola-sabatina/video/video-1.mp4'
    expect(normalizeCountdownRuntime({ videoPath }).videoPath).toBe(videoPath)
    for (const bad of ['modulos/escola-sabatina/video/../../segredo.mp4', 'outra/pasta.mp4', 7, '']) {
      expect(normalizeCountdownRuntime({ videoPath: bad })).not.toHaveProperty('videoPath')
    }
  })

  it('volume do vídeo fica entre 0 e 1 e some se não for número', () => {
    expect(normalizeCountdownRuntime({ videoVolume: 0.3 }).videoVolume).toBe(0.3)
    expect(normalizeCountdownRuntime({ videoVolume: 4 }).videoVolume).toBe(1)
    expect(normalizeCountdownRuntime({ videoVolume: -1 }).videoVolume).toBe(0)
    for (const bad of [NaN, '0.5', null]) {
      expect(normalizeCountdownRuntime({ videoVolume: bad })).not.toHaveProperty('videoVolume')
    }
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

describe('estado próprio do Timer', () => {
  beforeEach(() => localStorage.clear())

  it('sem estado próprio salvo, parte do canal da projeção', () => {
    localStorage.setItem(COUNTDOWN_RUNTIME_STORAGE_KEY, JSON.stringify({ status: 'idle', durationMs: 90_000 }))
    expect(readTimerRuntimeFromStorage().durationMs).toBe(90_000)
  })

  it('com estado próprio, ignora o que outro módulo publicou no canal', () => {
    localStorage.setItem(COUNTDOWN_RUNTIME_STORAGE_KEY, JSON.stringify({ status: 'running', durationMs: 4_500_000 }))
    writeTimerRuntimeToStorage(normalizeCountdownRuntime({ status: 'idle', durationMs: 60_000 }))
    expect(JSON.parse(localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY)!)).toMatchObject({ durationMs: 60_000 })
    expect(readTimerRuntimeFromStorage()).toMatchObject({ status: 'idle', durationMs: 60_000 })
  })

  it('storage indisponível: leitura cai no padrão e gravação não quebra', () => {
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readTimerRuntimeFromStorage().status).toBe('idle')
    expect(() => writeTimerRuntimeToStorage(normalizeCountdownRuntime({}))).not.toThrow()
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
