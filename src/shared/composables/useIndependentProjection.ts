import { obsAssignments, clearObsModule, assignObsConnection } from '@modules/settings/services/obs-connections'
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
 * Projeção independente: um módulo em um ou VÁRIOS monitores estendidos, por
 * cima do que a projeção principal mostra ali. A principal não é fechada nem alterada; ao
 * encerrar, o monitor volta a mostrar o que estava por baixo.
 *
 * Modo `share` (projeção compartilhada): em vez de cobrir, divide o monitor
 * ao meio com o que já está projetado nele; quem ficar sozinho volta a ocupar
 * a tela inteira (a divisão é feita pelo processo main).
 *
 * Regras: uma independente por monitor (o último módulo assume); um módulo
 * pode estar em vários monitores ao mesmo tempo (cada um liga/desliga sozinho).
 * Não persiste entre sessões.
 */

export type IndependentProjectionMode = 'overlay' | 'share'

/** módulo → monitores da independente (ordem de abertura). Reativo para stores e botões. */
const assignments = ref<Record<string, number[]>>({})
/** módulo → modo da independente (o da última abertura). */
const modes = ref<Record<string, IndependentProjectionMode>>({})
/** `${módulo}:${monitor}` → janela. */
const windows = new Map<string, Window>()
/** `${módulo}:${monitor}` → modo daquela janela. */
const windowModes = new Map<string, IndependentProjectionMode>()
let pruneTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeDisplays: (() => void) | null = null

function windowKey(moduleId: string, monitorId: number): string {
  return `${moduleId}:${monitorId}`
}

function closeWindow(win: Window | undefined) {
  if (!win) return
  try {
    win.close()
  } catch {
    // janela já fechada
  }
}

/** Fecha a independente do módulo em um monitor (o resto do módulo continua). */
function releaseMonitor(moduleId: string, monitorId: number) {
  const key = windowKey(moduleId, monitorId)
  closeWindow(windows.get(key))
  windows.delete(key)
  windowModes.delete(key)
  const current = assignments.value[moduleId] ?? []
  if (current.includes(monitorId)) {
    const rest = current.filter((id) => id !== monitorId)
    const next = { ...assignments.value }
    if (rest.length > 0) next[moduleId] = rest
    else delete next[moduleId]
    assignments.value = next
    if (rest.length === 0) {
      const nextModes = { ...modes.value }
      delete nextModes[moduleId]
      modes.value = nextModes
    }
  }
  if (windows.size === 0) stopWatching()
}

/** Fecha o módulo em todos os monitores e nas saídas OBS. */
function release(moduleId: string) {
  clearObsModule(moduleId)
  for (const monitorId of [...(assignments.value[moduleId] ?? [])]) releaseMonitor(moduleId, monitorId)
}

function pruneClosed() {
  for (const [moduleId, monitorIds] of Object.entries(assignments.value)) {
    for (const monitorId of monitorIds) {
      const win = windows.get(windowKey(moduleId, monitorId))
      if (!win || win.closed) releaseMonitor(moduleId, monitorId)
    }
  }
}

function onDisplaysChanged(displays: SystemDisplay[]) {
  const extendedIds = new Set(listExtendedDisplays(displays).map((display) => display.id))
  for (const [moduleId, monitorIds] of Object.entries(assignments.value)) {
    for (const monitorId of monitorIds) {
      if (!extendedIds.has(monitorId)) releaseMonitor(moduleId, monitorId)
    }
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

/** Monitores onde o módulo está em projeção independente. */
export function getIndependentMonitors(moduleId: string): number[] {
  return assignments.value[moduleId] ?? []
}

/** Primeiro monitor do módulo (compatibilidade com quem só precisa saber se há algum). */
export function getIndependentMonitor(moduleId: string): number | null {
  return assignments.value[moduleId]?.[0] ?? null
}

export function getIndependentMode(moduleId: string): IndependentProjectionMode | null {
  return modes.value[moduleId] ?? null
}

export function isIndependentProjectionActive(moduleId: string): boolean {
  return getIndependentMonitor(moduleId) != null || Object.values(obsAssignments.value).some((value) => value === moduleId)
}

/**
 * Liga o módulo em mais um monitor (os que já estão continuam). No mesmo
 * monitor e modo, não reabre; em outro modo, reabre só aquele monitor.
 */
export async function openIndependentProjection(
  moduleId: string,
  monitorId: number,
  mode: IndependentProjectionMode = 'overlay',
): Promise<boolean> {
  const extended = listExtendedDisplays(await listSystemDisplays())
  if (!extended.some((display) => display.id === monitorId)) return false

  const key = windowKey(moduleId, monitorId)
  const current = windows.get(key)
  if (current && !current.closed && windowModes.get(key) === mode) return true
  releaseMonitor(moduleId, monitorId)
  // Um monitor só tem uma independente: o último módulo assume.
  for (const [otherId, otherMonitors] of Object.entries(assignments.value)) {
    if (otherId !== moduleId && otherMonitors.includes(monitorId)) releaseMonitor(otherId, monitorId)
  }

  const win = openProjectionPopupWindow(moduleId, monitorId, {
    independent: true,
    share: mode === 'share',
  })
  if (!win) return false

  windows.set(key, win)
  windowModes.set(key, mode)
  assignments.value = { ...assignments.value, [moduleId]: [...(assignments.value[moduleId] ?? []), monitorId] }
  modes.value = { ...modes.value, [moduleId]: mode }
  startWatching()
  // Projeção (window.open) rouba o teclado — devolve ao operador.
  try {
    window.focus()
  } catch {
    /* ignore */
  }
  return true
}

/** Tira o módulo de um monitor só. */
export function closeIndependentMonitor(moduleId: string, monitorId: number): void {
  releaseMonitor(moduleId, monitorId)
}

export function closeIndependentProjection(moduleId: string): void {
  release(moduleId)
}

export function closeAllIndependentProjections(): void {
  for (const id of Object.keys(obsAssignments.value)) assignObsConnection(id, null)
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
  const activeMonitorIds = computed(() => getIndependentMonitors(moduleId))
  const activeMonitorId = computed(() => getIndependentMonitor(moduleId))
  const activeMode = computed(() => getIndependentMode(moduleId))

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
    activeMonitorIds,
    activeMonitorId,
    activeMode,
    project: (monitorId: number, mode: IndependentProjectionMode = 'overlay') =>
      openIndependentProjection(moduleId, monitorId, mode),
    unproject: (monitorId: number) => closeIndependentMonitor(moduleId, monitorId),
    stop: () => closeIndependentProjection(moduleId),
  }
}
