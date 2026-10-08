// @vitest-environment jsdom
// CountdownProjectionView — storage/channel sync, effectiveConfig, unmount cleanup
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLoadConfig, mockReadRuntime, mockReadStage, mockSubscribeStage } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockReadRuntime: vi.fn(),
  mockReadStage: vi.fn(),
  mockSubscribeStage: vi.fn(),
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: { template: '<div class="projection-bg"><slot /></div>' },
}))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: mockReadStage,
  subscribeStageSettings: mockSubscribeStage,
}))

vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: vi.fn(() => null),
  stageFlexAlign: vi.fn(() => ({ alignItems: 'center', justifyContent: 'center' })),
}))

vi.mock('../../services/countdown-preferences', () => ({
  COUNTDOWN_CONFIG_CHANNEL: 'countdown-config-test',
  loadCountdownDisplayConfig: mockLoadConfig,
  normalizeCountdownDisplayConfig: vi.fn((v: unknown) => v),
}))

vi.mock('../../services/countdown-runtime', () => ({
  COUNTDOWN_RUNTIME_CHANNEL: 'countdown-runtime-test',
  COUNTDOWN_RUNTIME_STORAGE_KEY: 'countdown-runtime-key',
  normalizeCountdownRuntime: vi.fn((v: unknown) => v),
  readCountdownRuntimeFromStorage: mockReadRuntime,
}))

vi.mock('../../components/CountdownPreview.vue', () => ({
  default: { props: ['config', 'runtime'], template: '<div class="countdown-preview-stub" />' },
}))

import CountdownProjectionView from '../CountdownProjectionView.vue'

const stageBase = {
  backgroundColor: '#000',
  backgroundImage: null,
  fontSize: 96,
  countdown: undefined as unknown,
}

describe('CountdownProjectionView', () => {
  let unsubSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    unsubSpy = vi.fn()
    mockSubscribeStage.mockReturnValue(unsubSpy)
    mockReadStage.mockReturnValue({ ...stageBase })
    mockLoadConfig.mockReturnValue({ timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' })
    mockReadRuntime.mockReturnValue({
      status: 'idle',
      segmentStartedAt: null,
      accumulatedMs: 0,
      durationMs: 60000,
      savedTimesMs: [],
      finished: false,
    })
  })

  it('renderiza preview com config e runtime iniciais', () => {
    const wrapper = mount(CountdownProjectionView)
    expect(wrapper.find('.countdown-preview-stub').exists()).toBe(true)
    expect(wrapper.vm.config.timeFormat).toBe('hh:mm:ss')
    expect(wrapper.vm.runtime.durationMs).toBe(60000)
  })

  it('stage com countdown override: effectiveConfig faz merge', () => {
    mockReadStage.mockReturnValue({ ...stageBase, countdown: { timeFormat: 'mm:ss' } })
    const wrapper = mount(CountdownProjectionView)
    expect(wrapper.vm.effectiveConfig.timeFormat).toBe('mm:ss')
  })

  it('stage sem countdown: effectiveConfig = config puro', () => {
    const wrapper = mount(CountdownProjectionView)
    expect(wrapper.vm.effectiveConfig.timeFormat).toBe('hh:mm:ss')
  })

  it('storage user_data: refresca config', async () => {
    const wrapper = mount(CountdownProjectionView)
    mockLoadConfig.mockReturnValue({ timeFormat: 'mm:ss', bgColor: '#111', textColor: '#eee' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'user_data' }))
    await flushPromises()
    expect(wrapper.vm.config.timeFormat).toBe('mm:ss')
  })

  it('storage runtime key: refresca runtime', async () => {
    const wrapper = mount(CountdownProjectionView)
    mockReadRuntime.mockReturnValue({
      status: 'running',
      segmentStartedAt: 1,
      accumulatedMs: 0,
      durationMs: 1000,
      savedTimesMs: [],
      finished: false,
    })
    window.dispatchEvent(new StorageEvent('storage', { key: 'countdown-runtime-key' }))
    await flushPromises()
    expect(wrapper.vm.runtime.status).toBe('running')
    expect(wrapper.vm.runtime.durationMs).toBe(1000)
  })

  it('storage irrelevante: nada muda', async () => {
    const wrapper = mount(CountdownProjectionView)
    window.dispatchEvent(new StorageEvent('storage', { key: 'xyz' }))
    await flushPromises()
    expect(wrapper.vm.config.timeFormat).toBe('hh:mm:ss')
  })

  it('unmount: unsub stage e remove storage listener', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(CountdownProjectionView)
    wrapper.unmount()
    expect(unsubSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('projecting false: esconde stage', async () => {
    mockReadRuntime.mockReturnValue({
      status: 'idle',
      segmentStartedAt: null,
      accumulatedMs: 0,
      durationMs: 60000,
      savedTimesMs: [],
      finished: false,
      projecting: false,
    })
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(wrapper.vm.runtime.projecting).toBe(false)
    expect(wrapper.find('.countdown-projection__stage').exists()).toBe(false)
  })
})
