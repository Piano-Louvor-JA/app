import {
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_COUNTDOWN_RUNTIME,
  type CountdownRuntimeState,
  type CountdownStatus,
} from '../types/countdown'

export const COUNTDOWN_RUNTIME_CHANNEL = 'louvorja-countdown-runtime'
export const COUNTDOWN_RUNTIME_STORAGE_KEY = 'louvorja-countdown-runtime-state-v2'
/** sessionStorage: sobrevive a reload da janela e some quando o app é fechado. */
const COUNTDOWN_SESSION_KEY = 'louvorja-countdown-session'

function asStatus(value: unknown): CountdownStatus {
  if (value === 'running' || value === 'paused' || value === 'idle') return value
  return DEFAULT_COUNTDOWN_RUNTIME.status
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
}

function asHour(value: unknown, fallback: number): number {
  const n = asNumber(value, fallback)
  return Math.min(23, Math.max(0, Math.floor(n)))
}

function asMinute(value: unknown, fallback: number): number {
  const n = asNumber(value, fallback)
  return Math.min(59, Math.max(0, Math.floor(n)))
}

export function normalizeCountdownRuntime(raw: unknown): CountdownRuntimeState {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_COUNTDOWN_RUNTIME,
      savedTimesMs: [],
      durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
    }
  }

  const source = raw as Record<string, unknown>

  return {
    status: asStatus(source.status),
    segmentStartedAt: asNumberOrNull(source.segmentStartedAt),
    accumulatedMs: asNumber(source.accumulatedMs, 0),
    durationMs: Math.max(0, asNumber(source.durationMs, DEFAULT_COUNTDOWN_DURATION_MS)),
    savedTimesMs: asNumberArray(source.savedTimesMs),
    finished: source.finished === true,
    mode: source.mode === 'until' ? 'until' : 'duration',
    untilHour: asHour(source.untilHour, 18),
    untilMinute: asMinute(source.untilMinute, 0),
    pausedRemainingMs: asNumberOrNull(source.pausedRemainingMs),
    // app desktop: CountdownProjectionView consome a flag de janela viva.
    // Ausente = true (sem info assume viva); inválido = false (o seguro).
    ...(source.projecting === undefined
      ? {}
      : { projecting: source.projecting === true }),
  }
}

export function readCountdownRuntimeFromStorage(): CountdownRuntimeState {
  try {
    const raw = localStorage.getItem(COUNTDOWN_RUNTIME_STORAGE_KEY)
    if (!raw) {
      return {
        ...DEFAULT_COUNTDOWN_RUNTIME,
        savedTimesMs: [],
        durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
      }
    }
    return normalizeCountdownRuntime(JSON.parse(raw) as unknown)
  } catch {
    return {
      ...DEFAULT_COUNTDOWN_RUNTIME,
      savedTimesMs: [],
      durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
    }
  }
}

/** true só na primeira chamada desde que o app (ou a aba, no web) foi aberto. */
export function beginCountdownSession(): boolean {
  try {
    if (sessionStorage.getItem(COUNTDOWN_SESSION_KEY)) return false
    sessionStorage.setItem(COUNTDOWN_SESSION_KEY, '1')
    return true
  } catch {
    return false
  }
}

/** Para e zera a contagem; duração, modo e marcas salvas continuam. */
export function stopCountdownRuntime(state: CountdownRuntimeState): CountdownRuntimeState {
  return {
    ...state,
    status: 'idle',
    segmentStartedAt: null,
    accumulatedMs: 0,
    finished: false,
    pausedRemainingMs: null,
  }
}

export function writeCountdownRuntimeToStorage(state: CountdownRuntimeState): void {
  try {
    localStorage.setItem(COUNTDOWN_RUNTIME_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage pode falhar em contextos restritos
  }
}

export function publishCountdownRuntime(state: CountdownRuntimeState): void {
  writeCountdownRuntimeToStorage(state)

  try {
    const channel = new BroadcastChannel(COUNTDOWN_RUNTIME_CHANNEL)
    channel.postMessage(state)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}
