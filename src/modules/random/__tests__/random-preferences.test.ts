import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

// JSDOM global (padrão palco-bridge-random.integration.test.ts)
const dom = new JSDOM('', { url: 'http://localhost/' })
const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.localStorage = dom.window.localStorage
if (typeof BroadcastChannel === 'function') g.BroadcastChannel = BroadcastChannel

// mock user-preferences com backing store local (mesmo specifier @shared)
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
  RANDOM_CONFIG_CHANNEL,
  loadRandomDisplayConfig,
  loadRandomSession,
  normalizeRandomDisplayConfig,
  normalizeRandomSession,
  saveRandomDisplayConfig,
  saveRandomSession,
} from '../services/random-preferences'
import {
  DEFAULT_RANDOM_DISPLAY_CONFIG,
  DEFAULT_RANDOM_SESSION,
  RANDOM_FONT_SIZE_MAX,
  RANDOM_FONT_SIZE_MIN,
  emptyModePool,
} from '../types/random'

beforeEach(() => {
  store.clear()
})

describe('random-preferences — normalizeRandomDisplayConfig', () => {
  it('não-objeto → default', () => {
    for (const raw of [null, undefined, 'x', 3]) {
      expect(normalizeRandomDisplayConfig(raw)).toEqual({ ...DEFAULT_RANDOM_DISPLAY_CONFIG })
    }
  })

  it('aceita config completa válida', () => {
    const config = normalizeRandomDisplayConfig({
      bgColor: '#112233',
      textColor: '#abcdef',
      fontSizePc: 10,
      textTransform: 'uppercase',
      animationSpeed: 'slow',
    })
    expect(config).toEqual({
      ...DEFAULT_RANDOM_DISPLAY_CONFIG,
      bgColor: '#112233',
      textColor: '#abcdef',
      fontSizePc: 10,
      textTransform: 'uppercase',
      animationSpeed: 'slow',
    })
  })

  it('aliases background/color são aceitos', () => {
    const config = normalizeRandomDisplayConfig({
      background: '#111111',
      color: '#222222',
    })
    expect(config.bgColor).toBe('#111111')
    expect(config.textColor).toBe('#222222')
  })

  it('fontSize clampado entre MIN e MAX e arredondado', () => {
    expect(normalizeRandomDisplayConfig({ fontSizePc: 1 }).fontSizePc).toBe(RANDOM_FONT_SIZE_MIN)
    expect(normalizeRandomDisplayConfig({ fontSizePc: 99 }).fontSizePc).toBe(RANDOM_FONT_SIZE_MAX)
    expect(normalizeRandomDisplayConfig({ fontSizePc: 7.6 }).fontSizePc).toBe(8)
    expect(normalizeRandomDisplayConfig({ fontSizePc: 'x' }).fontSizePc).toBe(
      DEFAULT_RANDOM_DISPLAY_CONFIG.fontSizePc,
    )
  })

  it('textTransform/animationSpeed/bgColor/textColor inválidos → defaults', () => {
    const config = normalizeRandomDisplayConfig({
      textTransform: 'shout',
      animationSpeed: 'warp',
      bgColor: '',
      textColor: null,
    })
    expect(config.textTransform).toBe(DEFAULT_RANDOM_DISPLAY_CONFIG.textTransform)
    expect(config.animationSpeed).toBe(DEFAULT_RANDOM_DISPLAY_CONFIG.animationSpeed)
    expect(config.bgColor).toBe(DEFAULT_RANDOM_DISPLAY_CONFIG.bgColor)
    expect(config.textColor).toBe(DEFAULT_RANDOM_DISPLAY_CONFIG.textColor)
  })
})

describe('random-preferences — normalizeRandomSession', () => {
  it('não-objeto → default com buckets vazios', () => {
    expect(normalizeRandomSession(null)).toEqual({
      ...DEFAULT_RANDOM_SESSION,
      names: emptyModePool(),
      numbers: emptyModePool(),
    })
  })

  it('formato novo: buckets names/numbers normalizados', () => {
    const session = normalizeRandomSession({
      mode: 'numbers',
      names: { available: ['ana'], drawn: [], currentDisplay: '' },
      numbers: { available: ['1', '  ', 7], drawn: ['2'], currentDisplay: '2' },
      numberMin: 5,
      numberMax: 10,
    })
    expect(session.mode).toBe('numbers')
    expect(session.names.available).toEqual(['ana'])
    expect(session.numbers.available).toEqual(['1'])
    expect(session.numbers.drawn).toEqual(['2'])
    expect(session.numberMin).toBe(5)
    expect(session.numberMax).toBe(10)
  })

  it('formato novo com bucket inválido (null) → bucket vazio', () => {
    const session = normalizeRandomSession({
      mode: 'names',
      names: null,
      numbers: 'x',
    })
    expect(session.names).toEqual(emptyModePool())
    expect(session.numbers).toEqual(emptyModePool())
  })

  it('currentDisplay não-string vira string vazia', () => {
    const session = normalizeRandomSession({
      mode: 'names',
      names: { available: ['a'], drawn: [], currentDisplay: 99 },
    })
    expect(session.names.currentDisplay).toBe('')
  })

  it('formato legado: available/drawn migrados para o modo ativo', () => {
    const session = normalizeRandomSession({
      mode: 'names',
      available: ['ana', 'joão'],
      drawn: ['ana'],
    })
    expect(session.names).toEqual({ available: ['ana', 'joão'], drawn: ['ana'], currentDisplay: '' })
    expect(session.numbers).toEqual(emptyModePool())
  })

  it('formato legado em modo numbers migra pro bucket numbers', () => {
    const session = normalizeRandomSession({
      mode: 'numbers',
      available: ['1', '2'],
      drawn: [],
    })
    expect(session.numbers.available).toEqual(['1', '2'])
    expect(session.names).toEqual(emptyModePool())
  })

  it('numberMin/Max inválidos → default da sessão', () => {
    const session = normalizeRandomSession({ mode: 'names', numberMin: 'x', numberMax: NaN })
    expect(session.numberMin).toBe(DEFAULT_RANDOM_SESSION.numberMin)
    expect(session.numberMax).toBe(DEFAULT_RANDOM_SESSION.numberMax)
  })
})

describe('random-preferences — load/save display config', () => {
  it('load sem config → default; save+load roundtrip', () => {
    expect(loadRandomDisplayConfig()).toEqual({ ...DEFAULT_RANDOM_DISPLAY_CONFIG })

    const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, animationSpeed: 'fast' as const }
    saveRandomDisplayConfig(config)
    expect(loadRandomDisplayConfig()).toEqual(config)
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
      saveRandomDisplayConfig({ ...DEFAULT_RANDOM_DISPLAY_CONFIG })
      expect(posted).toHaveLength(1)
    } finally {
      g.BroadcastChannel = prev
    }
  })
})

describe('random-preferences — load/save session', () => {
  it('load sem sessão → default; save+load roundtrip preserva buckets', () => {
    expect(loadRandomSession()).toEqual({
      ...DEFAULT_RANDOM_SESSION,
      names: emptyModePool(),
      numbers: emptyModePool(),
    })

    const session = {
      mode: 'numbers' as const,
      names: { available: ['a'], drawn: [], currentDisplay: '' },
      numbers: { available: ['1'], drawn: ['1'], currentDisplay: '1' },
      numberMin: 2,
      numberMax: 50,
    }
    saveRandomSession(session)
    expect(loadRandomSession()).toEqual(session)
  })

  it('save não compartilha referência de array (snapshot)', () => {
    const session = {
      mode: 'names' as const,
      names: { available: ['x'], drawn: [], currentDisplay: '' },
      numbers: emptyModePool(),
      numberMin: 1,
      numberMax: 9,
    }
    saveRandomSession(session)
    session.names.available.push('y')
    expect(loadRandomSession().names.available).toEqual(['x'])
  })
})
