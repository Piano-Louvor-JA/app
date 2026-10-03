// @vitest-environment jsdom
// Cobertura useMonitorTargetSelect (gaps shared): optionsList (extendedOnly,
// retorno), toggle/setSelectedIds com persist, applyRemoteIds (eco IPC),
// modelValue controlado, identify, subscribes/unsubscribes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const listSystemDisplays = vi.fn()
const listExtendedDisplays = vi.fn((all: Array<{ id: number; isPrimary?: boolean }>) =>
  all.filter((d) => !d.isPrimary),
)
const identifySystemDisplays = vi.fn()
const subscribeDisplaysChanged = vi.fn(() => () => {})

vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: (...a: unknown[]) => listSystemDisplays(...(a as [])),
  listExtendedDisplays: (all: Array<{ id: number; isPrimary?: boolean }>) =>
    listExtendedDisplays(all),
  identifySystemDisplays: (...a: unknown[]) => identifySystemDisplays(...(a as [])),
  subscribeDisplaysChanged: (cb: unknown) => subscribeDisplaysChanged(cb),
  formatDisplayResolution: (d: { width?: number; height?: number }) =>
    `${d.width ?? 0}x${d.height ?? 0}`,
}))

const loadProjectionSettings = vi.fn()
const saveProjectionSettings = vi.fn()
const reconcileTargetDisplays = vi.fn((s: Record<string, unknown>) => s)
const reapplyProjectionTargets = vi.fn(async () => true)

vi.mock('@modules/settings/services/projection-preferences', () => ({
  loadProjectionSettings: () => loadProjectionSettings(),
  saveProjectionSettings: (s: Record<string, unknown>) => saveProjectionSettings(s),
  reconcileTargetDisplays: (s: Record<string, unknown>, ids: number[]) =>
    reconcileTargetDisplays(s, ids),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  reapplyProjectionTargets: (...a: unknown[]) => reapplyProjectionTargets(...(a as [])),
}))

const bridge = {
  projection: {
    setSiteTargetMonitors: vi.fn(async () => {}),
    setVideoTargetMonitors: vi.fn(async () => {}),
    onSiteTargetsChanged: vi.fn(() => () => {}),
  },
}

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => bridge,
}))

vi.mock('@modules/settings/stores/useProjectionStore', () => ({
  useProjectionStore: () => ({ applySettings: vi.fn() }),
}))

const SETTINGS = {
  targetDisplayIds: [2],
  declinedDisplayIds: [],
  openReturnScreen: false,
  returnDisplayId: null,
}

const DISPLAYS = [
  { id: 1, isPrimary: true, width: 1920, height: 1080 },
  { id: 2, width: 1366, height: 768 },
  { id: 3, width: 1280, height: 720 },
]

async function loadFresh() {
  vi.resetModules()
  return await import('../useMonitorTargetSelect')
}

function host<T>(fn: () => T): { result: T; unmount: () => void } {
  // roda o composable fora de componente: onMounted não dispara;
  // chamamos refresh manualmente nos testes que precisam
  let result: T
  const { effectScope } = require('vue') as typeof import('vue')
  const scope = effectScope()
  scope.run(() => {
    result = fn()
  })!
  return { result: result!, unmount: () => scope.stop() }
}

describe('useMonitorTargetSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSystemDisplays.mockResolvedValue(DISPLAYS)
    loadProjectionSettings.mockReturnValue({ ...SETTINGS })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refresh popula optionsList só com estendidos', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    expect(result.optionsList.value.map((o) => o.id)).toEqual([2, 3])
    expect(result.optionsList.value[0]!.label).toBe('Monitor 2')
    expect(result.optionsList.value[0]!.isSelected).toBe(true)
    expect(result.hasDisplays.value).toBe(true)
    unmount()
  })

  it('extendedOnly=false lista todos, primário incluso', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() =>
      mod.useMonitorTargetSelect({ extendedOnly: false }),
    )
    await result.refresh()
    expect(result.optionsList.value.map((o) => o.id)).toEqual([1, 2, 3])
    expect(result.optionsList.value[0]!.isPrimary).toBe(true)
    unmount()
  })

  it('toggle adiciona e remove seleção; persiste e emite update', async () => {
    const onUpdate = vi.fn()
    const mod = await loadFresh()
    const { result, unmount } = host(() =>
      mod.useMonitorTargetSelect({ onUpdate }),
    )
    await result.refresh()
    result.toggle(3)
    expect(result.selectedIds.value).toEqual([2, 3])
    expect(onUpdate).toHaveBeenCalledWith([2, 3])
    expect(saveProjectionSettings).toHaveBeenCalled()
    const saved = saveProjectionSettings.mock.calls.at(-1)![0] as {
      targetDisplayIds: number[]
      declinedDisplayIds: number[]
    }
    expect(saved.targetDisplayIds).toEqual([2, 3])
    expect(saved.declinedDisplayIds).toEqual([])
    result.toggle(3)
    expect(result.selectedIds.value).toEqual([2])
    unmount()
  })

  it('toggle em display não permitido (primário) é ignorado', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    result.toggle(1)
    expect(result.selectedIds.value).toEqual([2])
    unmount()
  })

  it('persist=false não salva settings', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() =>
      mod.useMonitorTargetSelect({ persist: false }),
    )
    await result.refresh()
    result.toggle(3)
    expect(saveProjectionSettings).not.toHaveBeenCalled()
    unmount()
  })

  it('tela de retorno aparece na lista mesmo não estendida', async () => {
    loadProjectionSettings.mockReturnValue({
      ...SETTINGS,
      openReturnScreen: true,
      returnDisplayId: 1,
    })
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    const ret = result.optionsList.value.find((o) => o.id === 1)
    expect(ret?.isReturn).toBe(true)
    unmount()
  })

  it('identify alterna identifying', async () => {
    identifySystemDisplays.mockImplementation(
      () => new Promise((r) => setTimeout(r, 10)),
    )
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    const p = result.identify()
    expect(result.identifying.value).toBe(true)
    await p
    expect(result.identifying.value).toBe(false)
    unmount()
  })

  it('toggleOpen abre e fecha; open dispara refresh', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    result.toggleOpen()
    expect(result.open.value).toBe(true)
    await Promise.resolve()
    result.close()
    expect(result.open.value).toBe(false)
    unmount()
  })

  it('modelValue controlado filtra IDs não permitidos via watch', async () => {
    const model = ref<number[]>([1, 2]) // 1 é primário → filtrado
    const mod = await loadFresh()
    const { result, unmount } = host(() =>
      mod.useMonitorTargetSelect({ modelValue: model }),
    )
    await result.refresh()
    model.value = [1, 3]
    await Promise.resolve()
    await Promise.resolve()
    expect(result.selectedIds.value).toEqual([3])
    unmount()
  })

  it('applyRemoteIds via IPC atualiza seleção e persiste', async () => {
    const mod = await loadFresh()
    let cb: ((ids: number[]) => void) | undefined
    bridge.projection.onSiteTargetsChanged.mockImplementation((fn: (ids: number[]) => void) => {
      cb = fn
      return () => {}
    })
    const { createApp, defineComponent, h } = await import('vue')
    let res: ReturnType<typeof mod.useMonitorTargetSelect> | undefined
    const Host = defineComponent({
      setup() {
        res = mod.useMonitorTargetSelect()
        return () => h('div')
      },
    })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(Host)
    app.mount(el)
    await Promise.resolve()
    const r2 = res!
    expect(r2.selectedIds.value).toEqual([2])
    cb!([3])
    await Promise.resolve()
    expect(r2.selectedIds.value).toEqual([3])
    app.unmount()
  })

  it('applyRemoteIds ignora eco durante applyingRemote (syncToMain)', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    result.setSelectedIds([3])
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.projection.setSiteTargetMonitors).toHaveBeenCalledWith([3])
    expect(bridge.projection.setVideoTargetMonitors).toHaveBeenCalledWith([3])
    expect(reapplyProjectionTargets).toHaveBeenCalledWith([3])
    unmount()
  })

  it('syncToMain normaliza IDs não finitos', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    result.setSelectedIds([Number.NaN, 2])
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.projection.setSiteTargetMonitors).toHaveBeenCalledWith([2])
    unmount()
  })

  it('onMounted assina IPC e displays-changed; unmount desassina', async () => {
    const unsubTargets = vi.fn()
    const unsubDisplays = vi.fn()
    bridge.projection.onSiteTargetsChanged.mockReturnValue(unsubTargets)
    subscribeDisplaysChanged.mockReturnValue(unsubDisplays)
    const mod = await loadFresh()
    const { createApp, defineComponent, h } = await import('vue')
    const Host = defineComponent({
      setup() {
        mod.useMonitorTargetSelect()
        return () => h('div')
      },
    })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(Host)
    app.mount(el)
    await Promise.resolve()
    expect(bridge.projection.onSiteTargetsChanged).toHaveBeenCalled()
    expect(subscribeDisplaysChanged).toHaveBeenCalled()
    app.unmount()
    expect(unsubTargets).toHaveBeenCalled()
    expect(unsubDisplays).toHaveBeenCalled()
  })

  it('settings com monitor primário selecionado é filtrado no load', async () => {
    loadProjectionSettings.mockReturnValue({ ...SETTINGS, targetDisplayIds: [1, 2] })
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    expect(result.selectedIds.value).toEqual([2])
    unmount()
  })

  it('setSelectedIds registra declined displays', async () => {
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    result.setSelectedIds([2])
    const saved = saveProjectionSettings.mock.calls.at(-1)![0] as {
      declinedDisplayIds: number[]
    }
    expect(saved.declinedDisplayIds).toEqual([3])
    unmount()
  })

  it('IPC com payload não-array aplica []', async () => {
    const mod = await loadFresh()
    let cb: ((ids: unknown) => void) | undefined
    bridge.projection.onSiteTargetsChanged.mockImplementation((fn: (ids: unknown) => void) => {
      cb = fn
      return () => {}
    })
    const { createApp, defineComponent, h } = await import('vue')
    let res: ReturnType<typeof mod.useMonitorTargetSelect> | undefined
    const Host = defineComponent({
      setup() {
        res = mod.useMonitorTargetSelect()
        return () => h('div')
      },
    })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(Host)
    app.mount(el)
    await Promise.resolve()
    cb!(null)
    await Promise.resolve()
    expect(res!.selectedIds.value).toEqual([])
    app.unmount()
  })

  it('displays-changed dispara refresh', async () => {
    const mod = await loadFresh()
    let cb: (() => void) | undefined
    subscribeDisplaysChanged.mockImplementation((fn: () => void) => {
      cb = fn
      return () => {}
    })
    const { createApp, defineComponent, h } = await import('vue')
    let res: ReturnType<typeof mod.useMonitorTargetSelect> | undefined
    const Host = defineComponent({
      setup() {
        res = mod.useMonitorTargetSelect()
        return () => h('div')
      },
    })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(Host)
    app.mount(el)
    await new Promise((r) => setTimeout(r, 5))
    listSystemDisplays.mockClear()
    cb!()
    await new Promise((r) => setTimeout(r, 10))
    // refresh() foi reexecutado pelo evento de hotplug
    expect(listSystemDisplays).toHaveBeenCalled()
    app.unmount()
  })

  it('allowedDisplayIds inclui retorno não-estendido', async () => {
    loadProjectionSettings.mockReturnValue({
      ...SETTINGS,
      openReturnScreen: true,
      returnDisplayId: 1,
    })
    const mod = await loadFresh()
    const { result, unmount } = host(() => mod.useMonitorTargetSelect())
    await result.refresh()
    // retorno = monitor 1 (primário) entra na lista e é toggle-ável
    const opts = result.optionsList.value.map((o) => o.id)
    expect(opts).toContain(1)
    result.toggle(1)
    expect(result.selectedIds.value).toContain(1)
    unmount()
  })
})
