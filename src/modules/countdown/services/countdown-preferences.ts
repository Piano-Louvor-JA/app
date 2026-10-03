import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

import {
  COUNTDOWN_TIME_FORMATS,
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  DEFAULT_ALERT_MARKERS,
  type AlertMarker,
  type AlertMarkerPreset,
  type CountdownDisplayConfig,
  type CountdownTimeFormat,
  type SabbathModeConfig,
} from '../types/countdown'

export const COUNTDOWN_CONFIG_CHANNEL = 'louvorja-countdown-config'

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function asTimeFormat(value: unknown): CountdownTimeFormat {
  return COUNTDOWN_TIME_FORMATS.includes(value as CountdownTimeFormat)
    ? (value as CountdownTimeFormat)
    : DEFAULT_COUNTDOWN_DISPLAY_CONFIG.timeFormat
}

export function normalizeCountdownDisplayConfig(raw: unknown): CountdownDisplayConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, configVersion: 2, alertMarkers: DEFAULT_ALERT_MARKERS.map((m) => ({ ...m })) }
  }

  const source = raw as Record<string, unknown>
  const normalized: CountdownDisplayConfig = {
    timeFormat: asTimeFormat(source.timeFormat),
    bgColor: asString(source.bgColor, DEFAULT_COUNTDOWN_DISPLAY_CONFIG.bgColor),
    textColor: asString(source.textColor, DEFAULT_COUNTDOWN_DISPLAY_CONFIG.textColor),
    allowNegative: source.allowNegative === true,
    mode: source.mode === 'sabbath' ? 'sabbath' : 'standard',
    sabbathConfig: asSabbathConfig(source.sabbathConfig),
    alertTonePresets: asAlertTonePresets(source.alertTonePresets),
  }

  // ── Migração v1 → v2 (idempotente) ──────────────────────────────────────
  // v2 presente: array [] é estado VÁLIDO (zero alertas) — só objeto ausente
  // ou 100% inválido cai pros defaults.
  if (source.configVersion === 2) {
    normalized.configVersion = 2
    const markers = source.alertMarkers
    if (Array.isArray(markers)) {
      const valid = asAlertMarkers(markers)
      if (valid != null) {
        // ≥1 entrada válida: usa (inválidas individuais descartadas)
        normalized.alertMarkers = valid
      } else if (markers.length === 0) {
        // [] explícito: zero alertas é estado válido — NÃO ressuscita defaults
        normalized.alertMarkers = []
      } else {
        normalized.alertMarkers = defaultsMarkers()
      }
    } else {
      normalized.alertMarkers = defaultsMarkers()
    }
    return normalized
  }
  // v1 (sem configVersion): converte alertTonePresets nos offsets padrão.
  normalized.configVersion = 2
  const legacy = normalized.alertTonePresets ?? {}
  normalized.alertMarkers = DEFAULT_ALERT_MARKERS.map((marker): AlertMarker => {
    const legacyPreset: string | undefined = legacy[marker.id as 'start' | '5min' | '1min']
    return {
      ...marker,
      preset:
        legacyPreset === 'custom'
          ? ('legacy-custom' as const)
          : (legacyPreset as AlertMarkerPreset | undefined) ?? marker.preset,
    }
  })
  return normalized
}

function defaultsMarkers(): AlertMarker[] {
  return DEFAULT_ALERT_MARKERS.map((m) => ({ ...m }))
}

/** Valida entradas de alertMarkers: id string, offset >= 0 finito, preset string. */
function asAlertMarkers(value: unknown): AlertMarker[] | null {
  if (!Array.isArray(value)) return null
  const out: AlertMarker[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const m = entry as Record<string, unknown>
    if (typeof m.id !== 'string' || m.id.length === 0) continue
    if (typeof m.offsetMs !== 'number' || !Number.isFinite(m.offsetMs) || m.offsetMs < 0) continue
    if (typeof m.preset !== 'string' || m.preset.length === 0) continue
    out.push({ id: m.id, offsetMs: m.offsetMs, preset: m.preset as AlertMarkerPreset })
  }
  return out.length > 0 ? out : null
}

function asSabbathConfig(value: unknown): SabbathModeConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const scheduleMode = source.scheduleMode === 'start' ? 'start' : 'endOnly'
  const endTime = asString(source.endTime, '')
  if (!/^\d{2}:\d{2}$/.test(endTime)) return undefined
  const startTime =
    typeof source.startTime === 'string' && /^\d{2}:\d{2}$/.test(source.startTime)
      ? source.startTime
      : undefined
  return { scheduleMode, endTime, startTime }
}

function asAlertTonePresets(
  value: unknown,
): CountdownDisplayConfig['alertTonePresets'] {
  if (!value || typeof value !== 'object') return undefined
  const allowed: readonly string[] = [
    'none',
    'beep',
    'chime',
    'gong',
    'abertura_es',
    '5min_es',
    '1min_es',
    'custom', // legado v1: vira 'legacy-custom' na migração pra markers
  ]
  const out: Partial<Record<'start' | '5min' | '1min', string>> = {}
  for (const key of ['start', '5min', '1min'] as const) {
    const entry = (value as Record<string, unknown>)[key]
    if (typeof entry === 'string' && allowed.includes(entry)) out[key] = entry
  }
  return Object.keys(out).length > 0
    ? (out as CountdownDisplayConfig['alertTonePresets'])
    : undefined
}

export function loadCountdownDisplayConfig(): CountdownDisplayConfig {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.countdownConfig, null)
  return normalizeCountdownDisplayConfig(stored)
}

export function saveCountdownDisplayConfig(config: CountdownDisplayConfig): void {
  setUserPreference(USER_PREFERENCE_KEYS.countdownConfig, config)

  try {
    const channel = new BroadcastChannel(COUNTDOWN_CONFIG_CHANNEL)
    channel.postMessage(config)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}
