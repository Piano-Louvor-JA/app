import { computed, onMounted, onUnmounted, ref } from 'vue'
import { listSystemDisplays, subscribeDisplaysChanged } from '@modules/settings/services/display-service'
import type { SystemDisplay } from '@modules/settings/types/projection'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'

/** Controles temporários da projeção local; lista desconhecida não habilita minimizar. */
export function usePrimaryProjectionControls() {
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
    primaryOnly.value = currentDisplays.some((display) => display.isPrimary) &&
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

  onMounted(async () => {
    window.addEventListener('mousemove', wake)
    window.addEventListener('storage', wake)
    // Inscrever antes da leitura impede que um hotplug seja perdido no intervalo.
    unsubscribe = subscribeDisplaysChanged((displays) => {
      displayRevision++
      updateDisplays(displays)
    })
    const revision = displayRevision
    const displays = await listSystemDisplays()
    if (!disposed && displayRevision === revision) updateDisplays(displays)
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
