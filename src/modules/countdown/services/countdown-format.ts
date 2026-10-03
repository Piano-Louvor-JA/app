import type {
  CountdownDurationParts,
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
  const safe = Math.max(0, Math.floor(elapsedMs))
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
  return effectiveFormat.replace(/hh|mm|ss|ms/g, (match) => tokens[match] ?? match)
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
  return Math.max(0, durationMs - elapsed)
}

export function computeRemainingRawMs(
  durationMs: number,
  accumulatedMs: number,
  segmentStartedAt: number | null,
  status: CountdownStatus,
  nowMs: number,
): number {
  const elapsed = computeElapsedMs(accumulatedMs, segmentStartedAt, status, nowMs)
  return durationMs - elapsed
}

export function formatCountdownWithSign(
  remainingMs: number,
  timeFormat: CountdownTimeFormat,
): string {
  const negative = remainingMs < 0
  const body = formatElapsedMs(Math.abs(remainingMs), timeFormat)
  return negative ? `-${body}` : body
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

export function clampDurationPart(value: unknown, max?: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  const floored = Math.floor(n)
  if (max != null) return Math.min(max, floored)
  return floored
}
