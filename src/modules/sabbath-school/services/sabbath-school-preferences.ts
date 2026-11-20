import { isCountdownVideoPath } from '@modules/countdown/types/countdown'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import { LEGACY_CUSTOM_TONES_KEY, loadCustomTones, type SabbathAudioLangSetting } from './alert-tone'
import { migrateLegacyCustomTones } from './alert-tone-library'
import { timeToMs } from './sabbath-schedule'
import {
  DEFAULT_ALERT_MARKERS,
  DEFAULT_SABBATH_SCHEDULE,
  type AlertMarker,
  type AlertMarkerPreset,
  type SabbathCustomVideo,
  type SabbathSchoolConfig,
  type SabbathScheduleConfig,
} from '../types/sabbath-school'

const HHMM = /^\d{2}:\d{2}$/
const LEGACY_PRESETS: readonly string[] = ['none', 'beep', 'chime', 'gong', 'abertura_es', '5min_es', '1min_es', 'custom']

function defaultsMarkers(): AlertMarker[] {
  return DEFAULT_ALERT_MARKERS.map((m) => ({ ...m }))
}

function asHhmm(value: unknown): string | null {
  return typeof value === 'string' && HHMM.test(value) ? value : null
}

function asPositiveMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

/** "Início e término" (removido) vira a duração entre os dois horários. */
function durationFromLegacyStart(source: Record<string, unknown>): number | null {
  const start = asHhmm(source.startTime)
  const end = asHhmm(source.endTime)
  if (source.scheduleMode !== 'start' || !start || !end) return null
  return asPositiveMs(timeToMs(end) - timeToMs(start))
}

function asScheduleMode(value: unknown): SabbathScheduleConfig['scheduleMode'] {
  return value === 'endOnly' || value === 'video' ? value : 'duration'
}

function asSchedule(value: unknown): SabbathScheduleConfig | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  return {
    scheduleMode: asScheduleMode(source.scheduleMode),
    durationMs: asPositiveMs(source.durationMs) ?? durationFromLegacyStart(source) ?? DEFAULT_SABBATH_SCHEDULE.durationMs,
    endTime: asHhmm(source.endTime) ?? DEFAULT_SABBATH_SCHEDULE.endTime,
  }
}

function asCustomVideo(value: unknown): SabbathCustomVideo | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const durationMs = asPositiveMs(source.durationMs)
  if (!isCountdownVideoPath(source.relativePath) || typeof source.name !== 'string' || durationMs == null) return null
  return { relativePath: source.relativePath, name: source.name, durationMs }
}

function asAudioLang(value: unknown): SabbathAudioLangSetting {
  return value === 'pt-BR' || value === 'es' || value === 'en' || value === 'fr' ? value : 'auto'
}

/** Entradas válidas: id string, offset >= 0 finito, preset string. */
function asAlertMarkerEntries(value: unknown[]): AlertMarker[] {
  const out: AlertMarker[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const m = entry as Record<string, unknown>
    if (typeof m.id !== 'string' || m.id.length === 0) continue
    if (typeof m.offsetMs !== 'number' || !Number.isFinite(m.offsetMs) || m.offsetMs < 0) continue
    if (typeof m.preset !== 'string' || m.preset.length === 0) continue
    out.push({ id: m.id, offsetMs: m.offsetMs, preset: m.preset as AlertMarkerPreset })
  }
  return out
}

/** `[]` explícito é estado válido (zero alertas); ausente ou 100% inválido volta aos padrões. */
function asAlertMarkers(value: unknown): AlertMarker[] {
  if (!Array.isArray(value)) return defaultsMarkers()
  if (value.length === 0) return []
  const valid = asAlertMarkerEntries(value)
  return valid.length > 0 ? valid : defaultsMarkers()
}

/** v1 do Timer: `alertTonePresets` por marco padrão; 'custom' vira 'legacy-custom'. */
function markersFromLegacyPresets(value: unknown): AlertMarker[] {
  const legacy = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return DEFAULT_ALERT_MARKERS.map((marker) => {
    const entry = legacy[marker.id]
    if (typeof entry !== 'string' || !LEGACY_PRESETS.includes(entry)) return { ...marker }
    return { ...marker, preset: entry === 'custom' ? 'legacy-custom' : (entry as AlertMarkerPreset) }
  })
}

export function normalizeSabbathSchoolConfig(raw: unknown): SabbathSchoolConfig {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    schedule: asSchedule(source.schedule) ?? { ...DEFAULT_SABBATH_SCHEDULE },
    audioLang: asAudioLang(source.audioLang),
    alertMarkers: asAlertMarkers(source.alertMarkers),
    customVideo: asCustomVideo(source.customVideo),
  }
}

/** Extrai a Escola Sabatina da config antiga do Timer (quando o modo vivia lá). */
export function sabbathSchoolConfigFromLegacyCountdown(raw: unknown): SabbathSchoolConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const hasLegacy = ['sabbathConfig', 'sabbathSchoolAudioLang', 'alertMarkers', 'alertTonePresets', 'configVersion']
    .some((key) => key in source)
  if (!hasLegacy) return null
  return {
    schedule: asSchedule(source.sabbathConfig) ?? { ...DEFAULT_SABBATH_SCHEDULE },
    audioLang: asAudioLang(source.sabbathSchoolAudioLang),
    alertMarkers: source.configVersion === 2
      ? asAlertMarkers(source.alertMarkers)
      : markersFromLegacyPresets(source.alertTonePresets),
    customVideo: null,
  }
}

/**
 * 'legacy-custom' aponta para os sons próprios da v1: importa para a
 * biblioteca e troca pelo 'custom:{id}' real. Sem áudio no device, vira 'beep'.
 */
function resolveLegacyCustomTones(config: SabbathSchoolConfig): { config: SabbathSchoolConfig; changed: boolean } {
  const legacyTones = loadCustomTones()
  const hasLegacyTones = Object.keys(legacyTones).length > 0
  const hasLegacyPreset = config.alertMarkers.some((m) => m.preset === 'legacy-custom')
  if (!hasLegacyPreset && !hasLegacyTones) return { config, changed: false }

  const ids: Partial<Record<string, string>> = hasLegacyPreset && hasLegacyTones ? migrateLegacyCustomTones(legacyTones) : {}
  const alertMarkers = config.alertMarkers.map((m): AlertMarker => {
    if (m.preset !== 'legacy-custom') return m
    const toneId = ids[m.id]
    return { ...m, preset: toneId ? `custom:${toneId}` : 'beep' }
  })
  if (hasLegacyTones) {
    try {
      localStorage.removeItem(LEGACY_CUSTOM_TONES_KEY)
    } catch {
      // storage indisponível: a chave fica e a migração repete sem efeito
    }
  }
  return { config: { ...config, alertMarkers }, changed: true }
}

export function saveSabbathSchoolConfig(config: SabbathSchoolConfig): void {
  setUserPreference(USER_PREFERENCE_KEYS.sabbathSchoolConfig, config)
}

/**
 * Carrega a config; na primeira vez, migra o que estava no Timer. O Timer
 * descarta esses campos ao normalizar a própria config, voltando ao padrão.
 */
export function loadSabbathSchoolConfig(): SabbathSchoolConfig {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.sabbathSchoolConfig, null)
  const legacy = stored == null
    ? sabbathSchoolConfigFromLegacyCountdown(getUserPreference<unknown>(USER_PREFERENCE_KEYS.countdownConfig, null))
    : null
  const base = legacy ?? normalizeSabbathSchoolConfig(stored)
  const { config, changed } = resolveLegacyCustomTones(base)
  if (legacy || changed) saveSabbathSchoolConfig(config)
  return config
}
