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
  COUNTDOWN_CONFIG_CHANNEL,
  loadCountdownDisplayConfig,
  normalizeCountdownDisplayConfig,
  saveCountdownDisplayConfig,
} from '../services/countdown-preferences'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG } from '../types/countdown'

beforeEach(() => {
  store.clear()
})

describe('countdown-preferences — normalize', () => {
  it('não-objeto → default', () => {
    for (const raw of [null, undefined, 'x', 1]) {
      expect(normalizeCountdownDisplayConfig(raw)).toEqual({
        ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
      })
    }
  })

  it('config válida aceita', () => {
    expect(
      normalizeCountdownDisplayConfig({
        timeFormat: 'mm:ss.ms',
        bgColor: '#123456',
        textColor: '#654321',
      }),
    ).toEqual({ timeFormat: 'mm:ss.ms', bgColor: '#123456', textColor: '#654321' })
  })

  it('timeFormat fora da lista → default; bgColor/textColor vazios → default', () => {
    const config = normalizeCountdownDisplayConfig({
      timeFormat: 'dd:hh',
      bgColor: '',
      textColor: '',
    })
    expect(config.timeFormat).toBe(DEFAULT_COUNTDOWN_DISPLAY_CONFIG.timeFormat)
    expect(config.bgColor).toBe(DEFAULT_COUNTDOWN_DISPLAY_CONFIG.bgColor)
    expect(config.textColor).toBe(DEFAULT_COUNTDOWN_DISPLAY_CONFIG.textColor)
  })
})

describe('countdown-preferences — load/save', () => {
  it('load sem config → default', () => {
    expect(loadCountdownDisplayConfig()).toEqual({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
  })

  it('save persiste e load devolve', () => {
    const config = { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, timeFormat: 'mm:ss' as const }
    saveCountdownDisplayConfig(config)
    expect(store.get(USER_PREFERENCE_KEYS.countdownConfig)).toEqual(config)
    expect(loadCountdownDisplayConfig()).toEqual(config)
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
      saveCountdownDisplayConfig({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
      expect(posted).toHaveLength(1)
    } finally {
      g.BroadcastChannel = prev
    }
  })
})
