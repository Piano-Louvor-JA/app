// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../composables/useCountdown', () => ({
  useCountdownDisplay: () => ({
    formattedTime: { value: '01:00' },
    isUrgent: { value: false },
    isFinished: { value: false },
  }),
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: {
    name: 'ProjectionBackground',
    template: '<div class="projection-bg-dbg"><slot /></div>',
  },
}))

vi.mock('@shared/constants/storage-keys', () => ({
  BROWSER_STORAGE_KEYS: { userPreferences: 'user-preferences' },
}))

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  name: string
  handlers: Array<(e: { data: unknown }) => void> = []
  closed = false
  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }
  addEventListener(_t: string, cb: (e: { data: unknown }) => void) {
    this.handlers.push(cb)
  }
  removeEventListener(_t: string, cb: (e: { data: unknown }) => void) {
    this.handlers = this.handlers.filter((h) => h !== cb)
  }
  close() {
    this.closed = true
  }
  emit(data: unknown) {
    for (const h of [...this.handlers]) h({ data })
  }
}
;(globalThis as Record<string, unknown>).BroadcastChannel = FakeBroadcastChannel

let stageRead = vi.fn(() => ({
  backgroundColor: '#101010',
  backgroundImage: '',
  fontSize: 120,
  fontWeight: 700,
  textColor: '#ffffff',
  textAlign: 'center',
  textVerticalAlign: 'center',
  textShadow: false,
  shadowBlur: 1,
  shadowIntensity: 0.4,
  textBox: false,
  boxBorder: false,
  boxOpacity: 0.3,
  countdown: { timeFormat: 'mm:ss', bgColor: '#101010', textColor: '#ffffff' },
}))

let stageSubscribers: Array<() => void> = []

vi.mock('../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => stageRead(),
  subscribeStageSettings: (cb: () => void) => {
    stageSubscribers.push(cb)
    return () => {
      stageSubscribers = stageSubscribers.filter((fn) => fn !== cb)
    }
  },
}))

const resolveBg = vi.fn(() => null)

vi.mock('../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: () => resolveBg(),
  stageFlexAlign: () => ({ alignItems: 'center', justifyContent: 'center' }),
}))

const loadConfig = vi.fn(() => ({
  timeFormat: 'mm:ss',
  bgColor: '#000000',
  textColor: '#ffffff',
}))

vi.mock('../services/countdown-preferences', () => ({
  COUNTDOWN_CONFIG_CHANNEL: 'countdown-config',
  loadCountdownDisplayConfig: () => loadConfig(),
  normalizeCountdownDisplayConfig: (data: unknown) => data,
}))

const readRuntime = vi.fn(() => ({
    status: 'idle',
    segmentStartedAt: null,
    accumulatedMs: 0,
    durationMs: 60_000,
    savedTimesMs: [],
    finished: false,
    projecting: true,
  }))

vi.mock('../services/countdown-runtime', () => ({
  COUNTDOWN_RUNTIME_CHANNEL: 'countdown-runtime',
  COUNTDOWN_RUNTIME_STORAGE_KEY: 'countdown-runtime',
  normalizeCountdownRuntime: (data: unknown) => data,
  readCountdownRuntimeFromStorage: () => readRuntime(),
}))

import CountdownProjectionView from '../views/CountdownProjectionView.vue'

describe('CountdownProjectionView', () => {
  beforeEach(() => {
    FakeBroadcastChannel.instances = []
    stageSubscribers = []
    resolveBg.mockReset()
    resolveBg.mockReturnValue(null)
  })
  it('monta com runtime projetando: renderiza preview com tempo formatado', async () => {
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(wrapper.find('.countdown-projection__stage').exists()).toBe(true)
    expect(wrapper.find('.countdown-preview').exists()).toBe(true)
    wrapper.unmount()
  })

  it('embedded: aplica classe de embed', async () => {
    const wrapper = mount(CountdownProjectionView, { props: { embedded: true } })
    await flushPromises()
    expect(wrapper.html()).toContain('countdown-projection--embedded')
    wrapper.unmount()
  })

  it('runtime.projecting === false: esconde o palco', async () => {
    readRuntime.mockReturnValueOnce({
      status: 'idle',
      segmentStartedAt: null,
      accumulatedMs: 0,
      durationMs: 60_000,
      savedTimesMs: [],
      finished: false,
      projecting: false,
    })
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(wrapper.find('.countdown-projection__stage').exists()).toBe(false)
    wrapper.unmount()
  })

  it('storage event: userPreferences refresca config; runtime key refresca runtime', async () => {
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()

    loadConfig.mockReturnValueOnce({ timeFormat: 'hh:mm:ss', bgColor: '#111', textColor: '#eee' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'user-preferences' }))
    await flushPromises()
    loadConfig.mockReturnValueOnce({ timeFormat: 'hh:mm:ss', bgColor: '#111', textColor: '#eee' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'user-preferences' }))
    await flushPromises()

    readRuntime.mockReturnValueOnce({
      status: 'paused',
      segmentStartedAt: null,
      accumulatedMs: 65_000,
      durationMs: 65_000,
      savedTimesMs: [],
      finished: true,
      projecting: true,
    })
    window.dispatchEvent(new StorageEvent('storage', { key: 'countdown-runtime' }))
    await flushPromises()

    // chave desconhecida: nenhum refresh
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra-coisa' }))
    await flushPromises()
    wrapper.unmount()
  })

  it('BroadcastChannel: mensagens de config e runtime atualizam estado; unmount fecha', async () => {
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(FakeBroadcastChannel.instances).toHaveLength(2)
    const configCh = FakeBroadcastChannel.instances.find((c) => c.name === 'countdown-config')
    const runtimeCh = FakeBroadcastChannel.instances.find((c) => c.name === 'countdown-runtime')
    configCh!.emit({ timeFormat: 'hh:mm:ss.ms', bgColor: '#000', textColor: '#fff' })
    runtimeCh!.emit({
      status: 'idle',
      segmentStartedAt: null,
      accumulatedMs: 0,
      durationMs: 30_000,
      savedTimesMs: [],
      finished: false,
      projecting: true,
    })
    await flushPromises()
    wrapper.unmount()
    expect(configCh!.closed).toBe(true)
    expect(runtimeCh!.closed).toBe(true)
  })

  it('callback de stage settings atualiza palco; unmount desinscreve', async () => {
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(stageSubscribers).toHaveLength(1)
    stageSubscribers.forEach((cb) => cb())
    wrapper.unmount()
    const before = stageSubscribers.length
    stageSubscribers.forEach((cb) => cb())
    expect(stageSubscribers.length).toBe(before)
  })

  it('stage sem countdown usa config carregado sem merge', async () => {
    stageRead.mockReturnValueOnce({
      backgroundColor: '#101010',
      backgroundImage: '',
      fontSize: 96,
      fontWeight: 700,
      textColor: '#ffffff',
      textAlign: 'center',
      textVerticalAlign: 'center',
      textShadow: false,
      shadowBlur: 1,
      shadowIntensity: 0.4,
      textBox: false,
      boxBorder: false,
      boxOpacity: 0.3,
    })
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(wrapper.find('.countdown-preview').exists()).toBe(true)
    wrapper.unmount()
  })

  it('BroadcastChannel indisponível: não quebra a montagem', async () => {
    const OriginalBC = (globalThis as Record<string, unknown>).BroadcastChannel
    ;(globalThis as Record<string, unknown>).BroadcastChannel = class {
      constructor() {
        throw new Error('sem BroadcastChannel')
      }
    }
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(wrapper.find('.countdown-preview').exists()).toBe(true)
    wrapper.unmount()
    ;(globalThis as Record<string, unknown>).BroadcastChannel = OriginalBC
  })

  it('background image do palco vira url no style', async () => {
    resolveBg.mockReturnValue('https://example.com/bg.png')
    const wrapper = mount(CountdownProjectionView)
    await flushPromises()
    expect(wrapper.html()).toContain('bg.png')
    wrapper.unmount()
  })
})
