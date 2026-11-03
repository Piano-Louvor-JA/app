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
import { palcoClockOff, palcoClockOn } from '../../settings/services/palco-bridge'

import {
  loadClockConfig,
  saveClockConfig,
} from '../services/clock-preferences'
import {
  DEFAULT_CLOCK_CONFIG,
  type ClockConfig,
  type ClockStyle,
} from '../types/clock'

export const useClockStore = defineStore('clock', () => {
  const config = ref<ClockConfig>({ ...DEFAULT_CLOCK_CONFIG })
  const isProjecting = ref(false)
  const projectingTvsOnly = ref(false)
  /** Preview no operador (1 monitor / sem tela de projeção marcada). */
  const inAppPreview = ref(false)
  const configOpen = ref(false)
  const hydrated = ref(false)

  let projectionWatchTimer: ReturnType<typeof setInterval> | null = null

  const isAnalog = computed(() => config.value.style === 'analog')

  function stopProjectionWatch() {
    if (!projectionWatchTimer) return
    clearInterval(projectionWatchTimer)
    projectionWatchTimer = null
  }

  function startProjectionWatch() {
    stopProjectionWatch()
    projectionWatchTimer = setInterval(() => {
      if (projectingTvsOnly.value || inAppPreview.value) return
      if (!isProjectionModuleOpen('clock')) {
        isProjecting.value = false
        stopProjectionWatch()
      }
    }, 400)
  }

  function hydrate() {
    if (hydrated.value) return
    config.value = loadClockConfig()
    isProjecting.value = isProjectionModuleOpen('clock')
    if (isProjecting.value) startProjectionWatch()
    hydrated.value = true
  }

  function persist() {
    saveClockConfig(config.value)
  }

  function setStyle(style: ClockStyle) {
    config.value = { ...config.value, style }
    persist()
  }

  function setShowSeconds(showSeconds: boolean) {
    config.value = { ...config.value, showSeconds }
    persist()
  }

  function setFormat24h(format24h: boolean) {
    config.value = { ...config.value, format24h }
    persist()
  }

  function setBgColor(bgColor: string) {
    config.value = { ...config.value, bgColor }
    persist()
  }

  function setTextColor(textColor: string) {
    config.value = { ...config.value, textColor }
    persist()
  }

  function resetToDefault() {
    config.value = { ...DEFAULT_CLOCK_CONFIG }
    persist()
  }

  function openConfig() {
    configOpen.value = true
  }

  function closeConfig() {
    configOpen.value = false
  }

  async function syncProjection() {
    await detectObsBeforeProjection()
    // Relógio também segue a rota: slot individual = só TVs; Espelhar =
    // monitores selecionados + TVs. Antes palcoClockOn nunca era chamado.
    palcoClockOn()
    if (isPalcoTvOnlyRoute('clock')) {
      isProjecting.value = true
      projectingTvsOnly.value = true
      inAppPreview.value = false
      startProjectionWatch()
      return
    }
    projectingTvsOnly.value = false
    const hasExternal = await hasSelectedExtendedProjectionTargets()
    if (!hasExternal) {
      closeProjectionModule()
      isProjecting.value = true
      inAppPreview.value = true
      startProjectionWatch()
      return
    }
    inAppPreview.value = false
    const opened = await openProjectionModule('clock')
    isProjecting.value = opened
    if (opened) startProjectionWatch()
    else stopProjectionWatch()
  }

  function clearProjection() {
    closeProjectionModule()
    palcoClockOff()
    isProjecting.value = false
    projectingTvsOnly.value = false
    inAppPreview.value = false
    stopProjectionWatch()
  }

  async function toggleProjection() {
    if (isProjecting.value && (isProjectionModuleOpen('clock') || projectingTvsOnly.value || inAppPreview.value)) {
      clearProjection()
      return
    }
    await syncProjection()
  }

  return {
    config,
    isProjecting,
    inAppPreview,
    configOpen,
    hydrated,
    isAnalog,
    hydrate,
    setStyle,
    setShowSeconds,
    setFormat24h,
    setBgColor,
    setTextColor,
    resetToDefault,
    openConfig,
    closeConfig,
    toggleProjection,
    syncProjection,
    clearProjection,
  }
})
