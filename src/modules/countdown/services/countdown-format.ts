import type {
  CountdownDurationParts,
  CountdownRuntimeState,
  CountdownStatus,
  CountdownTimeFormat,
} from '../types/countdown'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function resolveDisplayFormat(
  hours: number,
  timeFormat: CountdownTimeFormat,
): CountdownTimeFormat {
  // Se há horas restantes e o formato omitiu `hh`, força inclusão (ex.: 1:14:40).
  if (hours > 0 && !timeFormat.includes('hh')) {
    return timeFormat.includes('ms') ? 'hh:mm:ss.ms' : 'hh:mm:ss'
  }
  return timeFormat
}

export function formatElapsedMs(
  elapsedMs: number,
  timeFormat: CountdownTimeFormat,
): string {
  const negative = elapsedMs < 0
  const safe = Math.floor(Math.abs(elapsedMs))
  const hours = Math.floor(safe / 3_600_000)
  const minutes = Math.floor((safe % 3_600_000) / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1000)
  const centiseconds = Math.floor((safe % 1000) / 10)

  const tokens: Record<string, string> = {
    hh: pad2(hours),
    mm: pad2(minutes),
    ss: pad2(seconds),
    ms: pad2(centiseconds),
  }

  const effectiveFormat = resolveDisplayFormat(hours, timeFormat)
  const formatted = effectiveFormat.replace(
    /hh|mm|ss|ms/g,
    (match) => tokens[match],
  )
  return negative ? `-${formatted}` : formatted
}

export function computeElapsedMs(
  accumulatedMs: number,
  segmentStartedAt: number | null,
  status: CountdownStatus,
  nowMs: number,
): number {
  if (status !== 'running' || segmentStartedAt == null) {
    return Math.max(0, accumulatedMs)
  }
  return Math.max(0, accumulatedMs + (nowMs - segmentStartedAt))
}

export function computeRemainingMs(
  durationMs: number,
  accumulatedMs: number,
  segmentStartedAt: number | null,
  status: CountdownStatus,
  nowMs: number,
): number {
  const elapsed = computeElapsedMs(accumulatedMs, segmentStartedAt, status, nowMs)
  // Permite negativo após zerar (tempo ultrapassado / overtime).
  return durationMs - elapsed
}

export function durationPartsFromMs(ms: number): CountdownDurationParts {
  const safe = Math.max(0, Math.floor(ms))
  return {
    hours: Math.floor(safe / 3_600_000),
    minutes: Math.floor((safe % 3_600_000) / 60_000),
    seconds: Math.floor((safe % 60_000) / 1000),
  }
}

export function durationMsFromParts(parts: CountdownDurationParts): number {
  const hours = Math.max(0, Math.floor(parts.hours) || 0)
  const minutes = Math.min(59, Math.max(0, Math.floor(parts.minutes) || 0))
  const seconds = Math.min(59, Math.max(0, Math.floor(parts.seconds) || 0))
  return hours * 3_600_000 + minutes * 60_000 + seconds * 1000
}

/** Remaining até HH:MM de hoje (negativo se o horário já passou). */
export function wallClockUntilRemainingMs(
  untilHour: number,
  untilMinute: number,
  nowMs: number,
): number {
  const hour = Math.min(23, Math.max(0, Math.floor(untilHour) || 0))
  const minute = Math.min(59, Math.max(0, Math.floor(untilMinute) || 0))
  const target = new Date(nowMs)
  target.setHours(hour, minute, 0, 0)
  return target.getTime() - nowMs
}

export function computeCountdownRemainingMs(
  runtime: Pick<
    CountdownRuntimeState,
    | 'mode'
    | 'untilHour'
    | 'untilMinute'
    | 'pausedRemainingMs'
    | 'durationMs'
    | 'accumulatedMs'
    | 'segmentStartedAt'
    | 'status'
  >,
  nowMs: number,
): number {
  if (runtime.mode === 'until') {
    if (runtime.status === 'paused' && runtime.pausedRemainingMs != null) {
      return runtime.pausedRemainingMs
    }
    return wallClockUntilRemainingMs(
      runtime.untilHour ?? 18,
      runtime.untilMinute ?? 0,
      nowMs,
    )
  }
  return computeRemainingMs(
    runtime.durationMs,
    runtime.accumulatedMs,
    runtime.segmentStartedAt,
    runtime.status,
    nowMs,
  )
}

export function clampDurationPart(value: unknown, max?: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  const floored = Math.floor(n)
  if (max != null) return Math.min(max, floored)
  return floored
}
