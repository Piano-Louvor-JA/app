import {
  formatDisplayResolution,
  listExtendedDisplays,
  listSystemDisplays,
  subscribeDisplaysChanged,
} from '@modules/settings/services/display-service'
import type { SystemDisplay } from '@modules/settings/types/projection'
import { openProjectionPopupWindow } from '@shared/composables/useProjectionWindow'
import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * Projeção independente: um módulo em UM monitor estendido, por cima do que a
 * projeção principal mostra ali. A principal não é fechada nem alterada; ao
 * encerrar, o monitor volta a mostrar o que estava por baixo.
 *
 * Regras: uma independente por monitor (o último módulo assume) e uma por
 * módulo (escolher outro monitor move a janela). Não persiste entre sessões.
 */

/** módulo → monitor da independente. Reativo para stores e botões. */
const assignments = ref<Record<string, number>>({})
const windows = new Map<string, Window>()
let pruneTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeDisplays: (() => void) | null = null

function closeWindow(win: Window | undefined) {
  if (!win) return
  try {
    win.close()
  } catch {
    // janela já fechada
  }
}

function release(moduleId: string) {
  closeWindow(windows.get(moduleId))
  windows.delete(moduleId)
  if (moduleId in assignments.value) {
    const next = { ...assignments.value }
    delete next[moduleId]
    assignments.value = next
  }
  if (windows.size === 0) stopWatching()
}

function pruneClosed() {
  for (const [moduleId, win] of [...windows]) {
    if (win.closed) release(moduleId)
  }
}

function onDisplaysChanged(displays: SystemDisplay[]) {
  const extendedIds = new Set(listExtendedDisplays(displays).map((display) => display.id))
  for (const [moduleId, monitorId] of Object.entries(assignments.value)) {
    if (!extendedIds.has(monitorId)) release(moduleId)
  }
}

function startWatching() {
  if (!pruneTimer) pruneTimer = setInterval(pruneClosed, 500)
  if (!unsubscribeDisplays) unsubscribeDisplays = subscribeDisplaysChanged(onDisplaysChanged)
}

function stopWatching() {
  if (pruneTimer) clearInterval(pruneTimer)
  pruneTimer = null
  unsubscribeDisplays?.()
  unsubscribeDisplays = null
}

export function getIndependentMonitor(moduleId: string): number | null {
  return assignments.value[moduleId] ?? null
}

export function isIndependentProjectionActive(moduleId: string): boolean {
  return getIndependentMonitor(moduleId) != null
}

export async function openIndependentProjection(
  moduleId: string,
  monitorId: number,
): Promise<boolean> {
  const extended = listExtendedDisplays(await listSystemDisplays())
  if (!extended.some((display) => display.id === monitorId)) return false

  const current = windows.get(moduleId)
  if (getIndependentMonitor(moduleId) === monitorId && current && !current.closed) {
    return true
  }
  release(moduleId)
  for (const [otherId, otherMonitor] of Object.entries(assignments.value)) {
    if (otherMonitor === monitorId) release(otherId)
  }

  const win = openProjectionPopupWindow(moduleId, monitorId, { independent: true })
  if (!win) return false

  windows.set(moduleId, win)
  assignments.value = { ...assignments.value, [moduleId]: monitorId }
  startWatching()
  // Projeção (window.open) rouba o teclado — devolve ao operador.
  try {
    window.focus()
  } catch {
    /* ignore */
  }
  return true
}

export function closeIndependentProjection(moduleId: string): void {
  release(moduleId)
}

export function closeAllIndependentProjections(): void {
  for (const moduleId of Object.keys(assignments.value)) release(moduleId)
}

export type IndependentMonitorOption = {
  id: number
  /** Mesmo número do overlay "Identificar monitores". */
  index: number
  resolutionLabel: string
}

/** Estado do botão de projeção independente de um módulo. */
export function useIndependentProjectionControl(moduleId: string) {
  const displays = ref<SystemDisplay[]>([])
  const loaded = ref(false)
  let unsubscribe: (() => void) | undefined
  let revision = 0
  let disposed = false

  const monitors = computed<IndependentMonitorOption[]>(() =>
    displays.value
      .map((display, position) => ({ display, index: position + 1 }))
      .filter(({ display }) => !display.isPrimary)
      .map(({ display, index }) => ({
        id: display.id,
        index,
        resolutionLabel: formatDisplayResolution(display),
      })),
  )
  const available = computed(() => monitors.value.length > 0)
  const activeMonitorId = computed(() => getIndependentMonitor(moduleId))

  onMounted(async () => {
    // Inscrever antes da leitura impede que um hotplug seja perdido no intervalo.
    unsubscribe = subscribeDisplaysChanged((next) => {
      revision++
      displays.value = next
      loaded.value = true
    })
    const startRevision = revision
    const initial = await listSystemDisplays()
    if (!disposed && revision === startRevision) displays.value = initial
    loaded.value = true
  })

  onUnmounted(() => {
    disposed = true
    unsubscribe?.()
  })

  return {
    monitors,
    available,
    loaded,
    activeMonitorId,
    project: (monitorId: number) => openIndependentProjection(moduleId, monitorId),
    stop: () => closeIndependentProjection(moduleId),
  }
}
