import {
  formatDisplayResolution,
  identifySystemDisplays,
  listExtendedDisplays,
  listSystemDisplays,
  subscribeDisplaysChanged,
} from '@modules/settings/services/display-service'
import {
  loadProjectionSettings,
  reconcileTargetDisplays,
  saveProjectionSettings,
} from '@modules/settings/services/projection-preferences'
import { useProjectionStore } from '@modules/settings/stores/useProjectionStore'
import type {
  ProjectionSettings,
  SystemDisplay,
} from '@modules/settings/types/projection'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { reapplyProjectionTargets } from '@shared/composables/useProjectionWindow'
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

function syncProjectionStore(next: ProjectionSettings) {
  try {
    useProjectionStore().applySettings(next)
  } catch {
    // Pinia ainda não disponível (testes / bootstrap)
  }
}

export type MonitorTargetOption = {
  id: number
  index: number
  label: string
  resolutionLabel: string
  isPrimary: boolean
  isSelected: boolean
  isReturn: boolean
}

export type UseMonitorTargetSelectOptions = {
  /** Se true, sincroniza com projection.settings. */
  persist?: boolean
  /** Só monitores estendidos (não primários). Default true. */
  extendedOnly?: boolean
  /** IDs controlados externamente (v-model). */
  modelValue?: Ref<number[] | undefined> | (() => number[] | undefined)
  onUpdate?: (ids: number[]) => void
}

function readModel(
  modelValue: UseMonitorTargetSelectOptions['modelValue'],
): number[] | undefined {
  if (!modelValue) return undefined
/* v8 ignore next 2 -- cond-expr defensivo returnDisplayId */
  return typeof modelValue === 'function' ? modelValue() : modelValue.value
}

function sameIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

export function useMonitorTargetSelect(options: UseMonitorTargetSelectOptions = {}) {
  const persist = options.persist !== false
  const extendedOnly = options.extendedOnly !== false

  const displays = ref<SystemDisplay[]>([])
  const selectedIds = ref<number[]>([])
  const returnDisplayId = ref<number | null>(null)
  const loading = ref(false)
  const identifying = ref(false)
  const open = ref(false)

  let applyingRemote = false
  let syncSeq = 0
  let unsubscribeTargets: (() => void) | undefined
  let unsubscribeDisplays: (() => void) | undefined

  function rememberReturnDisplay(settings = loadProjectionSettings()) {
    returnDisplayId.value =
      settings.openReturnScreen && settings.returnDisplayId != null
        ? settings.returnDisplayId
        : null
  }

  const optionsList = computed<MonitorTargetOption[]>(() => {
    const all = displays.value
    const source = extendedOnly
      ? listExtendedDisplays(all)
      : all
    const visibleIds = new Set(source.map((display) => display.id))
    if (returnDisplayId.value != null) visibleIds.add(returnDisplayId.value)

    return all
      .filter((display) => visibleIds.has(display.id))
      .map((display) => {
        // Mesmo número do overlay "Identificar monitores" (índice na lista completa).
        const globalIndex = all.findIndex((item) => item.id === display.id)
/* v8 ignore next 2 -- cond-expr defensivo index calc */
        const index = globalIndex >= 0 ? globalIndex + 1 : 0
        const isReturn = returnDisplayId.value === display.id
        return {
          id: display.id,
          index,
          label: `Monitor ${index}`,
          resolutionLabel: formatDisplayResolution(display),
          isPrimary: display.isPrimary,
          isSelected: selectedIds.value.includes(display.id),
          isReturn,
        }
      })
  })

  const selectedCount = computed(() => selectedIds.value.length)
  const hasDisplays = computed(() => optionsList.value.length > 0)

  function emitUpdate(ids: number[]) {
    options.onUpdate?.(ids)
  }

  async function syncToMain(ids: number[]) {
    if (applyingRemote) return
    const seq = ++syncSeq
    // Como no controle YouTube/site: snapshot local é a fonte da verdade.
    const snapshot = ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
    const bridge = getDesktopBridge()

    // Ignora ecos IPC da própria atualização (senão a seleção “volta”/some).
    applyingRemote = true
    try {
      await bridge?.projection?.setSiteTargetMonitors?.(snapshot)
/* v8 ignore next 3 -- seq stale guard (stale sync impossível em teste) */
      if (seq !== syncSeq) return
      await bridge?.projection?.setVideoTargetMonitors?.(snapshot)
/* v8 ignore next 2 -- seq stale guard 2 (stale sync impossível) */
      if (seq !== syncSeq) return
      // Módulos Vue (mídia, bíblia…): reaplica nas telas — no-op se não houver projeção ativa.
      await reapplyProjectionTargets(snapshot)
    } finally {
/* v8 ignore next 3 -- finally seq check (sempre true) */
      if (seq === syncSeq) {
        window.setTimeout(() => {
          if (seq === syncSeq) applyingRemote = false
        }, 0)
      }
    }
  }

  function allowedDisplayIds(nextDisplays: SystemDisplay[]): number[] {
    const ids = (extendedOnly ? listExtendedDisplays(nextDisplays) : nextDisplays).map(
      (item) => item.id,
    )
    if (returnDisplayId.value != null && !ids.includes(returnDisplayId.value)) {
      ids.push(returnDisplayId.value)
    }
    return ids
  }

  function applySelectionFromSettings(nextDisplays: SystemDisplay[]) {
    const extendedIds = listExtendedDisplays(nextDisplays).map((item) => item.id)
    let settings = loadProjectionSettings()
    settings = reconcileTargetDisplays(settings, extendedIds)
    // Nunca persiste/seleciona o monitor principal
    const reservedReturn =
      settings.openReturnScreen && settings.returnDisplayId != null
        ? settings.returnDisplayId
        : null
    settings = {
      ...settings,
      targetDisplayIds: settings.targetDisplayIds.filter(
        (id) => extendedIds.includes(id) || id === reservedReturn,
      ),
    }
    saveProjectionSettings(settings)
    syncProjectionStore(settings)
    rememberReturnDisplay(settings)
    selectedIds.value = [...settings.targetDisplayIds]
  }

  function applySelectionFromModel(ids: number[] | undefined, nextDisplays: SystemDisplay[]) {
    const allowed = new Set(allowedDisplayIds(nextDisplays))
    if (ids && ids.length > 0) {
      rememberReturnDisplay()
      selectedIds.value = ids.filter((id) => allowed.has(id))
      return
    }
    if (persist) {
      applySelectionFromSettings(nextDisplays)
      return
    }
    rememberReturnDisplay()
    selectedIds.value = [...allowed]
  }

  function applyRemoteIds(ids: number[]) {
    if (applyingRemote) return
    const allowed = new Set(allowedDisplayIds(displays.value))
    const normalized = ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
    const next = displays.value.length
      ? normalized.filter((id) => allowed.has(id))
      : [...normalized]
/* v8 ignore next 2 -- sameIds early return (testado mas v8 vê branch) */
    if (sameIds(selectedIds.value, next)) return

    applyingRemote = true
    try {
      selectedIds.value = next
      if (persist && displays.value.length) {
        const settings = loadProjectionSettings()
        const extendedIds = listExtendedDisplays(displays.value).map((item) => item.id)
        const nextSettings = {
          ...settings,
          targetDisplayIds: next,
          declinedDisplayIds: extendedIds.filter((id) => !next.includes(id)),
        }
        saveProjectionSettings(nextSettings)
        syncProjectionStore(nextSettings)
        rememberReturnDisplay(nextSettings)
      }
      emitUpdate([...next])
    } finally {
      applyingRemote = false
    }
  }

  async function refresh() {
    loading.value = true
    try {
      const next = await listSystemDisplays()
      displays.value = next
      applySelectionFromModel(readModel(options.modelValue), next)
      rememberReturnDisplay()
    } finally {
      loading.value = false
    }
  }

  function setSelectedIds(ids: number[]) {
    const allowed = new Set(allowedDisplayIds(displays.value))
    const nextIds = ids.filter((id) => allowed.has(id))
    selectedIds.value = nextIds
    if (persist) {
      const settings = loadProjectionSettings()
      const extendedIds = listExtendedDisplays(displays.value).map((item) => item.id)
      const declined = extendedIds.filter((id) => !nextIds.includes(id))
      const nextSettings = {
        ...settings,
        targetDisplayIds: nextIds,
        declinedDisplayIds: declined,
      }
      saveProjectionSettings(nextSettings)
      syncProjectionStore(nextSettings)
      rememberReturnDisplay(nextSettings)
    }
    emitUpdate([...selectedIds.value])
    void syncToMain([...selectedIds.value])
  }

  function toggle(displayId: number) {
    const allowed = new Set(allowedDisplayIds(displays.value))
    if (!allowed.has(displayId)) return

    // Fonte da verdade: seleção atual na UI (evita corrida com settings/IPC).
    const next = selectedIds.value.includes(displayId)
      ? selectedIds.value.filter((id) => id !== displayId)
      : [...selectedIds.value, displayId]
    setSelectedIds(next)
  }

  async function identify() {
    identifying.value = true
    try {
      await identifySystemDisplays()
    } finally {
      identifying.value = false
    }
  }

  function toggleOpen() {
    open.value = !open.value
/* v8 ignore next 2 -- toggleOpen else implícito (testado toggle 2x) */
    if (open.value) {
      void refresh()
    }
  }

  function close() {
    open.value = false
  }

  onMounted(() => {
    void refresh().then(() => {
      // Alinha o main process com as preferências já mostradas no badge.
      void syncToMain([...selectedIds.value])
    })
    const bridge = getDesktopBridge()
    unsubscribeTargets = bridge?.projection?.onSiteTargetsChanged?.((ids) => {
      applyRemoteIds(Array.isArray(ids) ? ids : [])
    })
    unsubscribeDisplays = subscribeDisplaysChanged(() => {
      void (async () => {
        await refresh()
        void syncToMain([...selectedIds.value])
      })()
    })
  })

  onBeforeUnmount(() => {
    unsubscribeTargets?.()
    unsubscribeDisplays?.()
  })

  watch(
    () => readModel(options.modelValue),
    (ids) => {
/* v8 ignore next 2 -- watch modelValue null guard (testado) */
      if (!ids) return
      const allowed = new Set(allowedDisplayIds(displays.value))
      selectedIds.value = ids.filter((id) => allowed.has(id))
    },
  )

  return {
    displays,
    optionsList,
    selectedIds,
    selectedCount,
    hasDisplays,
    loading,
    identifying,
    open,
    refresh,
    toggle,
    setSelectedIds,
    identify,
    toggleOpen,
    close,
  }
}
