import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
})

import {
  loadCountdownDisplayConfig,
  normalizeCountdownDisplayConfig,
  saveCountdownDisplayConfig,
} from '../countdown-preferences'
import { DEFAULT_ALERT_MARKERS } from '../../types/countdown'

describe('migração v1 → v2 (alertTonePresets → alertMarkers)', () => {
  beforeEach(() => localStorage.clear())

  it('config v1 (sem configVersion) migra preservando presets nos offsets padrão', () => {
    const migrated = normalizeCountdownDisplayConfig({
      timeFormat: 'hh:mm:ss',
      bgColor: '#000000',
      textColor: '#FFFFFF',
      alertTonePresets: { start: 'gong', '5min': 'chime', '1min': 'none' },
    })
    expect(migrated.configVersion).toBe(2)
    expect(migrated.alertMarkers).toEqual([
      { id: 'start', offsetMs: 0, preset: 'gong' },
      { id: '5min', offsetMs: 300_000, preset: 'chime' },
      { id: '1min', offsetMs: 60_000, preset: 'none' },
    ])
  })

  it('migração é idempotente: v2 migrado 2x produz o mesmo resultado (não duplica)', () => {
    const once = normalizeCountdownDisplayConfig({
      alertTonePresets: { start: 'gong' },
    })
    const twice = normalizeCountdownDisplayConfig(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
    expect(twice.alertMarkers).toHaveLength(3)
  })

  it('sem nada: usa seeds de defaults (paridade com comportamento atual)', () => {
    const config = normalizeCountdownDisplayConfig(null)
    expect(config.alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
    expect(config.configVersion).toBe(2)
  })

  it('config v2 persistida sobrevive a save/load sem perda de marcos custom', () => {
    saveCountdownDisplayConfig({
      timeFormat: 'mm:ss',
      bgColor: '#000000',
      textColor: '#FFFFFF',
      configVersion: 2,
      alertMarkers: [
        { id: 'start', offsetMs: 0, preset: 'abertura_es' },
        { id: 'm7', offsetMs: 420_000, preset: 'beep' },
        { id: 'm30s', offsetMs: 30_000, preset: 'custom:lib-1' },
      ],
    })
    const loaded = loadCountdownDisplayConfig()
    expect(loaded.alertMarkers).toHaveLength(3)
    expect(loaded.alertMarkers?.find((m) => m.id === 'm7')).toEqual({
      id: 'm7',
      offsetMs: 420_000,
      preset: 'beep',
    })
    expect(loaded.alertMarkers?.find((m) => m.id === 'm30s')?.preset).toBe('custom:lib-1')
  })

  it('normaliza entradas inválidas de alertMarkers (offset negativo/NaN → descarta o marco)', () => {
    const config = normalizeCountdownDisplayConfig({
      configVersion: 2,
      alertMarkers: [
        { id: 'ok', offsetMs: 120_000, preset: 'beep' },
        { id: 'bad', offsetMs: -5, preset: 'beep' },
        { id: 'nan', offsetMs: Number.NaN, preset: 'chime' },
        { id: 'nopreset', offsetMs: 90_000 },
      ],
    })
    expect(config.alertMarkers).toEqual([{ id: 'ok', offsetMs: 120_000, preset: 'beep' }])
  })

  it('offsets duplicados na v2 são mantidos (UI bloqueia colisão, storage não corrompe)', () => {
    const config = normalizeCountdownDisplayConfig({
      configVersion: 2,
      alertMarkers: [
        { id: 'a', offsetMs: 60_000, preset: 'beep' },
        { id: 'b', offsetMs: 60_000, preset: 'gong' },
      ],
    })
    expect(config.alertMarkers).toHaveLength(2)
  })

  it('v2 com ZERO marcos é estado válido: persiste vazio (não ressuscita defaults) [crítico cego]', () => {
    const config = normalizeCountdownDisplayConfig({
      configVersion: 2,
      alertMarkers: [],
    })
    expect(config.alertMarkers).toEqual([])
  })

  it('v2 SEM o campo alertMarkers (objeto antigo) usa defaults', () => {
    const config = normalizeCountdownDisplayConfig({
      configVersion: 2,
    })
    expect(config.alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })

  it('v2 com todas as ENTRADAS inválidas → defaults (diferente de [] explícito)', () => {
    const config = normalizeCountdownDisplayConfig({
      configVersion: 2,
      alertMarkers: [{ id: 'bad', offsetMs: -1, preset: 'beep' }],
    })
    expect(config.alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })

  it("v1 com preset 'custom' vira 'legacy-custom' (resolvido no hydrate pela library)", () => {
    const config = normalizeCountdownDisplayConfig({
      alertTonePresets: { start: 'custom', '1min': 'gong' },
    })
    const start = config.alertMarkers?.find((m) => m.id === 'start')
    expect(start?.preset).toBe('legacy-custom')
    const one = config.alertMarkers?.find((m) => m.id === '1min')
    expect(one?.preset).toBe('gong')
  })
})
