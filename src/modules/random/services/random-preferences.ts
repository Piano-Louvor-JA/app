import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

import {
  DEFAULT_RANDOM_DISPLAY_CONFIG,
  DEFAULT_RANDOM_SESSION,
  RANDOM_ANIMATION_SPEEDS,
  RANDOM_FONT_SIZE_MAX,
  RANDOM_FONT_SIZE_MIN,
  RANDOM_DRAWN_SIZE_MAX,
  RANDOM_DRAWN_SIZE_MIN,
  RANDOM_TEXT_TRANSFORMS,
  emptyModePool,
  type RandomAnimationSpeed,
  type RandomAudioSource,
  type RandomDisplayConfig,
  type RandomDrawMode,
  type RandomModePool,
  type RandomSessionState,
  type RandomTextTransform,
} from '../types/random'

export const RANDOM_CONFIG_CHANNEL = 'louvorja-random-config'

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asDrawnSize(value: unknown): number {
  const n = asNumber(value, DEFAULT_RANDOM_DISPLAY_CONFIG.drawnSizePc)
  return Math.min(RANDOM_DRAWN_SIZE_MAX, Math.max(RANDOM_DRAWN_SIZE_MIN, Math.round(n)))
}

function asFontSize(value: unknown): number {
  const n = asNumber(value, DEFAULT_RANDOM_DISPLAY_CONFIG.fontSizePc)
  return Math.min(RANDOM_FONT_SIZE_MAX, Math.max(RANDOM_FONT_SIZE_MIN, Math.round(n)))
}

function asAnimationSpeed(value: unknown): RandomAnimationSpeed {
  return RANDOM_ANIMATION_SPEEDS.includes(value as RandomAnimationSpeed)
    ? (value as RandomAnimationSpeed)
    : DEFAULT_RANDOM_DISPLAY_CONFIG.animationSpeed
}

function asTextTransform(value: unknown): RandomTextTransform {
  return RANDOM_TEXT_TRANSFORMS.includes(value as RandomTextTransform)
    ? (value as RandomTextTransform)
    : DEFAULT_RANDOM_DISPLAY_CONFIG.textTransform
}

function asMode(value: unknown): RandomDrawMode {
  return value === 'numbers' ? 'numbers' : 'names'
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function asModePool(raw: unknown): RandomModePool {
  if (!raw || typeof raw !== 'object') {
    return emptyModePool()
  }

  const source = raw as Record<string, unknown>
  return {
    available: asStringArray(source.available),
    drawn: asStringArray(source.drawn),
    currentDisplay:
      typeof source.currentDisplay === 'string' ? source.currentDisplay : '',
  }
}

function asAudioSource(value: unknown): RandomAudioSource {
  return value === 'custom' ? 'custom' : 'default'
}

function asCustomAudioFile(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return null
  }
  return name
}

function asCustomAudioFiles(value: unknown, legacySelected: string | null): string[] {
  const fromArray = Array.isArray(value)
    ? value
        .map((item) => asCustomAudioFile(item))
        .filter((item): item is string => Boolean(item))
    : []

  const merged = [...fromArray]
  if (legacySelected && !merged.includes(legacySelected)) {
    merged.unshift(legacySelected)
  }

  return [...new Set(merged)]
}

function asAudioVolume(value: unknown): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : DEFAULT_RANDOM_DISPLAY_CONFIG.audioVolume
  if (!Number.isFinite(n)) return DEFAULT_RANDOM_DISPLAY_CONFIG.audioVolume
  return Math.min(1, Math.max(0, n))
}

export function normalizeRandomDisplayConfig(raw: unknown): RandomDisplayConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_RANDOM_DISPLAY_CONFIG }
  }

  const source = raw as Record<string, unknown>
  const customAudioFile = asCustomAudioFile(source.customAudioFile)
  const customAudioFiles = asCustomAudioFiles(source.customAudioFiles, customAudioFile)
  const selectedCustom =
    customAudioFile && customAudioFiles.includes(customAudioFile)
      ? customAudioFile
      : (customAudioFiles[0] ?? null)

  return {
    bgColor: asString(
      source.bgColor ?? source.background,
      DEFAULT_RANDOM_DISPLAY_CONFIG.bgColor,
    ),
    textColor: asString(
      source.textColor ?? source.color,
      DEFAULT_RANDOM_DISPLAY_CONFIG.textColor,
    ),
    fontSizePc: asFontSize(source.fontSizePc),
    drawnSizePc: asDrawnSize(source.drawnSizePc),
    textTransform: asTextTransform(source.textTransform),
    animationSpeed: asAnimationSpeed(source.animationSpeed),
    audioSource: asAudioSource(source.audioSource),
    customAudioFiles,
    customAudioFile: selectedCustom,
    audioVolume: asAudioVolume(source.audioVolume),
    audioMuted: source.audioMuted === true,
  }
}

export function normalizeRandomSession(raw: unknown): RandomSessionState {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_RANDOM_SESSION,
      names: emptyModePool(),
      numbers: emptyModePool(),
    }
  }

  const source = raw as Record<string, unknown>
  const mode = asMode(source.mode)

  // Formato novo: buckets names/numbers
  if (source.names != null || source.numbers != null) {
    return {
      mode,
      names: asModePool(source.names),
      numbers: asModePool(source.numbers),
      numberMin: asNumber(source.numberMin, DEFAULT_RANDOM_SESSION.numberMin),
      numberMax: asNumber(source.numberMax, DEFAULT_RANDOM_SESSION.numberMax),
    }
  }

  // Formato legado: available/drawn no topo → migra para o modo ativo
  const legacyPool: RandomModePool = {
    available: asStringArray(source.available),
    drawn: asStringArray(source.drawn),
    currentDisplay: '',
  }

  return {
    mode,
    names: mode === 'names' ? legacyPool : emptyModePool(),
    numbers: mode === 'numbers' ? legacyPool : emptyModePool(),
    numberMin: asNumber(source.numberMin, DEFAULT_RANDOM_SESSION.numberMin),
    numberMax: asNumber(source.numberMax, DEFAULT_RANDOM_SESSION.numberMax),
  }
}

export function loadRandomDisplayConfig(): RandomDisplayConfig {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.randomConfig, null)
  return normalizeRandomDisplayConfig(stored)
}

export function saveRandomDisplayConfig(config: RandomDisplayConfig): void {
  setUserPreference(USER_PREFERENCE_KEYS.randomConfig, config)

  try {
    const channel = new BroadcastChannel(RANDOM_CONFIG_CHANNEL)
    channel.postMessage(config)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}

export function loadRandomSession(): RandomSessionState {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.randomSession, null)
  return normalizeRandomSession(stored)
}

export function saveRandomSession(session: RandomSessionState): void {
  setUserPreference(USER_PREFERENCE_KEYS.randomSession, {
    mode: session.mode,
    names: {
      available: [...session.names.available],
      drawn: [...session.names.drawn],
      currentDisplay: session.names.currentDisplay,
    },
    numbers: {
      available: [...session.numbers.available],
      drawn: [...session.numbers.drawn],
      currentDisplay: session.numbers.currentDisplay,
    },
    numberMin: session.numberMin,
    numberMax: session.numberMax,
  })
}
