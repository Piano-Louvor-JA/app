import type { CountdownDisplayConfig, CountdownRuntimeState } from '../types/countdown'

const HHMM = /^\d{2}:\d{2}$/
const DAY_MS = 24 * 3600 * 1000

/** HH:MM → ms desde a meia-noite; formato inválido vira 0. */
export function timeToMs(val: string): number {
  if (!HHMM.test(val)) return 0
  const [h, m] = val.split(':').map(Number)
  return (h * 3600 + m * 60) * 1000
}

/**
 * web#175: no modo ES com cronômetro idle, o preview mostra a duração
 * DERIVADA do agendamento — não o 00:05:00 do cronômetro normal.
 * scheduleMode 'start' → Término − Início; 'endOnly' → Término − agora.
 * Fora desse caso retorna null (o preview usa o runtime real).
 */
export function sabbathIdlePreviewRuntime(
  config: CountdownDisplayConfig,
  runtime: CountdownRuntimeState,
  now: Date = new Date(),
): CountdownRuntimeState | null {
  if (config.mode !== 'sabbath') return null
  if (runtime.status !== 'idle') return null
  const sc = config.sabbathConfig
  if (!sc || !HHMM.test(sc.endTime)) return null
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const endMs = timeToMs(sc.endTime)
  const endVsNow = endMs > nowMs ? endMs - nowMs : endMs - nowMs + DAY_MS
  const startTime = sc.scheduleMode === 'start' ? (sc.startTime ?? '') : ''
  const durationMs = HHMM.test(startTime)
    ? Math.max(0, endMs - timeToMs(startTime))
    : endVsNow
  return {
    ...runtime,
    durationMs,
    accumulatedMs: 0,
    segmentStartedAt: null,
    status: 'idle',
    finished: false,
  }
}
