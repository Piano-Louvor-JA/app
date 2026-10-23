// @vitest-environment jsdom
// Projeção independente: um módulo em UM monitor estendido, por cima da
// projeção principal, sem fechá-la.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const listSystemDisplays = vi.fn()
type DisplaysListener = (displays: Array<{ id: number; isPrimary: boolean }>) => void
const listeners = new Set<DisplaysListener>()
const unsubscribe = vi.fn()
function emitDisplays(displays: Array<{ id: number; isPrimary: boolean }>) {
  for (const listener of [...listeners]) listener(displays)
}

vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: () => listSystemDisplays(),
  listExtendedDisplays: (all: Array<{ id: number; isPrimary: boolean }>) =>
    all.filter((display) => !display.isPrimary),
  formatDisplayResolution: () => '1920 × 1080',
  subscribeDisplaysChanged: (cb: DisplaysListener) => {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
      unsubscribe()
    }
  },
}))

const openProjectionPopupWindow = vi.fn()
vi.mock('@shared/composables/useProjectionWindow', () => ({
  openProjectionPopupWindow: (...args: unknown[]) => openProjectionPopupWindow(...args),
}))

const DISPLAYS = [
  { id: 1, isPrimary: true },
  { id: 2, isPrimary: false },
  { id: 3, isPrimary: false },
]

type FakeWin = { closed: boolean; close: ReturnType<typeof vi.fn> }

function fakeWindow(): FakeWin {
  const win: FakeWin = { closed: false, close: vi.fn() }
  win.close.mockImplementation(() => {
    win.closed = true
  })
  return win
}

async function loadFresh() {
  vi.resetModules()
  return await import('../useIndependentProjection')
}

describe('useIndependentProjection', () => {
  beforeEach(() => {
    vi.useRealTimers()
    listSystemDisplays.mockReset().mockResolvedValue(DISPLAYS)
    openProjectionPopupWindow.mockReset().mockImplementation(() => fakeWindow())
    unsubscribe.mockReset()
    listeners.clear()
  })

  it('abre o módulo no monitor estendido escolhido, marcado como independente', async () => {
    const mod = await loadFresh()
    const ok = await mod.openIndependentProjection('clock', 3)

    expect(ok).toBe(true)
    expect(openProjectionPopupWindow).toHaveBeenCalledWith('clock', 3, { independent: true })
    expect(mod.getIndependentMonitor('clock')).toBe(3)
    expect(mod.isIndependentProjectionActive('clock')).toBe(true)
  })

  it('recusa monitor principal ou inexistente', async () => {
    const mod = await loadFresh()
    expect(await mod.openIndependentProjection('clock', 1)).toBe(false)
    expect(await mod.openIndependentProjection('clock', 99)).toBe(false)
    expect(openProjectionPopupWindow).not.toHaveBeenCalled()
    expect(mod.getIndependentMonitor('clock')).toBeNull()
  })

  it('retorna false se a janela não abrir', async () => {
    openProjectionPopupWindow.mockReturnValue(null)
    const mod = await loadFresh()
    expect(await mod.openIndependentProjection('clock', 2)).toBe(false)
    expect(mod.getIndependentMonitor('clock')).toBeNull()
  })

  it('mesmo módulo no mesmo monitor não reabre a janela', async () => {
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 2)
    await mod.openIndependentProjection('clock', 2)
    expect(openProjectionPopupWindow).toHaveBeenCalledTimes(1)
  })

  it('trocar o monitor do módulo fecha a janela anterior', async () => {
    const first = fakeWindow()
    openProjectionPopupWindow.mockReturnValueOnce(first)
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 2)
    await mod.openIndependentProjection('clock', 3)

    expect(first.close).toHaveBeenCalled()
    expect(mod.getIndependentMonitor('clock')).toBe(3)
  })

  it('um monitor só aceita uma independente: o último módulo assume', async () => {
    const clockWin = fakeWindow()
    openProjectionPopupWindow.mockReturnValueOnce(clockWin)
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 3)
    await mod.openIndependentProjection('timer', 3)

    expect(clockWin.close).toHaveBeenCalled()
    expect(mod.getIndependentMonitor('clock')).toBeNull()
    expect(mod.getIndependentMonitor('timer')).toBe(3)
  })

  it('módulos diferentes em monitores diferentes convivem', async () => {
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 2)
    await mod.openIndependentProjection('timer', 3)
    expect(mod.getIndependentMonitor('clock')).toBe(2)
    expect(mod.getIndependentMonitor('timer')).toBe(3)
  })

  it('encerrar fecha só a janela do módulo', async () => {
    const clockWin = fakeWindow()
    const timerWin = fakeWindow()
    openProjectionPopupWindow.mockReturnValueOnce(clockWin).mockReturnValueOnce(timerWin)
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 2)
    await mod.openIndependentProjection('timer', 3)
    mod.closeIndependentProjection('clock')

    expect(clockWin.close).toHaveBeenCalled()
    expect(timerWin.close).not.toHaveBeenCalled()
    expect(mod.getIndependentMonitor('clock')).toBeNull()
    expect(mod.getIndependentMonitor('timer')).toBe(3)
    mod.closeIndependentProjection('clock')
  })

  it('closeAll encerra todas', async () => {
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 2)
    await mod.openIndependentProjection('timer', 3)
    mod.closeAllIndependentProjections()
    expect(mod.getIndependentMonitor('clock')).toBeNull()
    expect(mod.getIndependentMonitor('timer')).toBeNull()
  })

  it('janela fechada por fora some do registro', async () => {
    vi.useFakeTimers()
    const win = fakeWindow()
    openProjectionPopupWindow.mockReturnValueOnce(win)
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 2)
    win.closed = true
    vi.advanceTimersByTime(1000)
    expect(mod.getIndependentMonitor('clock')).toBeNull()
    vi.useRealTimers()
  })

  it('close() que lança não quebra o encerramento', async () => {
    const win = fakeWindow()
    win.close.mockImplementation(() => {
      throw new Error('gone')
    })
    openProjectionPopupWindow.mockReturnValueOnce(win)
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 2)
    expect(() => mod.closeIndependentProjection('clock')).not.toThrow()
    expect(mod.getIndependentMonitor('clock')).toBeNull()
  })

  it('monitor desconectado encerra a independente dele', async () => {
    const win = fakeWindow()
    openProjectionPopupWindow.mockReturnValueOnce(win)
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 3)
    emitDisplays([
      { id: 1, isPrimary: true },
      { id: 2, isPrimary: false },
    ])
    expect(win.close).toHaveBeenCalled()
    expect(mod.getIndependentMonitor('clock')).toBeNull()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('hotplug que mantém o monitor não encerra', async () => {
    const mod = await loadFresh()
    await mod.openIndependentProjection('clock', 3)
    emitDisplays(DISPLAYS)
    expect(mod.getIndependentMonitor('clock')).toBe(3)
  })

  it('devolve o foco ao operador após abrir', async () => {
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {
      throw new Error('blocked')
    })
    const mod = await loadFresh()
    expect(await mod.openIndependentProjection('clock', 2)).toBe(true)
    expect(focus).toHaveBeenCalled()
    focus.mockRestore()
  })
})

describe('useIndependentProjectionControl', () => {
  beforeEach(() => {
    listSystemDisplays.mockReset().mockResolvedValue(DISPLAYS)
    openProjectionPopupWindow.mockReset().mockImplementation(() => fakeWindow())
    listeners.clear()
  })

  async function mountControl(moduleId = 'clock') {
    const mod = await loadFresh()
    let api!: ReturnType<typeof mod.useIndependentProjectionControl>
    const Comp = defineComponent({
      setup() {
        api = mod.useIndependentProjectionControl(moduleId)
        return () => h('div')
      },
    })
    const wrapper = mount(Comp)
    await vi.waitFor(() => expect(api.loaded.value).toBe(true))
    return { mod, api, wrapper }
  }

  it('lista só os estendidos com o número do monitor', async () => {
    const { api } = await mountControl()
    expect(api.available.value).toBe(true)
    expect(api.monitors.value.map((m) => [m.id, m.index])).toEqual([
      [2, 2],
      [3, 3],
    ])
    expect(api.monitors.value[0]?.resolutionLabel).toBe('1920 × 1080')
  })

  it('sem estendidos fica indisponível', async () => {
    listSystemDisplays.mockResolvedValue([{ id: 1, isPrimary: true }])
    const { api } = await mountControl()
    expect(api.available.value).toBe(false)
    expect(api.monitors.value).toEqual([])
  })

  it('hotplug atualiza a disponibilidade', async () => {
    listSystemDisplays.mockResolvedValue([{ id: 1, isPrimary: true }])
    const { api } = await mountControl()
    emitDisplays(DISPLAYS)
    await nextTick()
    expect(api.available.value).toBe(true)
  })

  it('project/stop refletem o monitor ativo do módulo', async () => {
    const { api, mod } = await mountControl('timer')
    expect(api.activeMonitorId.value).toBeNull()
    await api.project(2)
    expect(api.activeMonitorId.value).toBe(2)
    expect(mod.getIndependentMonitor('timer')).toBe(2)
    api.stop()
    expect(api.activeMonitorId.value).toBeNull()
  })

  it('para de ouvir hotplug ao desmontar', async () => {
    const { wrapper } = await mountControl()
    wrapper.unmount()
    expect(listeners.size).toBe(0)
  })

  it('hotplug antes da leitura inicial prevalece', async () => {
    let resolveList!: (value: typeof DISPLAYS) => void
    listSystemDisplays.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve
      }),
    )
    const mod = await loadFresh()
    let api!: ReturnType<typeof mod.useIndependentProjectionControl>
    mount(
      defineComponent({
        setup() {
          api = mod.useIndependentProjectionControl('clock')
          return () => h('div')
        },
      }),
    )
    await nextTick()
    emitDisplays([{ id: 1, isPrimary: true }])
    resolveList(DISPLAYS)
    await vi.waitFor(() => expect(api.loaded.value).toBe(true))
    expect(api.available.value).toBe(false)
  })
})
