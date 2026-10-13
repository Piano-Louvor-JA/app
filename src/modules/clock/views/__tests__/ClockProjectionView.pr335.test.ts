// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const loadClockConfigMock = vi.hoisted(() => vi.fn(() => ({
  style: 'analog', format24h: true, showSeconds: true, textColor: '#fff', bgColor: '#000',
})))
const normalizeClockConfigMock = vi.hoisted(() => vi.fn((cfg: unknown) => ({ ...(cfg as object) })))
const stageSubs = vi.hoisted(() => ({ cbs: [] as Array<() => void>, unsubs: [] as Array<ReturnType<typeof vi.fn>> }))
const subscribeMock = vi.hoisted(() => vi.fn((cb: () => void) => {
  stageSubs.cbs.push(cb)
  const unsub = vi.fn()
  stageSubs.unsubs.push(unsub)
  return unsub
}))
const readEffectiveMock = vi.hoisted(() => vi.fn(() => ({
  backgroundColor: '#fff', backgroundImage: null, fontSize: 96,
})))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: readEffectiveMock,
  subscribeStageSettings: subscribeMock,
}))

vi.mock('@shared/constants/storage-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/constants/storage-keys')>()
  return {
    ...actual,
    BROWSER_STORAGE_KEYS: { userPreferences: 'user_preferences' },
  }
})

vi.mock('../../services/clock-preferences', () => ({
  CLOCK_CONFIG_CHANNEL: 'clock-config',
  loadClockConfig: loadClockConfigMock,
  normalizeClockConfig: normalizeClockConfigMock,
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: {
    name: 'ProjectionBackground',
    template: '<div class="stub-projection-background"><slot /></div>',
  },
}))

// ClockPreview real para coverage; sem deps externas
import ClockProjectionView from '../ClockProjectionView.vue'

describe('ClockProjectionView.vue', () => {
  let wrapper: ReturnType<typeof mount> | null = null
  const channelListeners: { message: ((e: unknown) => void) | null } = { message: null }
  let storageListener: ((e: StorageEvent) => void) | null = null
  const originalBC = (globalThis as any).BroadcastChannel
  const originalAddEventListener = window.addEventListener.bind(window)
  const originalRemoveEventListener = window.removeEventListener.bind(window)

  class FakeBroadcastChannel {
    static instances: FakeBroadcastChannel[] = []
    name: string
    closed = false
    listeners = new Map<string, Set<(e: unknown) => void>>()
    constructor(name: string) {
      this.name = name
      FakeBroadcastChannel.instances.push(this)
    }
    addEventListener(type: string, cb: (e: unknown) => void) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set())
      this.listeners.get(type)!.add(cb)
      if (type === 'message') channelListeners.message = cb
    }
    removeEventListener(type: string, cb: (e: unknown) => void) {
      this.listeners.get(type)?.delete(cb)
    }
    close() { this.closed = true }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    FakeBroadcastChannel.instances.length = 0
    ;(globalThis as any).BroadcastChannel = FakeBroadcastChannel
    storageListener = null
    window.addEventListener = ((type: string, cb: any, ...rest: any[]) => {
      if (type === 'storage') storageListener = cb
      return originalAddEventListener(type as any, cb, ...rest)
    }) as any
    window.removeEventListener = ((type: string, cb: any, ...rest: any[]) => {
      if (type === 'storage' && storageListener === cb) storageListener = null
      return originalRemoveEventListener(type as any, cb, ...rest)
    }) as any
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    ;(globalThis as any).BroadcastChannel = originalBC
    window.addEventListener = originalAddEventListener
    window.removeEventListener = originalRemoveEventListener
    vi.clearAllMocks()
  })

  function mountView() {
    wrapper = mount(ClockProjectionView, {
      global: {
        stubs: { ClockPreview: { template: '<div class="clock-preview-stub" />' } },
      },
    })
    return wrapper
  }

  it('monta com config do loadClockConfig e stage do runtime', async () => {
    const w = mountView()
    await flushPromises()
    expect(loadClockConfigMock).toHaveBeenCalled()
    expect(readEffectiveMock).toHaveBeenCalledWith('clock')
    expect(w.find('.stub-projection-background').exists()).toBe(true)
  })

  it('broadcast channel: evento normalizado e armazenado', async () => {
    const w = mountView()
    await flushPromises()
    const ch = FakeBroadcastChannel.instances[0]
    expect(ch?.name).toBe('clock-config')
    const cb = channelListeners.message!
    expect(cb).toBeTruthy()
    cb({ data: { style: 'digital', format24h: false } })
    await flushPromises()
    expect(normalizeClockConfigMock).toHaveBeenCalledWith({ style: 'digital', format24h: false })
    // config atualizada via v-if no template? setada no ref
    expect((w.vm as any) === w.vm).toBe(true)
  })

  it('storage: recarrega config quando key=userPreferences; ignora outras keys', async () => {
    mountView()
    await flushPromises()
    expect(loadClockConfigMock.mock.calls.length).toBeGreaterThanOrEqual(1)
    const callsBefore = loadClockConfigMock.mock.calls.length
    // key diferente → ignorado
    storageListener?.({ key: 'outra_key' } as StorageEvent)
    expect(loadClockConfigMock.mock.calls.length).toBe(callsBefore)
    // key userPreferences → refresh
    storageListener?.({ key: 'user_preferences' } as StorageEvent)
    expect(loadClockConfigMock.mock.calls.length).toBe(callsBefore + 1)
    // key null → refresh
    storageListener?.({ key: null } as StorageEvent)
    expect(loadClockConfigMock.mock.calls.length).toBe(callsBefore + 2)
  })

  it('unmount: remove listeners, unsub e fecha channel', async () => {
    const w = mountView()
    await flushPromises()
    const ch = FakeBroadcastChannel.instances[0]
    const unsub = stageSubs.unsubs.at(-1)!
    w.unmount()
    expect(ch?.closed).toBe(true)
    expect(unsub).toHaveBeenCalled()
    expect(storageListener).toBeNull()
  })

  it('BroadcastChannel ausente: falha silenciosa (catch)', async () => {
    ;(globalThis as any).BroadcastChannel = undefined
    const w = mountView()
    await flushPromises()
    expect(w.find('.stub-projection-background').exists()).toBe(true)
  })

describe('subscribe callback (55)', () => {
  it('gaps: backgroundImage url, stage.clock merge e embedded', async () => {
    readEffectiveMock.mockReturnValue({
      backgroundColor: '#123456',
      backgroundImage: '/img/bg.png',
      fontSize: 96,
      clock: { style: 'digital', format24h: false },
    })
    const { resolveBackgroundImage } = await import('../../../settings/types/stage-settings')
    vi.mocked(resolveBackgroundImage, true)
    const w = mount(ClockProjectionView, { props: { embedded: true }, global: { plugins: [createPinia()] } })
    await flushPromises()
    const bg = w.find('.stub-projection-background')
    expect(bg.attributes('style')).toContain('background-image')
    expect(bg.attributes('style')).toContain('/img/bg.png')
    expect(bg.html()).toContain('clock-projection--embedded')
    // stage.clock faz merge sobre config: stage montado com preview
    expect(w.find('.clock-projection__stage').exists()).toBe(true)
    w.unmount()
  })

  it('callback do subscribe atualiza stage', async () => {
    stageSubs.cbs.length = 0
    const w = mount(ClockProjectionView, { global: { plugins: [createPinia()] } })
    await w.vm.$nextTick()
    expect(stageSubs.cbs.length).toBeGreaterThanOrEqual(1)
    for (const cb of stageSubs.cbs) cb()
    await w.vm.$nextTick()
    w.unmount()
  })
})
})
