import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCountdownDisplayConfig, saveCountdownDisplayConfig } from '../countdown-preferences'
import { DEFAULT_ALERT_MARKERS, DEFAULT_COUNTDOWN_DISPLAY_CONFIG } from '../../types/countdown'

vi.mock('@shared/services/user-preferences', () => ({ setUserPreference: vi.fn(), getUserPreference: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

describe('preferências do cronômetro vindas de versões antigas ou corrompidas', () => {
  it.each([null, 'bad', {}, { endTime: 'invalid' }, { endTime: 12 }])('descarta agenda inválida %j', (sabbathConfig) => {
    expect(normalizeCountdownDisplayConfig({ sabbathConfig }).sabbathConfig).toBeUndefined()
  })
  it.each([
    [{ endTime: '18:00', scheduleMode: 'start', startTime: '09:30' }, { endTime: '18:00', scheduleMode: 'start', startTime: '09:30' }],
    [{ endTime: '18:00', startTime: 'bad' }, { endTime: '18:00', scheduleMode: 'endOnly', startTime: undefined }],
    [{ endTime: '18:00' }, { endTime: '18:00', scheduleMode: 'endOnly', startTime: undefined }],
  ])('preserva agenda válida %j', (sabbathConfig, expected) => {
    expect(normalizeCountdownDisplayConfig({ sabbathConfig, mode: 'sabbath', allowNegative: true })).toMatchObject({ sabbathConfig: expected, mode: 'sabbath', allowNegative: true })
  })
  it('descarta entradas de alerta sem identidade, offset ou preset válido sem perder as válidas', () => {
    const result = normalizeCountdownDisplayConfig({ configVersion: 2, alertMarkers: [
      null, false, {}, { id: '', offsetMs: 0, preset: 'beep' },
      { id: 'missing', preset: 'beep' }, { id: 'infinite', offsetMs: Infinity, preset: 'beep' },
      { id: 'empty', offsetMs: 0, preset: '' }, { id: 'valid', offsetMs: 1000, preset: 'gong' },
    ] })
    expect(result.alertMarkers).toEqual([{ id: 'valid', offsetMs: 1000, preset: 'gong' }])
    expect(normalizeCountdownDisplayConfig({ configVersion: 2, alertMarkers: 'broken' }).alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })
  it.each(['broken', {}, { start: 'unknown', '5min': 2 }])('ignora presets legados inválidos %j', (alertTonePresets) => {
    const result = normalizeCountdownDisplayConfig({ alertTonePresets })
    expect(result.alertTonePresets).toBeUndefined()
    expect(result.alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })
  it('salva sem depender do suporte a BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('unsupported') } })
    expect(() => saveCountdownDisplayConfig({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })).not.toThrow()
  })
})
