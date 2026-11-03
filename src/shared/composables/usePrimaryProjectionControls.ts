import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { listSystemDisplays, subscribeDisplaysChanged } from '@modules/settings/services/display-service'
import { useObsConnections, hasSelectedObsTargets } from '@modules/settings/composables/useObsConnections'
import type { SystemDisplay } from '@modules/settings/types/projection'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'

/** Controles temporários da projeção local; lista desconhecida não habilita minimizar. */
export function usePrimaryProjectionControls(module?: string) {
  const { refresh } = useObsConnections()
  let networkReady = false
  const primaryOnly = ref(false)
  let currentDisplays: SystemDisplay[] = []
  const active = ref(true)
  const minimizeVisible = computed(() => primaryOnly.value && active.value)
  let deadline = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined
  let disposed = false
  let displayRevision = 0

  function checkIdle() {
    const remaining = deadline - Date.now()
    if (remaining > 0) timer = setTimeout(checkIdle, remaining)
    else active.value = false
  }

  function wake() {
    const selected = new Set(loadProjectionSettings().targetDisplayIds)
    primaryOnly.value = networkReady && !hasSelectedObsTargets(module) && currentDisplays.some((display) => display.isPrimary) &&
      !currentDisplays.some((display) => !display.isPrimary && selected.has(display.id))
    active.value = true
    clearTimeout(timer)
    timer = undefined
    if (!primaryOnly.value) return
    deadline = Date.now() + 5000
    timer = setTimeout(checkIdle, 5000)
  }

  function updateDisplays(displays: SystemDisplay[]) {
    currentDisplays = displays
    wake()
  }

  watch(() => hasSelectedObsTargets(module), wake)

  onMounted(async () => {
    window.addEventListener('mousemove', wake)
    window.addEventListener('storage', wake)
    // Inscrever antes da leitura impede que um hotplug seja perdido no intervalo.
    unsubscribe = subscribeDisplaysChanged((displays) => {
      displayRevision++
      updateDisplays(displays)
    })
    const revision = displayRevision
    const [displays] = await Promise.all([listSystemDisplays(), refresh()])
    networkReady = true
    if (!disposed) {
      if (displayRevision === revision) updateDisplays(displays)
      else wake()
    }
  })

  onUnmounted(() => {
    disposed = true
    clearTimeout(timer)
    unsubscribe?.()
    window.removeEventListener('mousemove', wake)
    window.removeEventListener('storage', wake)
  })

  const controlsVisible = computed(() => !primaryOnly.value || active.value)
  return { primaryOnly, minimizeVisible, controlsVisible, wake }
}
