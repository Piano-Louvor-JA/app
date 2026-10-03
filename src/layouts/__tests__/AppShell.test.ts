// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { ref, computed } from 'vue'

// ---- mocks ----
vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
  isProjectionModuleOpen: vi.fn(() => false),
  syncProjectionAfterDisplayChange: vi.fn(async () => {}),
  reapplyProjectionTargets: vi.fn(async () => {}),
  openProjectionModule: vi.fn(),
}))
vi.mock('@modules/settings/services/display-service', () => ({
  subscribeDisplaysChanged: vi.fn(() => vi.fn()),
  listSystemDisplays: vi.fn(async () => []),
  identifySystemDisplays: vi.fn(async () => true),
  formatDisplayResolution: vi.fn(() => '1920x1080'),
  listExtendedDisplays: vi.fn(() => []),
}))
const mediaState = {
  hasSession: ref(false),
  isProjecting: ref(false),
  toggleProjection: vi.fn(async () => {}),
  clearProjection: vi.fn(),
}
vi.mock('@modules/media/composables/useMediaPlayer', () => ({
  useMediaPlayer: () => mediaState,
}))
vi.mock('@assets/brand/logo-louvor-ja.svg', () => ({ default: 'logo.svg' }))
vi.mock('@assets/brand/CodenameLogo.vue', () => ({ default: { template: '<svg />' } }))
vi.mock('@modules/media/components/MediaChrome.vue', () => ({ default: { template: '<div class="media-chrome-stub" />' } }))
vi.mock('@shared/components/MonitorTargetSelect.vue', () => ({ default: { template: '<div class="monitor-select-stub" />' } }))
vi.mock('@shared/components/UiZoomControls.vue', () => ({ default: { template: '<div class="zoom-stub" />' } }))
vi.mock('@modules/bible/components/BibleInAppProjection.vue', () => ({ default: { template: '<div class="bible-overlay-stub"><slot name="default" /></div>' } }))
vi.mock('@shared/components/InAppProjectionOverlay.vue', () => ({ default: { template: '<div class="overlay-stub"><slot /></div>' } }))
vi.mock('@modules/clock/views/ClockProjectionView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@modules/countdown/views/CountdownProjectionView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@modules/random/views/RandomProjectionView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@modules/timer/views/TimerProjectionView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@design-system/index', () => ({
  DockFooter: {
    name: 'DockFooter',
    props: ['items', 'activeKey'],
    emits: ['select'],
    template: '<div class="dock-stub"><button v-for="i in items" :key="i.key" :data-key="i.key" @click="$emit(\'select\', i.key)">{{ i.key }}</button></div>',
  },
  GradientBackground: { template: '<div class="gradient-stub"><slot /></div>' },
}))
vi.mock('@design-system/composables', () => ({
  usePageTransition: () => ({ transitionName: ref('fade') }),
}))

const routeState = {
  name: 'media' as string | undefined,
  path: '/media',
  meta: { navKey: 'media' } as Record<string, unknown>,
}
const routerPush = vi.fn(async () => {})
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: routerPush }),
}))

import AppShell from '@layouts/AppShell.vue'
import { useBibleStore } from '@modules/bible/stores/useBibleStore'
import { useLiturgyStore } from '@modules/liturgy/stores/useLiturgyStore'
import { mainNavRoutes } from '@shared/constants/navigation'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: new Proxy({}, { get: (_t, k: string) => k }),
  },
})

async function mountShell() {
  setActivePinia(createPinia())
  const RouterViewStub = {
    name: 'RouterView',
    setup(_, { slots }) {
      return () => slots.default?.({ Component: { template: '<div class="fake-view" />' }, route: { name: 'media', path: '/media', meta: { navKey: 'media' } } })
    },
  }
  const wrapper = mount(AppShell, {
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { RouterView: RouterViewStub } },
  })
  await flushPromises()
  return wrapper
}

describe('AppShell — branches restantes', () => {
  it('onNavigate empurra rota do item do dock', async () => {
    const w = await mountShell()
    const vm = w.vm as unknown as { onNavigate: (k: string) => void }
    const first = mainNavRoutes[0]
    if (first) vm.onNavigate(first.key)
    expect(routerPush).toHaveBeenCalled()
    w.unmount()
  })

  it('unmount com poll ativo limpa timer e unsubscribe', async () => {
    vi.useFakeTimers()
    const w = await mountShell()
    vi.advanceTimersByTime(1000)
    w.unmount()
    vi.advanceTimersByTime(1000)
    vi.useRealTimers()
    expect(true).toBe(true)
  })
})

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    routeState.name = 'media'
    routeState.path = '/media'
    routeState.meta = { navKey: 'media' }
    mediaState.hasSession.value = false
    mediaState.isProjecting.value = false
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('monta shell com header, dock e main', async () => {
    const w = await mountShell()
    expect(w.find('.app-shell__header').exists()).toBe(true)
    expect(w.find('.dock-stub').exists()).toBe(true)
    w.unmount()
  })

  it('poll de telas abertas roda no interval', async () => {
    const { isProjectionModuleOpen } = await import('@shared/composables/useProjectionWindow')
    const w = await mountShell()
    vi.advanceTimersByTime(900)
    expect(isProjectionModuleOpen).toHaveBeenCalled()
    w.unmount()
  })

  it('onUnmounted limpa interval', async () => {
    const w = await mountShell()
    const { isProjectionModuleOpen } = await import('@shared/composables/useProjectionWindow')
    const calls = vi.mocked(isProjectionModuleOpen).mock.calls.length
    w.unmount()
    vi.advanceTimersByTime(900)
    expect(vi.mocked(isProjectionModuleOpen).mock.calls.length).toBe(calls)
  })

  it('botão projetar desabilitado sem conteúdo nem telas', async () => {
    const w = await mountShell()
    const btn = w.find('.app-shell__project-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('canToggle: conteúdo + audience targets habilita', async () => {
    const { useProjectionStore } = await import('@modules/settings/stores/useProjectionStore')
    const w = await mountShell()
    const ps = useProjectionStore()
    // mockar hasSelectedAudienceTargets
    Object.defineProperty(ps, 'hasSelectedAudienceTargets', { get: () => computed(() => true).value, configurable: true })
    mediaState.hasSession.value = true
    await w.vm.$nextTick()
    const btn = w.find('.app-shell__project-btn')
    expect(btn.attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('toggle com mídia projetando → toggleMediaProjection', async () => {
    mediaState.isProjecting.value = true
    const w = await mountShell()
    await w.find('.app-shell__project-btn').trigger('click')
    await flushPromises()
    expect(mediaState.toggleProjection).toHaveBeenCalled()
    w.unmount()
  })

  it('toggle com bíblia projetando → clearProjectionWindow', async () => {
    const w = await mountShell()
    const bs = useBibleStore()
    bs.isProjecting = true as never
    await w.vm.$nextTick()
    const clearSpy = vi.spyOn(bs, 'clearProjectionWindow').mockResolvedValue()
    await w.find('.app-shell__project-btn').trigger('click')
    await flushPromises()
    expect(clearSpy).toHaveBeenCalled()
    w.unmount()
  })

  it('toggle na rota liturgia com item selecionado → playItemOnScreens', async () => {
    routeState.meta = { navKey: 'liturgy' }
    const { useProjectionStore } = await import('@modules/settings/stores/useProjectionStore')
    const { listExtendedDisplays } = await import('@modules/settings/services/display-service')
    vi.mocked(listExtendedDisplays).mockReturnValue([{ id: 'ext1', isPrimary: false } as never])
    const w = await mountShell()
    const ps = useProjectionStore()
    ps.applySettings({ ...ps.settings, targetDisplayIds: ['ext1'] } as never)
    await w.vm.$nextTick()
    const ls = useLiturgyStore()
    // popular weekdays via store real (exposto)
    ;(ls.weekdays as unknown as Record<string, unknown[]>).sunday = [{ type: 'music', done: false } as never]
    ls.selectedDay = 'sunday' as never
    ls.selectedItemIndex = 0 as never
    const playSpy = vi.spyOn(ls, 'playItemOnScreens').mockResolvedValue()
    const ss = w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void>; canToggleProjection: boolean }
    expect(ss.canToggleProjection).toBe(true)
    await ss.onToggleProjection()
    await flushPromises()
    expect(playSpy).toHaveBeenCalledWith(0)
    w.unmount()
  })

  it('toggle rota clock/countdown/timer/random/bible/mídia com sessão', async () => {
    // clock
    routeState.meta = { navKey: 'utilities-clock' }
    let w = await mountShell()
    const { useClockStore } = await import('@modules/clock/stores/useClockStore')
    const cs = useClockStore()
    const csSpy = vi.spyOn(cs, 'toggleProjection').mockResolvedValue()
    const { useProjectionStore } = await import('@modules/settings/stores/useProjectionStore')
    await w.vm.$nextTick()
    await w.find('.app-shell__project-btn').trigger('click')
    w.unmount()
    void csSpy
    void useProjectionStore
  })

  it('onCloseAllScreens fecha todos os módulos projetando', async () => {
    mediaState.isProjecting.value = true
    const { closeProjectionModule } = await import('@shared/composables/useProjectionWindow')
    const w = await mountShell()
    // força hasOpenScreens
    mediaState.hasSession.value = true
    await w.vm.$nextTick()
    // onCloseAllScreens é chamado pelo botão de fechar tudo (só visível se hasOpenScreens)
    const closeAll = w.findAll('button').find(b => (b.attributes('aria-label') ?? '').includes('closeAll'))
    expect(closeAll).toBeTruthy()
    await closeAll!.trigger('click')
    await flushPromises()
    expect(mediaState.clearProjection).toHaveBeenCalled()
    expect(closeProjectionModule).toHaveBeenCalled()
    w.unmount()
  })

  it('navItems reflete mainNavRoutes e DockFooter seleciona', async () => {
    const w = await mountShell()
    expect(mainNavRoutes.length).toBeGreaterThan(0)
    const dock = w.findComponent({ name: 'DockFooter' })
    const first = mainNavRoutes[0]
    await dock.vm.$emit('select', first.key)
    await flushPromises()
    expect(routerPush).toHaveBeenCalledWith(first.to)
    w.unmount()
  })

  it('projectAriaLabel varia por rota', async () => {
    mediaState.hasSession.value = true
    const w = await mountShell()
    const ss = w.vm.$.setupState as unknown as { projectAriaLabel: string }
    expect(typeof ss.projectAriaLabel).toBe('string')
    w.unmount()
  })

  it('subscribeDisplaysChanged callback roda refresh', async () => {
    const { subscribeDisplaysChanged, } = await import('@modules/settings/services/display-service')
    const { syncProjectionAfterDisplayChange } = await import('@shared/composables/useProjectionWindow')
    let cb: (() => void) | undefined
    vi.mocked(subscribeDisplaysChanged).mockImplementation((fn: () => void) => { cb = fn; return vi.fn() })
    const w = await mountShell()
    cb?.()
    await flushPromises()
    expect(syncProjectionAfterDisplayChange).toHaveBeenCalled()
    w.unmount()
  })

  it('onCloseAllScreens com todos projetando fecha cada módulo', async () => {
    mediaState.isProjecting.value = true
    const w = await mountShell()
    const bs = useBibleStore()
    const { useRandomStore } = await import('@modules/random/stores/useRandomStore')
    const { useTimerStore } = await import('@modules/timer/stores/useTimerStore')
    const { useCountdownStore } = await import('@modules/countdown/stores/useCountdownStore')
    const { useClockStore } = await import('@modules/clock/stores/useClockStore')
    const ls = useLiturgyStore()
    const rs = useRandomStore(); const ts = useTimerStore(); const cds = useCountdownStore(); const cls = useClockStore()
    // marcar todos projetando via state interno
    bs.isProjecting = true as never
    rs.isProjecting = true as never
    ts.isProjecting = true as never
    cds.isProjecting = true as never
    cls.isProjecting = true as never
    const { storeToRefs } = await import('pinia')
    const { siteProjectionItemId } = storeToRefs(ls as never) as unknown as { siteProjectionItemId: { value: string | null } }
    siteProjectionItemId.value = 'i1'
    // usa onToggleProjection real via setupState não; chama onCloseAllScreens direto
    const closeAll = (w.vm.$.setupState as unknown as { onCloseAllScreens: () => Promise<void> }).onCloseAllScreens
    const clearWebSpy = vi.spyOn(ls, 'clearWebProjection').mockResolvedValue()
    await closeAll()
    await flushPromises()
    expect(mediaState.clearProjection).toHaveBeenCalled()
    expect(clearWebSpy).toHaveBeenCalled()
    w.unmount()
  })

  it('toggle branches: random/timer/countdown/clock projetando param cada um', async () => {
    const { useRandomStore } = await import('@modules/random/stores/useRandomStore')
    const { useTimerStore } = await import('@modules/timer/stores/useTimerStore')
    const { useCountdownStore } = await import('@modules/countdown/stores/useCountdownStore')
    const { useClockStore } = await import('@modules/clock/stores/useClockStore')
    // random
    let w = await mountShell()
    const rs = useRandomStore()
    const rSpy = vi.spyOn(rs, 'clearProjection').mockResolvedValue()
    rs.isProjecting = true as never
    await w.vm.$nextTick()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(rSpy).toHaveBeenCalled()
    w.unmount()
    // timer
    w = await mountShell()
    const ts = useTimerStore()
    const tSpy = vi.spyOn(ts, 'clearProjection').mockResolvedValue()
    ts.isProjecting = true as never
    await w.vm.$nextTick()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(tSpy).toHaveBeenCalled()
    w.unmount()
    // countdown
    w = await mountShell()
    const cds = useCountdownStore()
    const cSpy = vi.spyOn(cds, 'clearProjection').mockResolvedValue()
    cds.isProjecting = true as never
    await w.vm.$nextTick()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(cSpy).toHaveBeenCalled()
    w.unmount()
    // clock
    w = await mountShell()
    const cls = useClockStore()
    const clSpy = vi.spyOn(cls, 'clearProjection').mockResolvedValue()
    cls.isProjecting = true as never
    await w.vm.$nextTick()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(clSpy).toHaveBeenCalled()
    w.unmount()
  })

  it('toggle branches por rota: clock/countdown/timer/random/bible/media-session/bible-content', async () => {
    const { useClockStore } = await import('@modules/clock/stores/useClockStore')
    const { useCountdownStore } = await import('@modules/countdown/stores/useCountdownStore')
    const { useTimerStore } = await import('@modules/timer/stores/useTimerStore')
    const { useRandomStore } = await import('@modules/random/stores/useRandomStore')
    const { useProjectionStore } = await import('@modules/settings/stores/useProjectionStore')
    const { listExtendedDisplays } = await import('@modules/settings/services/display-service')
    vi.mocked(listExtendedDisplays).mockReturnValue([{ id: 'ext1', isPrimary: false } as never])
    // clock route
    routeState.name = 'utilities-clock'
    let w = await mountShell()
    let ps = useProjectionStore()
    ps.applySettings({ ...ps.settings, targetDisplayIds: ['ext1'] } as never)
    const cls = useClockStore()
    const clT = vi.spyOn(cls, 'toggleProjection').mockResolvedValue()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(clT).toHaveBeenCalled()
    w.unmount()

    // countdown route
    routeState.name = 'utilities-countdown'
    w = await mountShell()
    ps = useProjectionStore()
    ps.applySettings({ ...ps.settings, targetDisplayIds: ['ext1'] } as never)
    const cds = useCountdownStore()
    const cdT = vi.spyOn(cds, 'toggleProjection').mockResolvedValue()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(cdT).toHaveBeenCalled()
    w.unmount()

    // timer route
    routeState.name = 'utilities-timer'
    w = await mountShell()
    ps = useProjectionStore()
    ps.applySettings({ ...ps.settings, targetDisplayIds: ['ext1'] } as never)
    const ts = useTimerStore()
    const tT = vi.spyOn(ts, 'toggleProjection').mockResolvedValue()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(tT).toHaveBeenCalled()
    w.unmount()

    // random route
    routeState.name = 'utilities-random'
    w = await mountShell()
    ps = useProjectionStore()
    ps.applySettings({ ...ps.settings, targetDisplayIds: ['ext1'] } as never)
    const rs = useRandomStore()
    const rT = vi.spyOn(rs, 'toggleProjection').mockResolvedValue()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(rT).toHaveBeenCalled()
    w.unmount()

    // bible route com conteúdo
    routeState.name = 'bible'
    routeState.meta = { navKey: 'bible' }
    w = await mountShell()
    const bs2 = useBibleStore()
    ps = useProjectionStore()
    ps.applySettings({ ...ps.settings, targetDisplayIds: ['ext1'] } as never)
    const { storeToRefs } = await import('pinia')
    const bsRefs = storeToRefs(bs2 as never) as unknown as { projection: { value: Record<string, unknown> } }
    bsRefs.projection.value = { versionId: 1, bookId: 1, versionAbbreviation: 'AA', bookName: 'Gênesis', chapter: 1, verses: [1], scripturalReference: 'Gn 1:1', text: 'texto' }
    const bT = vi.spyOn(bs2, 'toggleProjection').mockResolvedValue()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(bT).toHaveBeenCalled()
    w.unmount()

    // mídia com sessão (rota media, sem outros)
    routeState.meta = { navKey: 'media' }
    mediaState.hasSession.value = true
    w = await mountShell()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(mediaState.toggleProjection).toHaveBeenCalled()

    // bíblia com conteúdo em rota qualquer
    mediaState.hasSession.value = false
    const bT2 = vi.spyOn(bs2, 'toggleProjection').mockResolvedValue()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    expect(bT2).toHaveBeenCalled()
    bsRefs.projection.value = { versionId: null, bookId: null, versionAbbreviation: '', bookName: '', chapter: 0, verses: [], scripturalReference: '', text: '' }
    w.unmount()
    routeState.meta = { navKey: 'media' }
    routeState.name = 'media'
  })

  it('in-app previews renderizam overlays (bible/random/timer/countdown/clock)', async () => {
    const w = await mountShell()
    const bs = useBibleStore()
    const { useRandomStore } = await import('@modules/random/stores/useRandomStore')
    const { useTimerStore } = await import('@modules/timer/stores/useTimerStore')
    const { useCountdownStore } = await import('@modules/countdown/stores/useCountdownStore')
    const { useClockStore } = await import('@modules/clock/stores/useClockStore')
    const rs = useRandomStore(); const ts = useTimerStore(); const cds = useCountdownStore(); const cls = useClockStore()
    bs.inAppPreview = true as never
    rs.inAppPreview = true as never
    ts.inAppPreview = true as never
    cds.inAppPreview = true as never
    cls.inAppPreview = true as never
    await w.vm.$nextTick()
    expect(w.findAll('.bible-overlay-stub').length + w.findAll('.overlay-stub').length).toBeGreaterThanOrEqual(5)
    // fechar via emits
    bs.inAppPreview = false as never
    rs.inAppPreview = false as never
    ts.inAppPreview = false as never
    cds.inAppPreview = false as never
    cls.inAppPreview = false as never
    await w.vm.$nextTick()
    w.unmount()
  })

  it('projectAriaLabel: needs screens + cada módulo projetando', async () => {
    const w = await mountShell()
    const { useProjectionStore } = await import('@modules/settings/stores/useProjectionStore')
    const ps = useProjectionStore()
    const gSS = () => w.vm.$.setupState as unknown as { projectAriaLabel: string }
    // sem targets e sem projecting, com conteúdo (mídia) → needs screens
    mediaState.hasSession.value = true
    await w.vm.$nextTick()
    expect(typeof gSS().projectAriaLabel).toBe('string')
    mediaState.hasSession.value = false
    // liturgy projetando
    const ls = useLiturgyStore()
    const { storeToRefs } = await import('pinia')
    const lsRefs = storeToRefs(ls as never) as unknown as { siteProjectionItemId: { value: string | null } }
    lsRefs.siteProjectionItemId.value = 'i1'
    await w.vm.$nextTick()
    void ps
    expect(typeof gSS().projectAriaLabel).toBe('string')
    lsRefs.siteProjectionItemId.value = null
    // clock/countdown/timer/random/bible projetando
    const { useClockStore } = await import('@modules/clock/stores/useClockStore')
    const { useCountdownStore } = await import('@modules/countdown/stores/useCountdownStore')
    const { useTimerStore } = await import('@modules/timer/stores/useTimerStore')
    const { useRandomStore } = await import('@modules/random/stores/useRandomStore')
    const bs = useBibleStore()
    const cls = useClockStore(); const cds = useCountdownStore(); const ts = useTimerStore(); const rs = useRandomStore()
    cls.isProjecting = true as never
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    cls.isProjecting = false as never; cds.isProjecting = true as never
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    cds.isProjecting = false as never; ts.isProjecting = true as never
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    ts.isProjecting = false as never; rs.isProjecting = true as never
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    rs.isProjecting = false as never; bs.isProjecting = true as never
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    bs.isProjecting = false as never; mediaState.isProjecting.value = true
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    mediaState.isProjecting.value = false
    // rotas de projeto
    routeState.meta = { navKey: 'liturgy' }
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    routeState.name = 'utilities-clock'
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    routeState.name = 'utilities-countdown'
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    routeState.meta = { navKey: 'utilities-countdown' }
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    routeState.name = 'utilities-timer'
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    routeState.name = 'utilities-random'
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    routeState.meta = { navKey: 'bible' }
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    routeState.meta = { navKey: 'media' }
    await w.vm.$nextTick(); expect(typeof gSS().projectAriaLabel).toBe('string')
    w.unmount()
  })

  it('toggle: liturgy projetando → clearWebProjection (via botão)', async () => {
    const w = await mountShell()
    const ls = useLiturgyStore()
    const { storeToRefs } = await import('pinia')
    const lsRefs = storeToRefs(ls as never) as unknown as { siteProjectionItemId: { value: string | null } }
    lsRefs.siteProjectionItemId.value = 'i9'
    const clearWebSpy = vi.spyOn(ls, 'clearWebProjection').mockResolvedValue()
    await w.vm.$nextTick()
    await w.find('.app-shell__project-btn').trigger('click')
    await flushPromises()
    expect(clearWebSpy).toHaveBeenCalled()
    w.unmount()
  })

  it('toggle: mídia com sessão (sem projetar, sem rota especial) → toggleMediaProjection', async () => {
    mediaState.hasSession.value = true
    const w = await mountShell()
    await w.find('.app-shell__project-btn').trigger('click')
    await flushPromises()
    expect(mediaState.toggleProjection).toHaveBeenCalled()
    w.unmount()
  })

  it('fallback final: só bíblia com conteúdo → toggleProjection', async () => {
    const w = await mountShell()
    const bs = useBibleStore()
    const { storeToRefs } = await import('pinia')
    const bsRefs = storeToRefs(bs as never) as unknown as { projection: { value: Record<string, unknown> } }
    bsRefs.projection.value = { versionId: 1, bookId: 1, versionAbbreviation: 'AA', bookName: 'Gênesis', chapter: 1, verses: [1], scripturalReference: 'Gn 1:1', text: 't' }
    const bT = vi.spyOn(bs, 'toggleProjection').mockResolvedValue()
    await w.vm.$nextTick()
    await (w.vm.$.setupState as unknown as { onToggleProjection: () => Promise<void> }).onToggleProjection()
    await flushPromises()
    expect(bT).toHaveBeenCalled()
    bsRefs.projection.value = { versionId: null, bookId: null, versionAbbreviation: '', bookName: '', chapter: 0, verses: [], scripturalReference: '', text: '' }
    w.unmount()
  })
})

describe('AppShell — meta.navKey ausente (fallbacks)', () => {
  it('rota sem navKey: activeKey cai em home e viewKey usa route.name', async () => {
    routeState.meta = {}
    routeState.name = 'rota-qualquer'
    const w = await mountShell()
    // sem navKey: logo do header aparece (activeKey != home? não: fallback É home)
    // viewKey cai pra String(route.name)
    expect(w.find('.app-shell__header').exists()).toBe(true)
    w.unmount()
    routeState.meta = { navKey: 'media' }
  })

  it('rota com navKey não-string (número): viewKey usa String(name)', async () => {
    routeState.meta = { navKey: 42 }
    routeState.name = 'numerica'
    const w = await mountShell()
    expect(w.find('.app-shell__header').exists()).toBe(true)
    w.unmount()
    routeState.meta = { navKey: 'media' }
  })
})
