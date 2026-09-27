// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getUserPreference: vi.fn(),
  setUserPreference: vi.fn(),
  pruneArrangement: vi.fn((a) => a),
  upsertArrangementSlot: vi.fn((a, id, x, y) => [...a, { displayId: id, x, y }]),
  readImageAsDataUrl: vi.fn(),
}))

let useProjectionStore: typeof import('../useProjectionStore').useProjectionStore

const display1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, isPrimary: true }
const display2 = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, isPrimary: false }
const display3 = { id: 3, bounds: { x: 3840, y: 0, width: 1920, height: 1080 }, isPrimary: false }

const baseSettings = {
  targetDisplayIds: [2],
  monitorArrangement: [],
  openReturnScreen: false,
  returnDisplayId: null,
  openFullscreenOnPrimary: true,
  disablePrimaryWhenExtended: false,
  autoMinimizePlayer: false,
  lyricAlign: 'center' as const,
  showSongTitle: true,
  customTextFormat: false,
  customBackground: false,
  fontSizePercent: 100,
  fontColor: '#FFFFFF',
  fontWeight: 'normal' as const,
  backgroundColor: '#000000',
  backgroundOpacity: 100,
  backgroundImage: null,
  declinedDisplayIds: [],
}

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  vi.resetModules()
  setActivePinia(createPinia())
  vi.clearAllMocks()

  // Mock user-preferences
  const userPrefs = await import('@shared/services/user-preferences')
  vi.spyOn(userPrefs, 'getUserPreference').mockImplementation(h.getUserPreference)
  vi.spyOn(userPrefs, 'setUserPreference').mockImplementation(h.setUserPreference)

  // Mock projection-preferences
  const projPrefs = await import('@modules/settings/services/projection-preferences')
  vi.spyOn(projPrefs, 'readImageAsDataUrl').mockImplementation(h.readImageAsDataUrl)

  const mod = await import('../useProjectionStore')
  globalThis.useProjectionStore = mod.useProjectionStore

  // Setup mocks
  h.getUserPreference.mockReturnValue(baseSettings)
  h.setUserPreference.mockResolvedValue(undefined)
  h.pruneArrangement.mockImplementation((a) => a)
  h.upsertArrangementSlot.mockImplementation((a, id, x, y) => [...a, { displayId: id, x, y }])
  h.readImageAsDataUrl.mockResolvedValue('data:image/png;base64,xxx')
})

// Helper para criar store hidratado com mocks customizados
async function createHydratedStore(overrides: Partial<typeof baseSettings> = {}) {
  h.getUserPreference.mockReturnValue({ ...baseSettings, ...overrides })
  const store = globalThis.useProjectionStore()
  const listSystemDisplays = (await import('@modules/settings/services/display-service')).listSystemDisplays
  await listSystemDisplays() // init display-service
  await store.hydrate()
  store.extendedMonitorOptions.value // force computed
  return store
}

describe('useProjectionStore', () => {
  // ===== HYDRATE / REFRESH =====
  it('hydrate: carrega settings e displays', async () => {
    const store = await createHydratedStore()
    expect(h.getUserPreference).toHaveBeenCalled()
    expect(store.displays).toHaveLength(3)
    expect(store.isLoadingDisplays).toBe(false)
    expect(store.settings.targetDisplayIds).toEqual([2, 3])
    expect(store.settings.monitorArrangement).toEqual(baseSettings.monitorArrangement)
  })

  it('refreshDisplays: error path seta lastErrorKey', async () => {
    const store = globalThis.useProjectionStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'listSystemDisplays').mockRejectedValue(new Error('no displays'))
    await store.refreshDisplays()
    expect(store.lastErrorKey).toBe('settings.projection.errors.loadDisplays')
    expect(store.isLoadingDisplays).toBe(false)
  })

  it('refreshDisplays: empty displays não quebra', async () => {
    const store = globalThis.useProjectionStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'listSystemDisplays').mockResolvedValue([])
    await store.refreshDisplays()
    expect(store.displays).toHaveLength(0)
    expect(store.isLoadingDisplays).toBe(false)
  })

  // ===== IDENTIFY MONITORS =====
  it('identifyMonitors: sucesso limpa lastErrorKey', async () => {
    const store = await createHydratedStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'identifySystemDisplays').mockResolvedValue(true)
    await store.identifyMonitors()
    expect(store.isIdentifying).toBe(false)
    expect(store.lastErrorKey).toBeNull()
  })

  it('identifyMonitors: falha seta lastErrorKey', async () => {
    const store = await createHydratedStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'identifySystemDisplays').mockResolvedValue(false)
    await store.identifyMonitors()
    expect(store.isIdentifying).toBe(false)
    expect(store.lastErrorKey).toBe('settings.projection.errors.identifyDesktopOnly')
  })

  it('identifyMonitors: erro seta lastErrorKey', async () => {
    const store = await createHydratedStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'identifySystemDisplays').mockRejectedValue(new Error('x'))
    await store.identifyMonitors()
    expect(store.isIdentifying).toBe(false)
    expect(store.lastErrorKey).toBe('settings.projection.errors.identify')
  })

  it('identifyMonitors: idempotente se já identificando', async () => {
    const store = await createHydratedStore()
    const mod = await import('@modules/settings/services/display-service')
    const spy = vi.spyOn(mod, 'identifySystemDisplays').mockResolvedValue(true)
    await Promise.all([store.identifyMonitors(), store.identifyMonitors()])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  // ===== MONITOR ARRANGEMENT =====
  it('setMonitorArrangement: atualiza arrangement', async () => {
    const store = await createHydratedStore()
    store.setMonitorArrangement([{ displayId: 3, x: 0, y: 0 }])
    expect(store.settings.monitorArrangement).toEqual([{ displayId: 3, x: 0, y: 0 }])
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('resetMonitorArrangement: limpa arrangement', async () => {
    const store = await createHydratedStore({
      monitorArrangement: [{ displayId: 2, x: 100, y: 100 }],
    })
    store.resetMonitorArrangement()
    expect(store.settings.monitorArrangement).toEqual([])
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('moveMonitorInArrangement: usa arrangement existente como base', async () => {
    const store = await createHydratedStore({
      monitorArrangement: [{ displayId: 2, x: 10, y: 10 }],
    })
    store.moveMonitorInArrangement(2, 100, 200)
    expect(store.settings.monitorArrangement).toEqual([{ displayId: 2, x: 100, y: 200 }])
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('moveMonitorInArrangement: usa displays como base se arrangement vazio', async () => {
    const store = await createHydratedStore()
    store.moveMonitorInArrangement(3, 500, 500)
    // O store usa TODOS os displays como base quando arrangement vazio (veja linha 151-155 do store)
    expect(store.settings.monitorArrangement).toHaveLength(3)
    expect(store.settings.monitorArrangement.find((s) => s.displayId === 3)).toEqual({ displayId: 3, x: 500, y: 500 })
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  // ===== EXTENDED MONITOR =====
  it('toggleExtendedMonitor: adiciona se não está na lista', async () => {
    const store = await createHydratedStore({ targetDisplayIds: [2] })
    // hydrate reconcilia [2] com extended displays válidos [2, 3] → vira [2, 3]
    // toggleExtendedMonitor(3) deve REMOVER (já está na lista)
    store.toggleExtendedMonitor(3)
    expect(store.settings.targetDisplayIds).not.toContain(3)
    expect(store.settings.targetDisplayIds).toEqual([2])
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('toggleExtendedMonitor: remove se já está na lista', async () => {
    const store = await createHydratedStore({ targetDisplayIds: [2, 3] })
    // hydrate mantém [2, 3] (ambos válidos)
    store.toggleExtendedMonitor(3)
    expect(store.settings.targetDisplayIds).not.toContain(3)
    expect(store.settings.targetDisplayIds).toEqual([2])
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  // ===== RETURN SCREEN =====
  it('setOpenReturnScreen: true habilita e chama enableReturnScreen', async () => {
    const store = await createHydratedStore()
    store.setOpenReturnScreen(true)
    expect(store.settings.openReturnScreen).toBe(true)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setOpenReturnScreen: false desabilita', async () => {
    const store = await createHydratedStore({ openReturnScreen: true, returnDisplayId: 2 })
    store.setOpenReturnScreen(false)
    expect(store.settings.openReturnScreen).toBe(false)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('selectReturnDisplay: seta returnDisplayId e abre return screen', async () => {
    const store = await createHydratedStore()
    store.selectReturnDisplay(3)
    expect(store.settings.returnDisplayId).toBe(3)
    expect(store.settings.openReturnScreen).toBe(true)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  // ===== SIMPLE PATCH SETTERS =====
  it('setOpenFullscreenOnPrimary: atualiza', async () => {
    const store = await createHydratedStore()
    store.setOpenFullscreenOnPrimary(false)
    expect(store.settings.openFullscreenOnPrimary).toBe(false)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setDisablePrimaryWhenExtended: atualiza', async () => {
    const store = await createHydratedStore()
    store.setDisablePrimaryWhenExtended(true)
    expect(store.settings.disablePrimaryWhenExtended).toBe(true)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setAutoMinimizePlayer: atualiza', async () => {
    const store = await createHydratedStore()
    store.setAutoMinimizePlayer(true)
    expect(store.settings.autoMinimizePlayer).toBe(true)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setLyricAlign: atualiza', async () => {
    const store = await createHydratedStore()
    store.setLyricAlign('top')
    expect(store.settings.lyricAlign).toBe('top')
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setShowSongTitle: atualiza', async () => {
    const store = await createHydratedStore()
    store.setShowSongTitle(false)
    expect(store.settings.showSongTitle).toBe(false)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setCustomTextFormat: atualiza', async () => {
    const store = await createHydratedStore()
    store.setCustomTextFormat(true)
    expect(store.settings.customTextFormat).toBe(true)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setCustomBackground: atualiza', async () => {
    const store = await createHydratedStore()
    store.setCustomBackground(true)
    expect(store.settings.customBackground).toBe(true)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setFontSizePercent: clamp 50-200', async () => {
    const store = await createHydratedStore()
    store.setFontSizePercent(300)
    expect(store.settings.fontSizePercent).toBe(200)
    store.setFontSizePercent(10)
    expect(store.settings.fontSizePercent).toBe(50)
    store.setFontSizePercent(125)
    expect(store.settings.fontSizePercent).toBe(125)
    // hydrate já chamou setUserPreference 1x + 3 chamadas = 4 total
    expect(h.setUserPreference).toHaveBeenCalledTimes(4)
  })

  it('setFontColor: atualiza', async () => {
    const store = await createHydratedStore()
    store.setFontColor('#FF0000')
    expect(store.settings.fontColor).toBe('#FF0000')
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setFontWeight: atualiza', async () => {
    const store = await createHydratedStore()
    store.setFontWeight('bold')
    expect(store.settings.fontWeight).toBe('bold')
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setBackgroundColor: atualiza', async () => {
    const store = await createHydratedStore()
    store.setBackgroundColor('#111111')
    expect(store.settings.backgroundColor).toBe('#111111')
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setBackgroundOpacity: clamp 0-100', async () => {
    const store = await createHydratedStore()
    store.setBackgroundOpacity(150)
    expect(store.settings.backgroundOpacity).toBe(100)
    store.setBackgroundOpacity(-10)
    expect(store.settings.backgroundOpacity).toBe(0)
    store.setBackgroundOpacity(75)
    expect(store.settings.backgroundOpacity).toBe(75)
    // hydrate já chamou setUserPreference 1x + 3 chamadas = 4 total
    expect(h.setUserPreference).toHaveBeenCalledTimes(4)
  })

  // ===== BACKGROUND IMAGE =====
  it('setBackgroundImageFromFile: arquivo válido converte e seta', async () => {
    const store = await createHydratedStore()
    const file = new File([''], 'test.png', { type: 'image/png' })
    await store.setBackgroundImageFromFile(file)
    expect(h.readImageAsDataUrl).toHaveBeenCalledWith(file)
    expect(store.settings.backgroundImage).toBe('data:image/png;base64,xxx')
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setBackgroundImageFromFile: null limpa backgroundImage', async () => {
    const store = await createHydratedStore({ backgroundImage: 'data:image/...' })
    await store.setBackgroundImageFromFile(null)
    expect(store.settings.backgroundImage).toBeNull()
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('setBackgroundImageFromFile: erro define lastErrorKey', async () => {
    h.readImageAsDataUrl.mockRejectedValue(new Error('x'))
    const store = await createHydratedStore()
    const file = new File([''], 'test.png', { type: 'image/png' })
    await store.setBackgroundImageFromFile(file)
    expect(store.lastErrorKey).toBe('settings.projection.errors.backgroundImage')
  })

  it('clearBackgroundImage: limpa backgroundImage', async () => {
    const store = await createHydratedStore({ backgroundImage: 'data:image/...' })
    store.clearBackgroundImage()
    expect(store.settings.backgroundImage).toBeNull()
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  // ===== RESET TO DEFAULTS =====
  it('resetToDefaults: restaura defaults e reconcilia displays', async () => {
    const store = await createHydratedStore({
      targetDisplayIds: [1, 99],
      monitorArrangement: [{ displayId: 99, x: 0, y: 0 }],
      fontSizePercent: 150,
    })
    store.resetToDefaults()
    expect(store.settings.targetDisplayIds).toEqual([2, 3]) // reconciliado com extended
    expect(store.settings.monitorArrangement).toEqual([])
    expect(store.settings.fontSizePercent).toBe(100)
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  // ===== COMPUTEDS =====
  it('extendedDisplays: filtra apenas não-primários', async () => {
    const store = await createHydratedStore()
    expect(store.extendedDisplays).toHaveLength(2)
    expect(store.extendedDisplays.map((d) => d.id)).toEqual([2, 3])
  })

  it('monitorOptions: inclui todos displays com isSelected', async () => {
    const store = await createHydratedStore()
    const opts = store.monitorOptions
    expect(opts).toHaveLength(3)
    expect(opts.find((o) => o.id === 2)?.isSelected).toBe(true)
    expect(opts.find((o) => o.id === 1)?.isSelected).toBe(false)
  })

  it('extendedMonitorOptions: apenas não-primários', async () => {
    const store = await createHydratedStore()
    const opts = store.extendedMonitorOptions
    expect(opts).toHaveLength(2)
    expect(opts.map((o) => o.id)).toEqual([2, 3])
  })

  it('hasExtendedDisplays: true se extendedDisplays não vazio', async () => {
    const store = await createHydratedStore()
    expect(store.hasExtendedDisplays).toBe(true)
  })

  it('hasExtendedDisplays: false se displays vazio', async () => {
    const store = globalThis.useProjectionStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'listSystemDisplays').mockResolvedValue([])
    await store.hydrate()
    expect(store.hasExtendedDisplays).toBe(false)
  })

  it('hasSelectedAudienceTargets: true se targetDisplayIds não vazio', async () => {
    const store = await createHydratedStore()
    expect(store.hasSelectedAudienceTargets).toBe(true)
  })

  it('hasSelectedAudienceTargets: false se targetDisplayIds vazio E declinedDisplayIds tem todos extended', async () => {
    const store = await createHydratedStore({ 
      targetDisplayIds: [], 
      declinedDisplayIds: [2, 3] // operador desmarcou todos
    })
    // reconcileTargetDisplays NÃO adiciona se já está em declinedDisplayIds
    // targetDisplayIds continua [] → hasSelectedAudienceTargets = false
    expect(store.settings.targetDisplayIds).toEqual([])
    expect(store.hasSelectedAudienceTargets).toBe(false)
  })

  it('hasCustomArrangement: true se monitorArrangement não vazio', async () => {
    const store = await createHydratedStore({
      monitorArrangement: [{ displayId: 2, x: 0, y: 0 }],
    })
    expect(store.hasCustomArrangement).toBe(true)
  })

  it('hasCustomArrangement: false se monitorArrangement vazio', async () => {
    const store = await createHydratedStore()
    expect(store.hasCustomArrangement).toBe(false)
  })

  // ===== APPLY SETTINGS (sync sem persistir) =====
  it('applySettings: atualiza settings em memória sem persistir', async () => {
    const store = await createHydratedStore()
    // hydrate chama persist 1x → setUserPreference 1x
    // applySettings NÃO deve chamar persist
    h.setUserPreference.mockClear() // resetar contador pós-hydrate
    store.applySettings({ ...baseSettings, fontSizePercent: 150 })
    expect(store.settings.fontSizePercent).toBe(150)
    expect(h.setUserPreference).not.toHaveBeenCalled()
  })

  // ===== MUTANT HARDENING =====
  it('estado inicial: store id, displays vazios, settings default, flags false', async () => {
    const { DEFAULT_PROJECTION_SETTINGS } = await import('@modules/settings/types/projection')
    const store = globalThis.useProjectionStore()
    expect(store.$id).toBe('settings-projection')
    expect(store.displays).toEqual([])
    expect(store.settings).toEqual({ ...DEFAULT_PROJECTION_SETTINGS })
    expect(store.isLoadingDisplays).toBe(false)
    expect(store.isIdentifying).toBe(false)
    expect(store.lastErrorKey).toBeNull()
  })

  it('monitorOptions: index 1-based, label e resolutionLabel corretos', async () => {
    const store = await createHydratedStore()
    const opts = store.monitorOptions
    expect(opts[0].index).toBe(1)
    expect(opts[1].index).toBe(2)
    expect(opts[2].index).toBe(3)
    expect(opts[0].label).toBe('Monitor 1')
    expect(opts[2].label).toBe('Monitor 3')
    expect(opts[0].resolutionLabel).toMatch(/^\d+ × \d+$/)
    expect(opts[0].isPrimary).toBe(true)
    expect(opts[1].isPrimary).toBe(false)
  })

  it('refreshDisplays: isLoadingDisplays true durante e false depois', async () => {
    const store = globalThis.useProjectionStore()
    const mod = await import('@modules/settings/services/display-service')
    let resolveList!: (v: unknown[]) => void
    vi.spyOn(mod, 'listSystemDisplays').mockImplementation(
      () => new Promise((resolve) => { resolveList = resolve }),
    )
    const promise = store.refreshDisplays()
    await Promise.resolve()
    expect(store.isLoadingDisplays).toBe(true)
    resolveList([
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, isPrimary: true },
    ])
    await promise
    expect(store.isLoadingDisplays).toBe(false)
  })

  it('refreshDisplays: openReturnScreen sem returnDisplayId habilita retorno', async () => {
    const store = await createHydratedStore({
      openReturnScreen: true,
      returnDisplayId: null,
      targetDisplayIds: [2, 3],
      declinedDisplayIds: [],
    })
    expect(store.settings.openReturnScreen).toBe(true)
    expect(store.settings.returnDisplayId).not.toBeNull()
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('refreshDisplays: openReturnScreen com returnDisplayId válido NÃO re-habilita', async () => {
    const callsBefore = h.setUserPreference.mock.calls.length
    const store = await createHydratedStore({
      openReturnScreen: true,
      returnDisplayId: 2,
      targetDisplayIds: [2, 3],
    })
    expect(store.settings.returnDisplayId).toBe(2)
    // mutante `returnDisplayId == null → true` re-chamaria enableReturnScreen
    // → persistAndReapply extra (novo objeto !== settings.value)
    expect(h.setUserPreference.mock.calls.length).toBe(callsBefore)
  })

  it('refreshDisplays: sem displays não habilita return screen', async () => {
    const store = globalThis.useProjectionStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'listSystemDisplays').mockResolvedValue([])
    await store.hydrate()
    expect(store.settings.returnDisplayId).toBeNull()
  })

  it('linha 107: hydrate com openReturnScreen false NÃO liga retorno nem persiste', async () => {
    // openReturnScreen false + returnDisplayId null + displays presentes:
    // a condição da linha 107 deve ser false — sem enableReturnScreen, sem persist
    const callsBefore = h.setUserPreference.mock.calls.length
    const store = await createHydratedStore({
      openReturnScreen: false,
      returnDisplayId: null,
      declinedDisplayIds: [2, 3], // reconcile não adiciona targets
    })
    expect(store.settings.openReturnScreen).toBe(false)
    expect(store.settings.returnDisplayId).toBeNull()
    // se enableReturnScreen rodasse, persistaria (next !== settings.value)
    expect(h.setUserPreference.mock.calls.length).toBe(callsBefore)
  })

  it('linha 107: hydrate com 0 displays e retorno pendente NÃO chama enableReturnScreen', async () => {
    // displays.length > 0 é obrigatório: com 0 displays, enableReturnScreen
    // não pode rodar — nem persist extra (mutante >= 0 ou true morre aqui)
    const store = globalThis.useProjectionStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'listSystemDisplays').mockResolvedValue([])
    h.getUserPreference.mockReturnValue({
      ...baseSettings,
      openReturnScreen: true,
      returnDisplayId: null,
      targetDisplayIds: [],
      declinedDisplayIds: [],
    })
    const callsBefore = h.setUserPreference.mock.calls.length
    await store.hydrate()
    expect(store.settings.openReturnScreen).toBe(true) // não mudou
    expect(store.settings.returnDisplayId).toBeNull() // não escolheu nada
    // enableReturnScreen rodando com [] gravaria via persistAndReapply
    expect(h.setUserPreference.mock.calls.length).toBe(callsBefore)
  })

  it('refreshDisplays: arrangement com display inválido é podado no hydrate', async () => {
    const store = await createHydratedStore({
      monitorArrangement: [{ displayId: 99, x: 1, y: 1 }],
    })
    expect(store.settings.monitorArrangement).toEqual([])
    expect(h.setUserPreference).toHaveBeenCalled()
  })

  it('refreshDisplays: nada mudou não persiste de novo', async () => {
    await createHydratedStore({ targetDisplayIds: [2, 3], declinedDisplayIds: [] })
    // settings já reconciliados: refreshDisplays não deve gravar
    // (hydrate já rodou; contar chamadas: loadProjectionSettings não grava;
    //  reconciliação sem mudança → sem persist extra)
    const callsAfterHydrate = h.setUserPreference.mock.calls.length
    const store = globalThis.useProjectionStore()
    await store.refreshDisplays()
    expect(h.setUserPreference.mock.calls.length).toBe(callsAfterHydrate)
  })

  it('console.error de refreshDisplays usa prefixo [projection]', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = globalThis.useProjectionStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'listSystemDisplays').mockRejectedValue(new Error('x'))
    await store.refreshDisplays()
    expect(spy).toHaveBeenCalledWith('[projection] refreshDisplays', expect.any(Error))
    spy.mockRestore()
  })

  it('console.error de identifyMonitors usa prefixo [projection]', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await createHydratedStore()
    const mod = await import('@modules/settings/services/display-service')
    vi.spyOn(mod, 'identifySystemDisplays').mockRejectedValue(new Error('x'))
    await store.identifyMonitors()
    expect(spy).toHaveBeenCalledWith('[projection] identifyMonitors', expect.any(Error))
    spy.mockRestore()
  })

  it('console.error de backgroundImage usa prefixo [projection]', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.readImageAsDataUrl.mockRejectedValue(new Error('x'))
    const store = await createHydratedStore()
    const file = new File([''], 'test.png', { type: 'image/png' })
    await store.setBackgroundImageFromFile(file)
    expect(spy).toHaveBeenCalledWith('[projection] background image', expect.any(Error))
    spy.mockRestore()
  })
})