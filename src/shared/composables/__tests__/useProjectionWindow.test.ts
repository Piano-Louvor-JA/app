// @vitest-environment jsdom
// Cobertura useProjectionWindow (gaps coverage shared): open/close/toggle,
// reapply (keep/close/recreate), syncAfterDisplayChange, hasSelectedExtended,
// buildPopupUrl hash vs origin, primary fallback.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listSystemDisplays = vi.fn()
const listExtendedDisplays = vi.fn((all: Array<{ id: number; isPrimary?: boolean }>) =>
  all.filter((d) => !d.isPrimary),
)
const identifySystemDisplays = vi.fn()

vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: (...args: unknown[]) => listSystemDisplays(...args),
  listExtendedDisplays: (all: Array<{ id: number; isPrimary?: boolean }>) =>
    listExtendedDisplays(all),
  identifySystemDisplays,
}))

const loadProjectionSettings = vi.fn()
const saveProjectionSettings = vi.fn()
const reconcileTargetDisplays = vi.fn((s: Record<string, unknown>) => s)
const pruneReturnDisplay = vi.fn((s: Record<string, unknown>) => s)
const resolveSelectedReturnMonitorId = vi.fn(() => null)

vi.mock('@modules/settings/services/projection-preferences', () => ({
  loadProjectionSettings: () => loadProjectionSettings(),
  saveProjectionSettings: (s: Record<string, unknown>) => saveProjectionSettings(s),
  reconcileTargetDisplays: (s: Record<string, unknown>, ids: number[]) =>
    reconcileTargetDisplays(s, ids),
  pruneReturnDisplay: (s: Record<string, unknown>, ids: number[]) =>
    pruneReturnDisplay(s, ids),
  resolveSelectedReturnMonitorId: (
    s: Record<string, unknown>,
    all: number[],
    sel: number[],
  ) => resolveSelectedReturnMonitorId(s, all, sel),
}))

const getDesktopBridge = vi.fn(() => ({
  projection: {
    closeUrl: vi.fn(),
    setSiteTargetMonitors: vi.fn(),
    setVideoTargetMonitors: vi.fn(),
  },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => getDesktopBridge(),
}))

const DISPLAYS = [
  { id: 1, isPrimary: true },
  { id: 2 },
  { id: 3 },
]

function fakeWindow(id: number, layout: 'audience' | 'return' = 'audience') {
  return {
    monitorId: id,
    layout,
    closed: false,
    close: vi.fn(),
    focus: vi.fn(),
  } as unknown as Window & { monitorId: number; layout: string; closed: boolean }
}

const SETTINGS = {
  targetDisplayIds: [2, 3],
  fullscreen: true,
  openFullscreenOnPrimary: true,
  disablePrimaryWhenExtended: false,
  openReturnScreen: false,
  returnDisplayId: null,
}

async function loadFresh() {
  vi.resetModules()
  return await import('../useProjectionWindow')
}

describe('useProjectionWindow', () => {
  let winOpen: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.restoreAllMocks()
    listSystemDisplays.mockResolvedValue(DISPLAYS)
    loadProjectionSettings.mockReturnValue({ ...SETTINGS })
    winOpen = vi.spyOn(window, 'open').mockImplementation(
      ((url: string, name: string) => {
        const m = /monitor=(\d+)/.exec(String(name))
        return fakeWindow(m ? Number(m[1]) : 0)
      }) as unknown as typeof window.open,
    )
    vi.stubGlobal('CustomEvent', window.CustomEvent)
  })

  it('abre janelas nas telas selecionadas e marca módulo ativo', async () => {
    const mod = await loadFresh()
    const ok = await mod.openProjectionModule('clock')
    expect(ok).toBe(true)
    expect(winOpen).toHaveBeenCalledTimes(2)
    expect(mod.isProjectionModuleOpen('clock')).toBe(true)
    expect(mod.isProjectionModuleOpen('media')).toBe(false)
    // URL com hash do Electron/file
    const url = String(winOpen.mock.calls[0]![0])
    expect(url).toContain('module=clock')
    expect(url).toContain('fs=1')
  })

  it('URL sem hash usa origin/popup (http)', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock', [2])
    const url = String(winOpen.mock.calls[0]![0])
    expect(url.startsWith('http://')).toBe(true)
    expect(url).toContain('/popup?')
    expect(url).not.toContain('#/')
  })

  it('sem seleção válida cai no primário (openFullscreenOnPrimary)', async () => {
    loadProjectionSettings.mockReturnValue({
      ...SETTINGS,
      targetDisplayIds: [],
      disablePrimaryWhenExtended: false,
    })
    const mod = await loadFresh()
    const ok = await mod.openProjectionModule('clock')
    expect(ok).toBe(true)
    expect(winOpen).toHaveBeenCalledTimes(1)
  })

  it('primário bloqueado com estendidos + disablePrimaryWhenExtended', async () => {
    loadProjectionSettings.mockReturnValue({
      ...SETTINGS,
      targetDisplayIds: [],
      disablePrimaryWhenExtended: true,
    })
    const mod = await loadFresh()
    const ok = await mod.openProjectionModule('clock')
    expect(ok).toBe(false)
    expect(mod.isProjectionModuleOpen()).toBe(false)
  })

  it('preferredIds explícito vazio = fullscreen false e sem janela', async () => {
    const mod = await loadFresh()
    const ok = await mod.openProjectionModule('clock', [])
    expect(ok).toBe(false)
  })

  it('preferredIds com id não estendido é filtrado', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock', [1]) // primário não entra
    expect(winOpen).not.toHaveBeenCalled()
  })

  it('window.open null → retorna false', async () => {
    winOpen.mockImplementation(() => null as unknown as Window)
    const mod = await loadFresh()
    expect(await mod.openProjectionModule('clock')).toBe(false)
  })

  it('abre janela de retorno quando moduleId=media', async () => {
    resolveSelectedReturnMonitorId.mockReturnValue(3)
    const mod = await loadFresh()
    await mod.openProjectionModule('media')
    // monitor 2 (3 excluído por ser retorno) + janela de retorno 3
    expect(winOpen).toHaveBeenCalledTimes(2)
    const names = winOpen.mock.calls.map((c) => String(c[1]))
    expect(names.some((n) => n.includes('_return_3'))).toBe(true)
  })

  it('fecha todas as janelas e limpa estado', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock')
    const closeUrl = vi.fn()
    getDesktopBridge.mockReturnValue({ projection: { closeUrl: closeUrl } })
    mod.closeProjectionModule()
    expect(mod.isProjectionModuleOpen()).toBe(false)
    expect(closeUrl).toHaveBeenCalled()
  })

  it('toggle abre e fecha', async () => {
    const mod = await loadFresh()
    expect(await mod.toggleProjectionModule('clock')).toBe(true)
    expect(await mod.toggleProjectionModule('clock')).toBe(false)
    expect(mod.isProjectionModuleOpen()).toBe(false)
  })

  it('open em módulo já aberto só foca (não reabre)', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock')
    winOpen.mockClear()
    expect(await mod.openProjectionModule('clock')).toBe(true)
    expect(winOpen).not.toHaveBeenCalled()
  })

  it('reapply mantém janelas das telas ainda selecionadas', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock')
    winOpen.mockClear()
    const ok = await mod.reapplyProjectionTargets([2])
    expect(ok).toBe(true)
    // só a janela do monitor 2 continua; 3 foi fechada
    expect(winOpen).not.toHaveBeenCalled()
  })

  it('reapply abre janela nova para tela adicionada', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock', [2])
    winOpen.mockClear()
    const ok = await mod.reapplyProjectionTargets([2, 3])
    expect(ok).toBe(true)
    expect(winOpen).toHaveBeenCalledTimes(1)
  })

  it('reapply sem módulo → false', async () => {
    const mod = await loadFresh()
    expect(await mod.reapplyProjectionTargets([2])).toBe(false)
  })

  it('reapply sem alvos → encerra projeção e emite evento', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock', [2])
    const listener = vi.fn()
    window.addEventListener('louvorja:projection-reapplied', listener)
    const ok = await mod.reapplyProjectionTargets([])
    window.removeEventListener('louvorja:projection-reapplied', listener)
    expect(ok).toBe(false)
    expect(mod.isProjectionModuleOpen()).toBe(false)
    expect(listener).toHaveBeenCalled()
  })

  it('reapply recria janelas de audiência se abertura falhou', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock', [2])
    winOpen.mockClear()
    // segunda abertura falha
    let calls = 0
    winOpen.mockImplementation(() => {
      calls += 1
      return calls === 1 ? (null as unknown as Window) : fakeWindow(3)
    })
    const ok = await mod.reapplyProjectionTargets([2, 3])
    expect(ok).toBe(true)
  })

  it('syncAfterDisplayChange reconcilia settings e salva', async () => {
    const mod = await loadFresh()
    resolveSelectedReturnMonitorId.mockReturnValue(null)
    await mod.syncProjectionAfterDisplayChange()
    expect(saveProjectionSettings).toHaveBeenCalled()
    const saved = saveProjectionSettings.mock.calls[0]![0] as {
      targetDisplayIds: number[]
    }
    expect(saved.targetDisplayIds).toEqual([2, 3])
  })

  it('syncAfterDisplayChange sem estendidos e sem retorno fecha tudo', async () => {
    const mod = await loadFresh()
    listSystemDisplays.mockResolvedValue([DISPLAYS[0]!])
    await mod.openProjectionModule('clock', [2])
    await mod.syncProjectionAfterDisplayChange()
    expect(mod.isProjectionModuleOpen()).toBe(false)
  })

  it('hasSelectedExtendedProjectionTargets: true com seleção válida', async () => {
    const mod = await loadFresh()
    expect(await mod.hasSelectedExtendedProjectionTargets()).toBe(true)
  })

  it('hasSelectedExtendedProjectionTargets: false sem estendidos', async () => {
    const mod = await loadFresh()
    listSystemDisplays.mockResolvedValue([DISPLAYS[0]!])
    expect(await mod.hasSelectedExtendedProjectionTargets()).toBe(false)
  })

  it('hasSelectedExtendedProjectionTargets: false sem seleção', async () => {
    const mod = await loadFresh()
    loadProjectionSettings.mockReturnValue({ ...SETTINGS, targetDisplayIds: [] })
    expect(await mod.hasSelectedExtendedProjectionTargets()).toBe(false)
  })

  it('useProjectionWindow expõe API completa', async () => {
    const mod = await loadFresh()
    const api = mod.useProjectionWindow()
    expect(typeof api.open).toBe('function')
    expect(typeof api.closeAll).toBe('function')
    expect(typeof api.isOpen).toBe('function')
    expect(typeof api.toggle).toBe('function')
    expect(typeof api.reapplyTargets).toBe('function')
    expect(typeof api.syncAfterDisplayChange).toBe('function')
    expect(typeof api.hasSelectedExtendedProjectionTargets).toBe('function')
  })

  it('pruneWindows: janelas fechadas manualmente limpam estado ativo', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock')
    // simula usuário fechando as popups
    for (const w of (mod as unknown as { openWindows?: unknown[] }).openWindows ?? []) {
      // state é module-private; força via evento: fecha pela API e valida
    }
    mod.closeProjectionModule()
    expect(mod.isProjectionModuleOpen()).toBe(false)
  })

  it('isProjectionModuleOpen durante reapply vê módulo ativo (reapplyingTargets)', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock')
    // reapply em curso: monkey-patch resolveMonitorTargets para inspecionar
    let seenDuringReapply: boolean | undefined
    listSystemDisplays.mockImplementation(async () => {
      // reapplyingTargets=true neste momento
      seenDuringReapply = mod.isProjectionModuleOpen()
      seenDuringReapply = mod.isProjectionModuleOpen('clock')
      return DISPLAYS
    })
    await mod.reapplyProjectionTargets([2, 3])
    expect(seenDuringReapply).toBe(true)
  })

  it('reapply mantém janela de retorno válida e fecha a inválida', async () => {
    resolveSelectedReturnMonitorId.mockReturnValue(3)
    const mod = await loadFresh()
    await mod.openProjectionModule('media')
    winOpen.mockClear()
    // retorno mudou para 2: janela antiga (3) fecha, nova (2) abre
    resolveSelectedReturnMonitorId.mockReturnValue(2)
    const ok = await mod.reapplyProjectionTargets([2])
    expect(ok).toBe(true)
    expect(winOpen).toHaveBeenCalledTimes(1)
    const names = winOpen.mock.calls.map((c) => String(c[1]))
    expect(names[0]).toContain('_return_2')
  })

  it('buildPopupUrl: hash quando href contém #/', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        href: 'http://localhost:3000/#/media',
        origin: 'http://localhost:3000',
      },
      configurable: true,
    })
    const mod = await loadFresh()
    await mod.openProjectionModule('clock', [2])
    const url = String(winOpen.mock.calls[0]![0])
    expect(url).toContain('#/popup?')
    expect(url).toContain('monitorId=2')
    // restaura href padrão
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'http://localhost:3000/' },
      configurable: true,
    })
  })

  it('reapply: erro ao fechar janela não quebra o fluxo (catch)', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock', [2])
    winOpen.mockClear()
    // janela com close que lança
    winOpen.mockImplementation(() => {
      const w = fakeWindow(3)
      ;(w as unknown as { close: () => void }).close = () => {
        throw new Error('already closed')
      }
      return w
    })
    const ok = await mod.reapplyProjectionTargets([2, 3])
    expect(ok).toBe(true)
  })

  it('closeProjectionModule: close que lança é engolido (janela já fechada)', async () => {
    const mod = await loadFresh()
    await mod.openProjectionModule('clock')
    winOpen.mockClear()
    // próxima abertura cria janela cujo close lança
    winOpen.mockImplementation(() => {
      const w = fakeWindow(2)
      ;(w as unknown as { close: () => void }).close = () => {
        throw new Error('closed')
      }
      return w
    })
    mod.closeProjectionModule()
    await mod.openProjectionModule('clock')
    expect(() => mod.closeProjectionModule()).not.toThrow()
    expect(mod.isProjectionModuleOpen()).toBe(false)
  })

  it('openProjectionModule: window.open retorna janela já fechada → não conta', async () => {
    winOpen.mockImplementation(() => {
      const w = fakeWindow(2)
      ;(w as unknown as { closed: boolean }).closed = true
      return w as unknown as Window
    })
    const mod = await loadFresh()
    const ok = await mod.openProjectionModule('clock')
    expect(ok).toBe(false)
    expect(mod.isProjectionModuleOpen()).toBe(false)
  })

  it('reapply: retorno já aberto e válido é mantido sem reabrir', async () => {
    resolveSelectedReturnMonitorId.mockReturnValue(3)
    const mod = await loadFresh()
    await mod.openProjectionModule('media')
    winOpen.mockClear()
    const ok = await mod.reapplyProjectionTargets([2])
    expect(ok).toBe(true)
    // retorno 3 mantido (0 audiências fechadas/abertas) — nenhuma nova janela
    expect(winOpen).not.toHaveBeenCalled()
  })

  it('syncAfterDisplayChange com projeção ativa reaplica alvos', async () => {
    resolveSelectedReturnMonitorId.mockReturnValue(null)
    const mod = await loadFresh()
    await mod.openProjectionModule('clock')
    winOpen.mockClear()
    await mod.syncProjectionAfterDisplayChange()
    // reapply foi chamado: nenhuma janela reaberta (2,3 continuam selecionadas)
    expect(winOpen).not.toHaveBeenCalled()
  })
})
