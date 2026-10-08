import type { AlertMark } from '../services/timer-alert-engine'
import { createAlertEngine } from '../services/timer-alert-engine'
import { playAlertTone, type AlertPresetKey } from '../services/alert-tone'

export interface UseCountdownAlertsOptions {
  marks: AlertMark[]
  audioContext?: AudioContext
  preset?: AlertPresetKey
  customAudio?: HTMLAudioElement
}

/**
 * Liga o alert engine ao countdown runtime: a cada tick, dispara marcos
 * e toca o som correspondente. Reset reinsere engine limpo.
 */
export function useCountdownAlerts(options: UseCountdownAlertsOptions) {
  const { marks, audioContext, preset = 'beep', customAudio } = options
  const engine = createAlertEngine(marks)

  function tick(elapsedMs: number) {
    const fired = engine.tick(elapsedMs)
    if (fired.length === 0) return

    // só toca se tiver audioContext OU customAudio
    if (!audioContext && !customAudio) return

    for (const _mark of fired) {
      playAlertTone(preset, audioContext, customAudio)
    }
  }

  function reset() {
    engine.reset()
  }

  return { tick, reset }
}