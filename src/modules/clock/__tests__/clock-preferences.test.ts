import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

// JSDOM global (padrão palco-bridge-random.integration.test.ts)
const dom = new JSDOM('', { url: 'http://localhost/' })
const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.localStorage = dom.window.localStorage
// jsdom não implementa BroadcastChannel — usar o nativo do Node 18+
if (typeof BroadcastChannel === 'function') g.BroadcastChannel = BroadcastChannel

// i18n roda no import-time e puxa user-preferences — mockar com o MESMO
// specifier que o consumidor usa (alias @shared), senão o hoist não intercepta.
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(<T,>(key: string, fallback: T): T => {
    try {
      const raw = dom.window.localStorage.getItem(`pref:${key}`)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  }),
  loadUserPreferences: vi.fn(() => ({})),
  saveUserPreferences: vi.fn(),
  setUserPreference: vi.fn((key: string, value: unknown) => {
    dom.window.localStorage.setItem(`pref:${key}`, JSON.stringify(value))
  }),
}))

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import {
  CLOCK_CONFIG_CHANNEL,
  loadClockConfig,
  normalizeClockConfig,
  saveClockConfig,
} from '../services/clock-preferences'
import { DEFAULT_CLOCK_CONFIG } from '../types/clock'

describe('clock-preferences — normalizeClockConfig', () => {
  it('retorna default para input não-objeto (null, string, número)', () => {
    for (const raw of [null, undefined, 'digital', 42]) {
      expect(normalizeClockConfig(raw)).toEqual({ ...DEFAULT_CLOCK_CONFIG })
    }
  })

  it('aplica defaults para campos inválidos e aceita campos válidos', () => {
    const config = normalizeClockConfig({
      style: 'analog',
      showSeconds: true,
      format24h: true,
      bgColor: '#112233',
      textColor: '#fedcba',
    })
    expect(config).toEqual({
      style: 'analog',
      showSeconds: true,
      format24h: true,
      bgColor: '#112233',
      textColor: '#fedcba',
    })
  })

  it('coage estilo inválido para digital e booleanos/strings inválidos para default', () => {
    const config = normalizeClockConfig({
      style: 'sketchy',
      showSeconds: 'sim',
      format24h: 1,
      bgColor: '',
      textColor: null,
    })
    expect(config.style).toBe('digital')
    expect(config.showSeconds).toBe(DEFAULT_CLOCK_CONFIG.showSeconds)
    expect(config.format24h).toBe(DEFAULT_CLOCK_CONFIG.format24h)
    expect(config.bgColor).toBe(DEFAULT_CLOCK_CONFIG.bgColor)
    expect(config.textColor).toBe(DEFAULT_CLOCK_CONFIG.textColor)
  })

  it('showSeconds=false explícito é respeitado (não vira default)', () => {
    const config = normalizeClockConfig({ showSeconds: false })
    expect(config.showSeconds).toBe(false)
  })
})

describe('clock-preferences — load/save', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('load sem preferência salva retorna default', () => {
    expect(loadClockConfig()).toEqual({ ...DEFAULT_CLOCK_CONFIG })
  })

  it('save persiste e load devolve a config salva (roundtrip)', () => {
    const config = { ...DEFAULT_CLOCK_CONFIG, showSeconds: true, format24h: false }
    saveClockConfig(config)
    expect(getUserPreference(USER_PREFERENCE_KEYS.clockConfig, null)).toEqual(config)
    expect(loadClockConfig()).toEqual(config)
  })

  it('load normaliza dados corrompidos do storage', () => {
    setUserPreference(USER_PREFERENCE_KEYS.clockConfig, { style: 'xy' })
    expect(loadClockConfig().style).toBe('digital')
  })

  it('save publica a config no canal do clock', () => {
    const posted: unknown[] = []
    class FakeChannel {
      onmessage: ((e: { data: unknown }) => void) | null = null
      constructor(_name: string) {}
      postMessage(data: unknown) {
        posted.push(data)
      }
      close() {}
    }
    const prev = g.BroadcastChannel
    g.BroadcastChannel = FakeChannel

    try {
      const config = { ...DEFAULT_CLOCK_CONFIG, format24h: true }
      saveClockConfig(config)
      expect(posted).toEqual([config])
      expect(getUserPreference(USER_PREFERENCE_KEYS.clockConfig, null)).toEqual(config)
    } finally {
      g.BroadcastChannel = prev
    }
  })
})
