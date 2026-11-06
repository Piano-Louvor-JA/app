import { beforeEach, describe, expect, it } from 'vitest'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
})

import { LEGACY_CUSTOM_TONES_KEY } from '../alert-tone'
import { listLibraryTones } from '../alert-tone-library'
import {
  loadSabbathSchoolConfig,
  normalizeSabbathSchoolConfig,
  sabbathSchoolConfigFromLegacyCountdown,
  saveSabbathSchoolConfig,
} from '../sabbath-school-preferences'
import { DEFAULT_ALERT_MARKERS, defaultSabbathSchoolConfig } from '../../types/sabbath-school'

const MIN = 60_000

function userData(): Record<string, unknown> {
  return JSON.parse(values.get('user_data') ?? '{}')
}

function setUserData(data: Record<string, unknown>): void {
  values.set('user_data', JSON.stringify(data))
}

describe('normalizeSabbathSchoolConfig', () => {
  it('sem nada usa duração de 45 min, idioma automático e os marcos padrão', () => {
    expect(normalizeSabbathSchoolConfig(null)).toEqual(defaultSabbathSchoolConfig())
    expect(defaultSabbathSchoolConfig().schedule).toEqual({ scheduleMode: 'duration', durationMs: 45 * MIN, endTime: '10:15' })
  })

  it.each([
    null, 'bad', {}, { endTime: 'invalid' }, { endTime: 12 },
    { scheduleMode: 'duration', durationMs: 0 }, { scheduleMode: 'duration', durationMs: -MIN },
    { scheduleMode: 'duration', durationMs: Infinity }, { scheduleMode: 'duration', durationMs: '45' },
  ])('agenda inválida %j volta ao padrão', (schedule) => {
    expect(normalizeSabbathSchoolConfig({ schedule }).schedule).toEqual({ scheduleMode: 'duration', durationMs: 45 * MIN, endTime: '10:15' })
  })

  it.each([
    [{ scheduleMode: 'duration', durationMs: 30 * MIN, endTime: '10:15' }, { scheduleMode: 'duration', durationMs: 30 * MIN, endTime: '10:15' }],
    [{ scheduleMode: 'endOnly', endTime: '18:00' }, { scheduleMode: 'endOnly', durationMs: 45 * MIN, endTime: '18:00' }],
    [{ scheduleMode: 'endOnly', endTime: 'bad', durationMs: 20 * MIN }, { scheduleMode: 'endOnly', durationMs: 20 * MIN, endTime: '10:15' }],
  ])('preserva agenda válida %j', (schedule, expected) => {
    expect(normalizeSabbathSchoolConfig({ schedule }).schedule).toEqual(expected)
  })

  it.each([
    [{ scheduleMode: 'start', startTime: '09:00', endTime: '10:15' }, 75 * MIN],
    [{ scheduleMode: 'start', startTime: '10:30', endTime: '10:15' }, 45 * MIN],
    [{ scheduleMode: 'start', startTime: 'bad', endTime: '10:15' }, 45 * MIN],
  ])('"início e término" antigo %j vira duração', (schedule, durationMs) => {
    expect(normalizeSabbathSchoolConfig({ schedule }).schedule).toEqual({ scheduleMode: 'duration', durationMs, endTime: '10:15' })
  })

  it("preserva o modo 'video' e o vídeo personalizado", () => {
    const customVideo = { relativePath: 'modulos/escola-sabatina/video/video-1.mp4', name: 'Tema.mp4', durationMs: 90_500 }
    const result = normalizeSabbathSchoolConfig({ schedule: { scheduleMode: 'video', durationMs: 30 * MIN, endTime: '10:15' }, customVideo })
    expect(result.schedule.scheduleMode).toBe('video')
    expect(result.customVideo).toEqual(customVideo)
    expect(defaultSabbathSchoolConfig().customVideo).toBeNull()
  })

  it.each([
    null, 'x',
    { relativePath: 'outra/pasta/video.mp4', name: 'a', durationMs: 1000 },
    { relativePath: 'modulos/escola-sabatina/video/../x.mp4', name: 'a', durationMs: 1000 },
    { relativePath: 'modulos/escola-sabatina/video/v.mp4', name: 'a', durationMs: 0 },
    { relativePath: 'modulos/escola-sabatina/video/v.mp4', name: 7, durationMs: 1000 },
  ])('vídeo personalizado inválido %j é descartado', (customVideo) => {
    expect(normalizeSabbathSchoolConfig({ customVideo }).customVideo).toBeNull()
  })

  it('idioma desconhecido volta a automático', () => {
    expect(normalizeSabbathSchoolConfig({ audioLang: 'xx' }).audioLang).toBe('auto')
    expect(normalizeSabbathSchoolConfig({ audioLang: 'fr' }).audioLang).toBe('fr')
  })

  it('descarta marcos sem identidade, offset ou preset válido sem perder os válidos', () => {
    const result = normalizeSabbathSchoolConfig({ alertMarkers: [
      null, false, {}, { id: '', offsetMs: 0, preset: 'beep' },
      { id: 'missing', preset: 'beep' }, { id: 'infinite', offsetMs: Infinity, preset: 'beep' },
      { id: 'neg', offsetMs: -5, preset: 'beep' }, { id: 'empty', offsetMs: 0, preset: '' },
      { id: 'valid', offsetMs: 1000, preset: 'gong' },
    ] })
    expect(result.alertMarkers).toEqual([{ id: 'valid', offsetMs: 1000, preset: 'gong' }])
  })

  it('zero marcos é estado válido; ausente ou todo inválido volta aos padrões', () => {
    expect(normalizeSabbathSchoolConfig({ alertMarkers: [] }).alertMarkers).toEqual([])
    expect(normalizeSabbathSchoolConfig({ alertMarkers: 'broken' }).alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
    expect(normalizeSabbathSchoolConfig({ alertMarkers: [{ id: 'bad', offsetMs: -1, preset: 'beep' }] }).alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })

  it('offsets duplicados são mantidos (a tela bloqueia a colisão)', () => {
    const config = normalizeSabbathSchoolConfig({ alertMarkers: [
      { id: 'a', offsetMs: 60_000, preset: 'beep' },
      { id: 'b', offsetMs: 60_000, preset: 'gong' },
    ] })
    expect(config.alertMarkers).toHaveLength(2)
  })
})

describe('sabbathSchoolConfigFromLegacyCountdown', () => {
  it('config do Timer sem nada da Escola Sabatina não migra', () => {
    expect(sabbathSchoolConfigFromLegacyCountdown(null)).toBeNull()
    expect(sabbathSchoolConfigFromLegacyCountdown({ timeFormat: 'mm:ss', bgColor: '#000' })).toBeNull()
  })

  it('v2 leva agenda, idioma e marcos', () => {
    expect(sabbathSchoolConfigFromLegacyCountdown({
      mode: 'sabbath',
      configVersion: 2,
      sabbathConfig: { scheduleMode: 'start', startTime: '09:00', endTime: '10:15' },
      sabbathSchoolAudioLang: 'es',
      alertMarkers: [{ id: 'm7', offsetMs: 420_000, preset: 'custom:lib-1' }],
      customVideo: null,
    })).toEqual({
      schedule: { scheduleMode: 'duration', durationMs: 75 * MIN, endTime: '10:15' },
      audioLang: 'es',
      alertMarkers: [{ id: 'm7', offsetMs: 420_000, preset: 'custom:lib-1' }],
      customVideo: null,
    })
  })

  it('v1 converte alertTonePresets nos marcos padrão; inválidos mantêm o padrão', () => {
    expect(sabbathSchoolConfigFromLegacyCountdown({
      alertTonePresets: { start: 'custom', '5min': 'chime', '1min': 'unknown' },
    })?.alertMarkers).toEqual([
      { id: 'start', offsetMs: 0, preset: 'legacy-custom' },
      { id: '5min', offsetMs: 300_000, preset: 'chime' },
      { id: '1min', offsetMs: 60_000, preset: '1min_es' },
    ])
    expect(sabbathSchoolConfigFromLegacyCountdown({ alertTonePresets: 'broken' })?.alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })
})

describe('loadSabbathSchoolConfig', () => {
  beforeEach(() => values.clear())

  it('primeira abertura migra a Escola Sabatina que estava no Timer e grava na chave própria', () => {
    setUserData({ 'countdown.config': {
      timeFormat: 'mm:ss', mode: 'sabbath', configVersion: 2,
      sabbathConfig: { scheduleMode: 'endOnly', endTime: '11:00' },
      sabbathSchoolAudioLang: 'en',
      alertMarkers: [{ id: '1min', offsetMs: 60_000, preset: 'gong' }],
    } })
    const config = loadSabbathSchoolConfig()
    expect(config).toEqual({
      schedule: { scheduleMode: 'endOnly', durationMs: 45 * MIN, endTime: '11:00' },
      audioLang: 'en',
      alertMarkers: [{ id: '1min', offsetMs: 60_000, preset: 'gong' }],
      customVideo: null,
    })
    expect(userData()['sabbathSchool.config']).toEqual(JSON.parse(JSON.stringify(config)))
  })

  it('com a chave própria gravada, ignora o que sobrou no Timer', () => {
    setUserData({ 'countdown.config': { sabbathSchoolAudioLang: 'en', configVersion: 2 } })
    saveSabbathSchoolConfig({ ...defaultSabbathSchoolConfig(), audioLang: 'es' })
    expect(loadSabbathSchoolConfig().audioLang).toBe('es')
  })

  it('sem nada salvo usa os padrões sem gravar', () => {
    expect(loadSabbathSchoolConfig()).toEqual(defaultSabbathSchoolConfig())
    expect(userData()['sabbathSchool.config']).toBeUndefined()
  })

  it('som próprio da v1 vai para a biblioteca e o marco aponta para ele', () => {
    values.set(LEGACY_CUSTOM_TONES_KEY, JSON.stringify({ start: 'data:audio/mp3;base64,AAAA' }))
    setUserData({ 'countdown.config': { alertTonePresets: { start: 'custom', '5min': 'custom' } } })
    const config = loadSabbathSchoolConfig()
    const [tone] = listLibraryTones()
    expect(config.alertMarkers.find((m) => m.id === 'start')?.preset).toBe(`custom:${tone.id}`)
    expect(config.alertMarkers.find((m) => m.id === '5min')?.preset).toBe('beep')
    expect(values.has(LEGACY_CUSTOM_TONES_KEY)).toBe(false)
  })

  it("'legacy-custom' sem áudio no aparelho vira 'beep'", () => {
    saveSabbathSchoolConfig({ ...defaultSabbathSchoolConfig(), alertMarkers: [{ id: 'start', offsetMs: 0, preset: 'legacy-custom' }] })
    expect(loadSabbathSchoolConfig().alertMarkers).toEqual([{ id: 'start', offsetMs: 0, preset: 'beep' }])
    expect((userData()['sabbathSchool.config'] as { alertMarkers: unknown }).alertMarkers).toEqual([{ id: 'start', offsetMs: 0, preset: 'beep' }])
  })
})
