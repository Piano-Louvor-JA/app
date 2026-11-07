import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useCountdownProjectionControl } from '../composables/useCountdownProjectionControl'
import {
  computeElapsedMs,
  computeCountdownRemainingMs,
} from '../services/countdown-format'
import {
  loadCountdownDisplayConfig,
  saveCountdownDisplayConfig,
} from '../services/countdown-preferences'
import {
  beginCountdownSession,
  readTimerRuntimeFromStorage,
  stopCountdownRuntime,
  writeTimerRuntimeToStorage,
} from '../services/countdown-runtime'
import {
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_COUNTDOWN_RUNTIME,
  type CountdownDisplayConfig,
  type CountdownRuntimeState,
  type CountdownTimeFormat,
} from '../types/countdown'

export const useCountdownStore = defineStore('countdown', () => {
  const config = ref<CountdownDisplayConfig>({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
  const runtime = ref<CountdownRuntimeState>({
    ...DEFAULT_COUNTDOWN_RUNTIME,
    savedTimesMs: [],
    durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
  })
  const configOpen = ref(false)
  const displayConfigOpen = ref(false)
  const hydrated = ref(false)
  const projection = useCountdownProjectionControl('timer', () => runtime.value)
  const { isProjecting, inAppPreview } = projection

  let finishWatchTimer: ReturnType<typeof setInterval> | null = null

  const isRunning = computed(() => runtime.value.status === 'running')
  const isPaused = computed(() => runtime.value.status === 'paused')
  const canStart = computed(() => runtime.value.status !== 'running' && runtime.value.durationMs > 0)

  function stopFinishWatch() {
    if (!finishWatchTimer) return
    clearInterval(finishWatchTimer)
    finishWatchTimer = null
  }

  function checkFinished() {
    if (runtime.value.status !== 'running' || runtime.value.finished) return

    const remaining = computeCountdownRemainingMs(runtime.value, Date.now())

    if (remaining > 0) return

    runtime.value = {
      ...runtime.value,
      finished: true,
      ...(config.value.allowNegative === false ? {
        status: 'paused' as const,
        accumulatedMs: runtime.value.durationMs,
        segmentStartedAt: null,
        pausedRemainingMs: 0,
      } : {}),
    }
    syncRuntime()
  }

  function startFinishWatch() {
    stopFinishWatch()
    finishWatchTimer = setInterval(checkFinished, 50)
  }

  function syncRuntime() {
    writeTimerRuntimeToStorage(runtime.value)
    projection.publish()
  }

  function hydrate() {
    if (hydrated.value) return
    config.value = loadCountdownDisplayConfig()
    runtime.value = readTimerRuntimeFromStorage()
    projection.hydrateProjection()
    // Contagem deixada rodando quando o app foi fechado não pode voltar
    // sozinha ao abrir a tela; dentro da mesma execução ela continua.
    if (beginCountdownSession() && (runtime.value.status !== 'idle' || runtime.value.finished)) {
      runtime.value = stopCountdownRuntime(runtime.value)
      syncRuntime()
    }
    // o Timer só faz contagem regressiva; o modo "até horário" saiu
    if (runtime.value.mode === 'until') {
      runtime.value = { ...stopCountdownRuntime(runtime.value), mode: 'duration' }
      syncRuntime()
    }
    if (runtime.value.status === 'running') startFinishWatch()
    hydrated.value = true
  }

  function persistConfig() {
    saveCountdownDisplayConfig(config.value)
  }

  function setTimeFormat(timeFormat: CountdownTimeFormat) {
    config.value = { ...config.value, timeFormat }
    persistConfig()
  }

  function setBgColor(bgColor: string) {
    config.value = { ...config.value, bgColor }
    persistConfig()
  }

  function setTextColor(textColor: string) {
      config.value = { ...config.value, textColor }
      persistConfig()
    }

    function setAllowNegative(allowNegative: boolean) {
      config.value = { ...config.value, allowNegative }
      persistConfig()
    }

    /** Adiciona (delta > 0) ou remove (delta < 0) tempo da contagem, em qualquer status.
     *  Remove nunca deixa abaixo de zero. Não reseta a contagem em curso. */
    function adjustTime(deltaMs: number) {
      const next = Math.max(0, runtime.value.durationMs + Math.floor(deltaMs))
      runtime.value = { ...runtime.value, durationMs: next, finished: false }
      syncRuntime()
    }

    function resetDisplayToDefault() {
    config.value = { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG }
    persistConfig()
  }

  function openConfig() {
    configOpen.value = true
  }

  function closeConfig() {
    configOpen.value = false
  }

  function openDisplayConfig() {
    displayConfigOpen.value = true
  }

  function closeDisplayConfig() {
    displayConfigOpen.value = false
  }

  function setDurationMs(durationMs: number) {
    if (runtime.value.status === 'running') return

    const next = Math.max(0, Math.floor(durationMs))
    runtime.value = {
      ...runtime.value,
      durationMs: next,
      accumulatedMs: 0,
      segmentStartedAt: null,
      status: 'idle',
      finished: false,
    }
    syncRuntime()
  }

  function start() {
    if (runtime.value.status === 'running') return

    if (runtime.value.durationMs <= 0 || runtime.value.finished) return
    const remaining = computeCountdownRemainingMs(runtime.value, Date.now())
    if (remaining <= 0) {
      runtime.value = { ...runtime.value, finished: true, status: 'idle' }
      syncRuntime()
      return
    }

    runtime.value = {
      ...runtime.value,
      status: 'running',
      segmentStartedAt: Date.now(),
      pausedRemainingMs: null,
      finished: false,
    }
    syncRuntime()
    startFinishWatch()
  }

  function pause() {
    if (runtime.value.status !== 'running' || runtime.value.segmentStartedAt == null) {
      return
    }

    const elapsed = computeElapsedMs(
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      'running',
      Date.now(),
    )

    runtime.value = {
      ...runtime.value,
      status: 'paused',
      segmentStartedAt: null,
      accumulatedMs: elapsed,
    }
    syncRuntime()
    stopFinishWatch()
  }

  function reset() {
    stopFinishWatch()
    runtime.value = {
      ...runtime.value,
      mode: 'duration',
      durationMs: 0,
      status: 'idle',
      segmentStartedAt: null,
      accumulatedMs: 0,
      pausedRemainingMs: null,
      finished: false,
    }
    syncRuntime()
  }

  function saveMark() {
    const remaining = computeCountdownRemainingMs(runtime.value, Date.now())

    runtime.value = {
      ...runtime.value,
      savedTimesMs: [...runtime.value.savedTimesMs, remaining],
    }
    syncRuntime()
  }

  function removeSavedMark(index: number) {
    runtime.value = {
      ...runtime.value,
      savedTimesMs: runtime.value.savedTimesMs.filter((_, i) => i !== index),
    }
    syncRuntime()
  }

  function clearSavedMarks() {
    runtime.value = {
      ...runtime.value,
      savedTimesMs: [],
    }
    syncRuntime()
  }

  return {
    config,
    runtime,
    isProjecting,
    inAppPreview,
    configOpen,
    hydrated,
    isRunning,
    isPaused,
    canStart,
    hydrate,
    setTimeFormat,
    setBgColor,
    setTextColor,
    setAllowNegative,
    resetDisplayToDefault,
    openConfig,
    closeConfig,
    displayConfigOpen,
    openDisplayConfig,
    closeDisplayConfig,
    setDurationMs,
    adjustTime,
    start,
    pause,
    reset,
    saveMark,
    removeSavedMark,
    clearSavedMarks,
    toggleProjection: projection.toggleProjection,
    syncProjection: projection.syncProjection,
    clearProjection: projection.clearProjection,
    refreshProjectionState: projection.refreshProjectionState,
  }
})
