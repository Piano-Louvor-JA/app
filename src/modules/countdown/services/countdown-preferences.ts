import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

import {
  COUNTDOWN_TIME_FORMATS,
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  type CountdownDisplayConfig,
  type CountdownTimeFormat,
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

/** Só a aparência do Timer; campos da Escola Sabatina de versões antigas são descartados. */
export function normalizeCountdownDisplayConfig(raw: unknown): CountdownDisplayConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG }

  const source = raw as Record<string, unknown>
  return {
    timeFormat: asTimeFormat(source.timeFormat),
    bgColor: asString(source.bgColor, DEFAULT_COUNTDOWN_DISPLAY_CONFIG.bgColor),
    textColor: asString(source.textColor, DEFAULT_COUNTDOWN_DISPLAY_CONFIG.textColor),
    allowNegative: typeof source.allowNegative === 'boolean' ? source.allowNegative : DEFAULT_COUNTDOWN_DISPLAY_CONFIG.allowNegative,
  }
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
