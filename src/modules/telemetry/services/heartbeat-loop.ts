import { watch, type WatchStopHandle } from 'vue'

import { useHomeLocation } from '@modules/home/composables/useHomeLocation'

import { sendHeartbeat } from './heartbeat'

/**
 * Loop do sinal de "online" (SPEC telemetria-dispositivos §3.1):
 * - envia ao iniciar e a cada 5 min, inclusive com a janela minimizada
 *   (no culto o app projeta minimizado; o Chromium só agrupa o timer em 1 min);
 * - envia logo quando distrito/igreja mudam (com debounce enquanto digita);
 * - uma vez por janela principal (singleton); nunca em navegador automatizado.
 */

export const HEARTBEAT_INTERVAL_MS = 5 * 60_000
export const LOCATION_DEBOUNCE_MS = 3_000

let intervalId: ReturnType<typeof setInterval> | null = null
let debounceId: ReturnType<typeof setTimeout> | null = null
let stopWatch: WatchStopHandle | null = null

function safeSend(): void {
  void sendHeartbeat().catch(() => {})
}

export function isHeartbeatLoopRunning(): boolean {
  return intervalId !== null
}

export function startHeartbeatLoop(): void {
  if (intervalId !== null) return
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) return

  safeSend()
  intervalId = setInterval(safeSend, HEARTBEAT_INTERVAL_MS)

  const { profile } = useHomeLocation()
  stopWatch = watch(
    () => [profile.value.district, profile.value.church],
    () => {
      if (debounceId) clearTimeout(debounceId)
      debounceId = setTimeout(() => {
        debounceId = null
        safeSend()
      }, LOCATION_DEBOUNCE_MS)
    },
  )
}

/** Testes: para tudo e permite iniciar de novo. */
export function stopHeartbeatLoopForTests(): void {
  if (intervalId) clearInterval(intervalId)
  if (debounceId) clearTimeout(debounceId)
  stopWatch?.()
  intervalId = null
  debounceId = null
  stopWatch = null
}
