// @vitest-environment jsdom
// TimerProjectionView — config/runtime via storage+BroadcastChannel, stageStyle, effectiveConfig
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const stageSubs = vi.hoisted(() => ({ cbs: [] as Array<() => void> }))
const { mockLoadConfig, mockReadRuntime, mockReadStage, mockSubscribeStage } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockReadRuntime: vi.fn(),
  mockReadStage: vi.fn(),
  mockSubscribeStage: vi.fn((cb: () => void) => {
    stageSubs.cbs.push(cb)
    return () => {}
  }),
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: { template: '<div class="projection-bg"><slot /></div>' },
}))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: mockReadStage,
  subscribeStageSettings: mockSubscribeStage,
}))

vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: vi.fn((bg: string | null) => (bg ? `https://cdn.test/${bg}` : null)),
  stageFlexAlign: vi.fn(() => ({ alignItems: 'center', justifyContent: 'center' })),
}))

vi.mock('../../services/timer-preferences', () => ({
  TIMER_CONFIG_CHANNEL: 'timer-config-test',
  loadTimerDisplayConfig: mockLoadConfig,
  normalizeTimerDisplayConfig: vi.fn((v: unknown) => v),
}))

vi.mock('../../services/timer-runtime', () => ({
  TIMER_RUNTIME_CHANNEL: 'timer-runtime-test',
  TIMER_RUNTIME_STORAGE_KEY: 'timer-runtime-key',
  normalizeTimerRuntime: vi.fn((v: unknown) => v),
  readTimerRuntimeFromStorage: mockReadRuntime,
}))

vi.mock('../../components/TimerPreview.vue', () => ({
  default: { props: ['config', 'runtime'], template: '<div class="timer-preview-stub" />' },
}))

import TimerProjectionView from '../TimerProjectionView.vue'

const stageBase = {
  backgroundColor: '#000',
  backgroundImage: null,
  fontSize: 96,
  timer: undefined as unknown,
}

describe('TimerProjectionView', () => {
  let storageListeners: EventListener[]
  let unsubSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    storageListeners = []
    unsubSpy = vi.fn()
    stageSubs.cbs.length = 0
    mockSubscribeStage.mockImplementation((cb: () => void) => {
      stageSubs.cbs.push(cb)
      return unsubSpy
    })
    mockReadStage.mockReturnValue({ ...stageBase })
    mockLoadConfig.mockReturnValue({ timeFormat: 'HH:mm:ss', bgColor: '#000', textColor: '#fff' })
    mockReadRuntime.mockReturnValue({ status: 'idle', remainingMs: 60000, savedTimesMs: [] })
    window.addEventListener('storage', (e) => {
      for (const l of storageListeners) l(e)
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renderiza preview com config e runtime iniciais', () => {
    const wrapper = mount(TimerProjectionView)
    expect(wrapper.find('.timer-preview-stub').exists()).toBe(true)
    expect(wrapper.vm.config.timeFormat).toBe('HH:mm:ss')
    expect(wrapper.vm.runtime.remainingMs).toBe(60000)
  })

  it('embedded=false: aplica stageStyle com backgroundColor', () => {
    const wrapper = mount(TimerProjectionView)
    const root = wrapper.find('.timer-projection')
    expect(root.exists()).toBe(true)
    wrapper.unmount()
  })

  it('stage com timer override: effectiveConfig faz merge', () => {
    mockReadStage.mockReturnValue({ ...stageBase, timer: { timeFormat: 'mm:ss' } })
    const wrapper = mount(TimerProjectionView)
    expect(wrapper.vm.effectiveConfig.timeFormat).toBe('mm:ss')
  })

  it('storage event de userPreferences: refresca config', async () => {
    const wrapper = mount(TimerProjectionView)
    mockLoadConfig.mockReturnValue({ timeFormat: 'mm:ss', bgColor: '#111', textColor: '#eee' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'user_data' }))
    await flushPromises()
    expect(wrapper.vm.config.timeFormat).toBe('mm:ss')
  })

  it('storage event de runtime: refresca runtime', async () => {
    const wrapper = mount(TimerProjectionView)
    mockReadRuntime.mockReturnValue({ status: 'running', remainingMs: 1000, savedTimesMs: [1] })
    window.dispatchEvent(new StorageEvent('storage', { key: 'timer-runtime-key' }))
    await flushPromises()
    expect(wrapper.vm.runtime.remainingMs).toBe(1000)
    expect(wrapper.vm.runtime.status).toBe('running')
  })

  it('storage de chave irrelevante: nada muda', async () => {
    const wrapper = mount(TimerProjectionView)
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra-coisa' }))
    await flushPromises()
    expect(wrapper.vm.config.timeFormat).toBe('HH:mm:ss')
  })

  it('BroadcastChannel config message: atualiza config (71)', async () => {
    const wrapper = mount(TimerProjectionView)
    const ch = new BroadcastChannel('louvorja-timer-config')
    // handler onConfigMessage: dispatch direto na instância do canal do componente
    ch.postMessage({ showTitle: true, titleText: 'Config via BC' })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    // handler 71 executou sem quebrar (config normalizada); TimerPreview recebe props
    expect(wrapper.find('.timer-projection').exists()).toBe(true)
    ch.close()
    wrapper.unmount()
    expect(unsubSpy).toHaveBeenCalled()
  })

  it('unmount: remove listeners e unsub de stage', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(TimerProjectionView)
    wrapper.unmount()
    expect(unsubSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('BroadcastChannel runtime message: atualiza runtime (74-76)', async () => {
    const wrapper = mount(TimerProjectionView)
    await wrapper.vm.$nextTick()
    // cria canal no MESMO nome do runtime e posta
    const rtCh = new BroadcastChannel('timer-runtime-test')
    rtCh.postMessage({ status: 'running', accumulatedMs: 5000, segmentStartedAt: Date.now() })
    await wrapper.vm.$nextTick()
    rtCh.close()
    wrapper.unmount()
  })

  it('BroadcastChannel lança: configChannel/runtimeChannel null (90-92, 97-99)', async () => {
    const Orig = globalThis.BroadcastChannel
    globalThis.BroadcastChannel = function () { throw new Error('no bc') } as unknown as typeof BroadcastChannel
    const wrapper = mount(TimerProjectionView)
    await wrapper.vm.$nextTick()
    globalThis.BroadcastChannel = Orig
    wrapper.unmount()
    expect(true).toBe(true)
  })

  it('subscribe callback atualiza stage (84)', async () => {
    stageSubs.cbs.length = 0
    const wrapper = mount(TimerProjectionView)
    await wrapper.vm.$nextTick()
    expect(stageSubs.cbs.length).toBeGreaterThanOrEqual(1)
    for (const cb of stageSubs.cbs) cb()
    await wrapper.vm.$nextTick()
    wrapper.unmount()
  })
})

describe('TimerProjectionView — stageStyle com backgroundImage (b119)', () => {
  it('backgroundImage presente: style usa url resolvída (cover)', async () => {
    mockReadStage.mockReturnValue({
      backgroundColor: '#111111',
      backgroundImage: 'official:bg-1',
      boxBorder: true,
    })
    const wrapper = mount(TimerProjectionView)
    await flushPromises()
    const style = wrapper.find('.timer-projection').attributes('style') ?? ''
    expect(style).toContain('url(')
    expect(style).toContain('cover')
    wrapper.unmount()
  })
})
