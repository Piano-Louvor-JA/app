import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  type MaybeRefOrGetter,
} from 'vue'

import {
  computeCountdownRemainingMs,
  durationPartsFromMs,
  formatElapsedMs,
} from '../services/countdown-format'
import type {
  CountdownDisplayConfig,
  CountdownRuntimeState,
} from '../types/countdown'
import { useCountdownStore } from '../stores/useCountdownStore'

export function useCountdownTick(active: MaybeRefOrGetter<boolean>) {
  const now = ref(Date.now())
  let frameId = 0

  function tick() {
    if (toValue(active)) {
      now.value = Date.now()
    }
    frameId = requestAnimationFrame(tick)
  }

  onMounted(() => {
    frameId = requestAnimationFrame(tick)
  })

  onUnmounted(() => {
    cancelAnimationFrame(frameId)
  })

  return { now }
}

export function useCountdownDisplay(
  configSource?: MaybeRefOrGetter<CountdownDisplayConfig>,
  runtimeSource?: MaybeRefOrGetter<CountdownRuntimeState>,
) {
  const store = useCountdownStore()
  const config = computed(() => toValue(configSource) ?? store.config)
  const runtime = computed(() => toValue(runtimeSource) ?? store.runtime)
  const { now } = useCountdownTick(
    () => runtime.value.status === 'running' || runtime.value.mode === 'until',
  )

  const remainingMs = computed(() =>
    computeCountdownRemainingMs(runtime.value, now.value),
  )

  const formattedTime = computed(() =>
    formatElapsedMs(remainingMs.value, config.value.timeFormat),
  )

  const isUrgent = computed(
    () =>
      remainingMs.value > 0 &&
      remainingMs.value <= 60_000 &&
      (runtime.value.mode === 'until' ||
        runtime.value.status === 'running' ||
        runtime.value.status === 'paused'),
  )

  /** Zerou ou passou do tempo (overtime negativo). */
  const isFinished = computed(() => {
    if (runtime.value.mode === 'until') {
      return remainingMs.value <= 0
    }
    if (runtime.value.durationMs <= 0) return false
    if (runtime.value.finished) return true
    return (
      remainingMs.value <= 0 &&
      (runtime.value.status === 'running' ||
        runtime.value.status === 'paused' ||
        runtime.value.accumulatedMs > 0)
    )
  })

  return {
    now,
    config,
    runtime,
    remainingMs,
    formattedTime,
    isUrgent,
    isFinished,
  }
}

export function useCountdownFeature() {
  const store = useCountdownStore()

  store.hydrate()

  const durationParts = computed(() => durationPartsFromMs(store.runtime.durationMs))

  return {
    config: computed(() => store.config),
    runtime: computed(() => store.runtime),
    durationParts,
    isProjecting: computed(() => store.isProjecting),
    configOpen: computed(() => store.configOpen),
    isRunning: computed(() => store.isRunning),
    isPaused: computed(() => store.isPaused),
    canStart: computed(() => store.canStart),
    isUntilMode: computed(() => store.isUntilMode),
    setTimeFormat: store.setTimeFormat,
    setBgColor: store.setBgColor,
    setTextColor: store.setTextColor,
    resetDisplayToDefault: store.resetDisplayToDefault,
    openConfig: store.openConfig,
    closeConfig: store.closeConfig,
    setDurationMs: store.setDurationMs,
    setCountdownMode: store.setCountdownMode,
    setUntilTime: store.setUntilTime,
    start: store.start,
    pause: store.pause,
    reset: store.reset,
    saveMark: store.saveMark,
    removeSavedMark: store.removeSavedMark,
    clearSavedMarks: store.clearSavedMarks,
    toggleProjection: store.toggleProjection,
    syncProjection: store.syncProjection,
    clearProjection: store.clearProjection,
  }
}
