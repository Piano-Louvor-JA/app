import { ref, watch } from 'vue'

import { detectObsBeforeProjection } from '@modules/settings/services/obs-detection'
import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'

import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'
import { useCountdownOutputStore, type CountdownOutputSource } from '../stores/useCountdownOutputStore'
import type { CountdownRuntimeState } from '../types/countdown'

/**
 * Projeção de um módulo pela tela de contagem. Usar dentro de um setup store.
 * Quando outro módulo manda projetar, este perde a tela sem fechá-la.
 */
export function useCountdownProjectionControl(
  source: CountdownOutputSource,
  snapshot: () => CountdownRuntimeState,
) {
  const output = useCountdownOutputStore()
  const isProjecting = ref(false)
  const projectingTvsOnly = ref(false)
  // app desktop: preview da projeção dentro da janela (InAppProjectionOverlay no AppShell)
  const inAppPreview = ref(false)
  let projectionWatchTimer: ReturnType<typeof setInterval> | null = null

  const ownsOutput = () => output.owner === source

  function stopProjectionWatch() {
    if (!projectionWatchTimer) return
    clearInterval(projectionWatchTimer)
    projectionWatchTimer = null
  }

  function startProjectionWatch() {
    stopProjectionWatch()
    projectionWatchTimer = setInterval(() => {
      if (projectingTvsOnly.value || inAppPreview.value) return
      if (!isProjectionModuleOpen('countdown')) {
        isProjecting.value = false
        stopProjectionWatch()
      }
    }, 400)
  }

  function publish() {
    output.publish(source, { ...snapshot(), projecting: isProjecting.value })
  }

  function dropProjection() {
    isProjecting.value = false
    projectingTvsOnly.value = false
    inAppPreview.value = false
    stopProjectionWatch()
  }

  watch(() => output.owner, (owner) => {
    if (owner !== source) dropProjection()
  }, { flush: 'sync' })

  function hydrateProjection() {
    isProjecting.value = ownsOutput() && isProjectionModuleOpen('countdown')
    if (isProjecting.value) startProjectionWatch()
  }

  async function syncProjection() {
    await detectObsBeforeProjection()
    output.claim(source)
    publish()
    if (isPalcoTvOnlyRoute('countdown')) {
      isProjecting.value = true
      projectingTvsOnly.value = true
      inAppPreview.value = false
      publish()
      startProjectionWatch()
      return
    }
    projectingTvsOnly.value = false
    const hasExternal = await hasSelectedExtendedProjectionTargets()
    if (!hasExternal) {
      closeProjectionModule()
      isProjecting.value = true
      inAppPreview.value = true
      publish()
      startProjectionWatch()
      return
    }
    inAppPreview.value = false
    const opened = await openProjectionModule('countdown')
    isProjecting.value = opened
    publish()
    if (opened) startProjectionWatch()
    else stopProjectionWatch()
  }

  function clearProjection() {
    const owned = ownsOutput()
    dropProjection()
    if (!owned) return
    publish()
    closeProjectionModule()
  }

  function refreshProjectionState() {
    const open = ownsOutput() && isProjectionModuleOpen('countdown')
    isProjecting.value = open
    if (open) startProjectionWatch()
    else stopProjectionWatch()
  }

  async function toggleProjection() {
    if (isProjecting.value && (isProjectionModuleOpen('countdown') || projectingTvsOnly.value || inAppPreview.value)) {
      clearProjection()
      return
    }
    await syncProjection()
  }

  return {
    isProjecting,
    inAppPreview,
    publish,
    hydrateProjection,
    syncProjection,
    clearProjection,
    refreshProjectionState,
    toggleProjection,
  }
}
