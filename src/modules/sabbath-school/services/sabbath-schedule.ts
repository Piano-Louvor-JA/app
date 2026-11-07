import type { SabbathScheduleConfig } from '../types/sabbath-school'

const HHMM = /^\d{2}:\d{2}$/
const DAY_MS = 24 * 3600 * 1000

/** HH:MM → ms desde a meia-noite; formato inválido vira 0. */
export function timeToMs(val: string): number {
  if (!HHMM.test(val)) return 0
  const [h, m] = val.split(':').map(Number)
  return (h * 3600 + m * 60) * 1000
}

/** ms → HH:MM (ignora segundos). */
export function msToTime(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600) % 24
  const m = Math.floor((totalSec % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nowOfDayMs(now: Date): number {
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
}

function untilEndMs(endMs: number, nowMs: number): number {
  // término em outro dia (já passou da meia-noite)? trata como amanhã
  return endMs > nowMs ? endMs - nowMs : endMs - nowMs + DAY_MS
}

/**
 * Duração da contagem iniciada agora: 'duration' → a duração escolhida;
 * 'endOnly' → Término − agora. Término inválido → null. No modo 'video' a
 * duração é a do vídeo, que a agenda não conhece → null.
 */
export function sabbathDurationMs(schedule: SabbathScheduleConfig, now: Date = new Date()): number | null {
  if (schedule.scheduleMode === 'video') return null
  if (schedule.scheduleMode === 'duration') return Math.max(0, Math.floor(schedule.durationMs))
  if (!HHMM.test(schedule.endTime)) return null
  return untilEndMs(timeToMs(schedule.endTime), nowOfDayMs(now))
}
