import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

// JSDOM global (padrão palco-bridge-random.integration.test.ts)
const dom = new JSDOM('', { url: 'http://localhost/' })
const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.localStorage = dom.window.localStorage
if (typeof BroadcastChannel === 'function') g.BroadcastChannel = BroadcastChannel

const store = new Map<string, unknown>()
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(<T,>(key: string, fallback: T): T =>
    store.has(key) ? (store.get(key) as T) : fallback),
  loadUserPreferences: vi.fn(() => ({})),
  saveUserPreferences: vi.fn(),
  setUserPreference: vi.fn((key: string, value: unknown) => {
    store.set(key, value)
  }),
}))

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

import {
  TIMER_CONFIG_CHANNEL,
  loadTimerDisplayConfig,
  normalizeTimerDisplayConfig,
  saveTimerDisplayConfig,
} from '../services/timer-preferences'
import { DEFAULT_TIMER_DISPLAY_CONFIG } from '../types/timer'

beforeEach(() => {
  store.clear()
})

describe('timer-preferences — normalize', () => {
  it('não-objeto → default', () => {
    for (const raw of [null, undefined, 'x', 2]) {
      expect(normalizeTimerDisplayConfig(raw)).toEqual({ ...DEFAULT_TIMER_DISPLAY_CONFIG })
    }
  })

  it('config válida aceita', () => {
    expect(
      normalizeTimerDisplayConfig({
        timeFormat: 'hh:mm:ss.ms',
        bgColor: '#aaaaaa',
        textColor: '#bbbbbb',
      }),
    ).toEqual({ timeFormat: 'hh:mm:ss.ms', bgColor: '#aaaaaa', textColor: '#bbbbbb' })
  })

  it('timeFormat inválido → default; cores vazias → default', () => {
    const config = normalizeTimerDisplayConfig({ timeFormat: 'yy', bgColor: '', textColor: null })
    expect(config.timeFormat).toBe(DEFAULT_TIMER_DISPLAY_CONFIG.timeFormat)
    expect(config.bgColor).toBe(DEFAULT_TIMER_DISPLAY_CONFIG.bgColor)
    expect(config.textColor).toBe(DEFAULT_TIMER_DISPLAY_CONFIG.textColor)
  })
})

describe('timer-preferences — load/save', () => {
  it('load sem config → default', () => {
    expect(loadTimerDisplayConfig()).toEqual({ ...DEFAULT_TIMER_DISPLAY_CONFIG })
  })

  it('save persiste e load devolve', () => {
    const config = { ...DEFAULT_TIMER_DISPLAY_CONFIG, bgColor: '#0f0f0f' }
    saveTimerDisplayConfig(config)
    expect(store.get(USER_PREFERENCE_KEYS.timerConfig)).toEqual(config)
    expect(loadTimerDisplayConfig()).toEqual(config)
  })

  it('save publica no canal', () => {
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
      saveTimerDisplayConfig({ ...DEFAULT_TIMER_DISPLAY_CONFIG })
      expect(posted).toHaveLength(1)
    } finally {
      g.BroadcastChannel = prev
    }
  })
})
