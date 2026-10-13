import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'

import {
  formatClock,
  formatCountdown,
  formatDateBr,
} from '../services/liturgy-format'

function timestampFromHHmm(
  value: string | null,
  referenceMs: number,
): number | null {
  if (!value) return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours > 23 ||
    minutes > 59
  ) {
    return null
  }
  const date = new Date(referenceMs)
  date.setHours(hours, minutes, 0, 0)
  return date.getTime()
}

/** Atualiza `now` a cada segundo; retorna o id do interval. */
export function startLiturgyClockTick(now: Ref<Date>): ReturnType<typeof setInterval> {
  return setInterval(() => {
    now.value = new Date()
  }, 1000)
}

/** Limpa o interval se houver (null-safe pro caminho sem mount). */
export function stopLiturgyClockTick(timer: ReturnType<typeof setInterval> | null): void {
  if (timer !== null) {
    clearInterval(timer)
  }
}

/** Relógio ao vivo e contador regressivo (após play). */
export function useLiturgyClock(
  startTime: () => string | null,
  endTime: () => string | null,
  countdownRunning: () => boolean,
  countdownStartedAt: () => number | null,
) {
  const now = ref(new Date())
  // setTimeout/setInterval ids no Node tipam como Timeout; jsdom devolve number.
  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    timer = startLiturgyClockTick(now)
  })

  onUnmounted(() => {
    stopLiturgyClockTick(timer)
    timer = null
  })

  function headerDateTime(): string {
    return `${formatDateBr(now.value)} • ${formatClock(now.value)}`
  }

  /**
   * Diferença (Hora Final − instante do play), reduzindo a cada segundo.
   * Ex.: click 19:45 + final 20:45 → 60:00 → 59:59 → 59:58…
   */
  const remainingCountdownLabel = computed(() => {
    if (!countdownRunning()) return '—'
    const startedAt = countdownStartedAt()
    if (startedAt == null) return '—'
    const endsAt = timestampFromHHmm(endTime(), startedAt)
    if (endsAt == null) return '—'
    return formatCountdown(endsAt - now.value.getTime())
  })

  const startTimeInput = computed(() => startTime() ?? '')
  const endTimeInput = computed(() => endTime() ?? '')

  const countdownExpired = computed(() => {
    if (!countdownRunning()) return false
    const startedAt = countdownStartedAt()
    if (startedAt == null) return false
    const endsAt = timestampFromHHmm(endTime(), startedAt)
    if (endsAt == null) return false
    return now.value.getTime() >= endsAt
  })

  return {
    now,
    headerDateTime,
    remainingCountdownLabel,
    startTimeInput,
    endTimeInput,
    countdownExpired,
  }
}
