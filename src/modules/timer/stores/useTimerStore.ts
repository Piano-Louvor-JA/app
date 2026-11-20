import { detectObsBeforeProjection } from '@modules/settings/services/obs-detection'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'

import { computeElapsedMs } from '../services/timer-format'
import {
  loadTimerDisplayConfig,
  saveTimerDisplayConfig,
} from '../services/timer-preferences'
import {
  publishTimerRuntime,
  readTimerRuntimeFromStorage,
} from '../services/timer-runtime'
import {
  DEFAULT_TIMER_DISPLAY_CONFIG,
  DEFAULT_TIMER_RUNTIME,
  type TimerDisplayConfig,
  type TimerRuntimeState,
  type TimerTimeFormat,
} from '../types/timer'

export const useTimerStore = defineStore('timer', () => {
  const config = ref<TimerDisplayConfig>({ ...DEFAULT_TIMER_DISPLAY_CONFIG })
  const runtime = ref<TimerRuntimeState>({
    ...DEFAULT_TIMER_RUNTIME,
    savedTimesMs: [],
  })
  const isProjecting = ref(false)
  const projectingTvsOnly = ref(false)
  /** Preview no operador (1 monitor / sem tela de projeção marcada). */
  const inAppPreview = ref(false)
  const configOpen = ref(false)
  const hydrated = ref(false)

  let projectionWatchTimer: ReturnType<typeof setInterval> | null = null

  const isRunning = computed(() => runtime.value.status === 'running')
  const isPaused = computed(() => runtime.value.status === 'paused')

  function stopProjectionWatch() {
    if (!projectionWatchTimer) return
    clearInterval(projectionWatchTimer)
    projectionWatchTimer = null
  }

  function startProjectionWatch() {
    stopProjectionWatch()
    projectionWatchTimer = setInterval(() => {
      if (projectingTvsOnly.value || inAppPreview.value) return
      if (!isProjectionModuleOpen('timer')) {
        isProjecting.value = false
        stopProjectionWatch()
      }
    }, 400)
  }

  function syncRuntime() {
    publishTimerRuntime({ ...runtime.value, projecting: isProjecting.value })
  }

  function hydrate() {
    if (hydrated.value) return
    config.value = loadTimerDisplayConfig()
    runtime.value = readTimerRuntimeFromStorage()
    isProjecting.value = isProjectionModuleOpen('timer')
    if (isProjecting.value) startProjectionWatch()
    hydrated.value = true
  }

  function persistConfig() {
    saveTimerDisplayConfig(config.value)
  }

  function setTimeFormat(timeFormat: TimerTimeFormat) {
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

  function resetDisplayToDefault() {
    config.value = { ...DEFAULT_TIMER_DISPLAY_CONFIG }
    persistConfig()
  }

  function openConfig() {
    configOpen.value = true
  }

  function closeConfig() {
    configOpen.value = false
  }

  function start() {
    if (runtime.value.status === 'running') return

    runtime.value = {
      ...runtime.value,
      status: 'running',
      segmentStartedAt: Date.now(),
    }
    syncRuntime()
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
  }

  function reset() {
    const keepRunning = runtime.value.status === 'running'

    runtime.value = {
      ...runtime.value,
      status: keepRunning ? 'running' : 'idle',
      segmentStartedAt: keepRunning ? Date.now() : null,
      accumulatedMs: 0,
    }
    syncRuntime()
  }

  function saveMark() {
    const elapsed = computeElapsedMs(
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      runtime.value.status,
      Date.now(),
    )

    runtime.value = {
      ...runtime.value,
      savedTimesMs: [...runtime.value.savedTimesMs, elapsed],
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

  async function syncProjection() {
    await detectObsBeforeProjection()
    syncRuntime()
    if (isPalcoTvOnlyRoute('timer')) {
      isProjecting.value = true
      projectingTvsOnly.value = true
      inAppPreview.value = false
      syncRuntime() // publica owner=true após definir o modo
      startProjectionWatch()
      return
    }
    projectingTvsOnly.value = false
    const hasExternal = await hasSelectedExtendedProjectionTargets()
    if (!hasExternal) {
      closeProjectionModule()
      isProjecting.value = true
      inAppPreview.value = true
      syncRuntime()
      startProjectionWatch()
      return
    }
    inAppPreview.value = false
    const opened = await openProjectionModule('timer')
    isProjecting.value = opened
    syncRuntime() // owner segue a projeção, não o status do cronômetro
    if (opened) startProjectionWatch()
    else stopProjectionWatch()
  }

  function clearProjection() {
    isProjecting.value = false
    projectingTvsOnly.value = false
    inAppPreview.value = false
    syncRuntime()
    stopProjectionWatch()
    closeProjectionModule()
  }

  async function toggleProjection() {
    if (isProjecting.value && (isProjectionModuleOpen('timer') || projectingTvsOnly.value || inAppPreview.value)) {
      clearProjection()
      return
    }
    await syncProjection()
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
    hydrate,
    setTimeFormat,
    setBgColor,
    setTextColor,
    resetDisplayToDefault,
    openConfig,
    closeConfig,
    start,
    pause,
    reset,
    saveMark,
    removeSavedMark,
    clearSavedMarks,
    toggleProjection,
    syncProjection,
    clearProjection,
  }
})
