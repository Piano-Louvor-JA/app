import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCountdownDisplayConfig, saveCountdownDisplayConfig } from '../countdown-preferences'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG } from '../../types/countdown'

vi.mock('@shared/services/user-preferences', () => ({ setUserPreference: vi.fn(), getUserPreference: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

describe('preferências do Timer vindas de versões antigas ou corrompidas', () => {
  it('sem nada usa a aparência padrão', () => {
    expect(normalizeCountdownDisplayConfig(null)).toEqual(DEFAULT_COUNTDOWN_DISPLAY_CONFIG)
  })

  it('preserva a aparência e descarta formato inválido', () => {
    expect(normalizeCountdownDisplayConfig({ timeFormat: 'mm:ss', bgColor: '#111', textColor: '#eee', allowNegative: false }))
      .toEqual({ timeFormat: 'mm:ss', bgColor: '#111', textColor: '#eee', allowNegative: false })
    expect(normalizeCountdownDisplayConfig({ timeFormat: 'x' }).timeFormat).toBe(DEFAULT_COUNTDOWN_DISPLAY_CONFIG.timeFormat)
  })

  it('config antiga com o modo Escola Sabatina volta ao Timer padrão', () => {
    const config = normalizeCountdownDisplayConfig({
      timeFormat: 'mm:ss',
      mode: 'sabbath',
      configVersion: 2,
      sabbathConfig: { scheduleMode: 'endOnly', endTime: '10:15' },
      sabbathSchoolAudioLang: 'es',
      alertMarkers: [],
      alertTonePresets: { start: 'gong' },
    })
    expect(config).toEqual({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, timeFormat: 'mm:ss' })
  })

  it('salva sem depender do suporte a BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('unsupported') } })
    expect(() => saveCountdownDisplayConfig({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })).not.toThrow()
  })
})
