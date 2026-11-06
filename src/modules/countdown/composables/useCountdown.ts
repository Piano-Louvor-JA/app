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
  computeRemainingMs,
  computeRemainingRawMs,
  durationPartsFromMs,
  formatCountdownWithSign,
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
  const { now } = useCountdownTick(() => runtime.value.status === 'running' || runtime.value.mode === 'until')

  const remainingRawMs = computed(() => computeCountdownRemainingMs(runtime.value, now.value))
  const remainingMs = computed(() => Math.max(0, remainingRawMs.value))

  const formattedTime = computed(() =>
    formatElapsedMs(remainingMs.value, config.value.timeFormat),
  )

  const formattedTimeWithSign = computed(() =>
    formatCountdownWithSign(remainingRawMs.value, config.value.timeFormat),
  )

  const isNegative = computed(() => remainingRawMs.value < 0)

  const isUrgent = computed(
    () =>
      remainingMs.value > 0 &&
      remainingMs.value <= 60_000 &&
      (runtime.value.status === 'running' || runtime.value.status === 'paused'),
  )

  const isFinished = computed(() => {
    if (runtime.value.mode === 'until') return remainingRawMs.value <= 0
    if (runtime.value.durationMs <= 0) return false
    return runtime.value.finished || (remainingRawMs.value <= 0 &&
      (runtime.value.status === 'running' || runtime.value.status === 'paused' || runtime.value.accumulatedMs > 0))
  })

  return {
    now,
    config,
    runtime,
    remainingMs,
    formattedTime,
    formattedTimeWithSign,
    isUrgent,
    isFinished,
    isNegative,
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
    displayConfigOpen: computed(() => store.displayConfigOpen),
    isRunning: computed(() => store.isRunning),
    isPaused: computed(() => store.isPaused),
    canStart: computed(() => store.canStart),
    setTimeFormat: store.setTimeFormat,
    setBgColor: store.setBgColor,
    setTextColor: store.setTextColor,
    resetDisplayToDefault: store.resetDisplayToDefault,
    openConfig: store.openConfig,
        closeConfig: store.closeConfig,
        openDisplayConfig: store.openDisplayConfig,
        closeDisplayConfig: store.closeDisplayConfig,
        setAllowNegative: store.setAllowNegative,
        setDurationMs: store.setDurationMs,
        adjustTime: store.adjustTime,
        start: store.start,
    pause: store.pause,
    reset: store.reset,
    saveMark: store.saveMark,
    removeSavedMark: store.removeSavedMark,
    clearSavedMarks: store.clearSavedMarks,
    toggleProjection: store.toggleProjection,
    syncProjection: store.syncProjection,
    clearProjection: store.clearProjection,
    refreshProjectionState: store.refreshProjectionState,
  }
}
