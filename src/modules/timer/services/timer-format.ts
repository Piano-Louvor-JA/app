import type { TimerTimeFormat } from '../types/timer'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatElapsedMs(
  elapsedMs: number,
  timeFormat: TimerTimeFormat,
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

  return timeFormat.replace(/hh|mm|ss|ms/g, (match) => tokens[match])
}

export function computeElapsedMs(
  accumulatedMs: number,
  segmentStartedAt: number | null,
  status: 'idle' | 'running' | 'paused',
  nowMs: number,
): number {
  if (status !== 'running' || segmentStartedAt == null) {
    return Math.max(0, accumulatedMs)
  }
  return Math.max(0, accumulatedMs + (nowMs - segmentStartedAt))
}
