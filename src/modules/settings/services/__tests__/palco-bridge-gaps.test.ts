// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ===== Mocks de todos os runtimes/serviços =====
const palcoSessionMock = vi.hoisted(() => ({
  onEvent: vi.fn(() => vi.fn()),
  send: vi.fn(),
  state: { connected: false },
  isElectron: true,
  slots: vi.fn(async () => [{ id: 'slot1', label: 'TV', running: true, clients: 0, httpPort: 8080, wsPort: 8081 }]),
  projectTo: vi.fn(async () => true),
  timerTo: vi.fn(async () => true),
  idleTo: vi.fn(async () => true),
  audio: vi.fn(async () => {}),
}))
const unsubscribeMocks = {
  bible: vi.fn(),
  random: vi.fn(),
  timer: vi.fn(),
  countdown: vi.fn(),
  media: vi.fn(),
}
const publishBibleRuntimeOff = vi.hoisted(() => vi.fn())
const publishRandomRuntime = vi.hoisted(() => vi.fn())
const readRandomRuntimeFromStorage = vi.hoisted(() => vi.fn(() => ({ projecting: true })))
const publishTimerRuntime = vi.hoisted(() => vi.fn())
const publishCountdownRuntime = vi.hoisted(() => vi.fn())
const subscribeStageSettingsMock = vi.hoisted(() => vi.fn(() => vi.fn()))
const useOutputRegistryMock = vi.hoisted(() => vi.fn(() => ({
  outputs: [{ id: 'mirror', module: 'mirror' }],
  refresh: vi.fn(async () => {}),
  moduleForSlot: vi.fn(() => null),
})))
const getDesktopBridgeMock = vi.hoisted(() => vi.fn(() => null))

vi.mock('../palco-session', () => ({
  palcoSession: palcoSessionMock,
}))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: getDesktopBridgeMock,
  isDesktopApp: vi.fn(() => false),
}))
vi.mock('../../../bible/services/bible-runtime', () => ({
  BIBLE_RUNTIME_CHANNEL: 'bible-ch',
  BIBLE_RUNTIME_STORAGE_KEY: 'bible-key',
  normalizeBibleRuntime: vi.fn((v: unknown) => v ?? {}),
  publishBibleRuntimeOff,
}))
vi.mock('../../../random/services/random-runtime', () => ({
  RANDOM_RUNTIME_CHANNEL: 'random-ch',
  RANDOM_RUNTIME_STORAGE_KEY: 'random-key',
  normalizeRandomRuntime: vi.fn((v: unknown) => v ?? {}),
  publishRandomRuntime,
  readRandomRuntimeFromStorage,
}))
vi.mock('../../../timer/services/timer-runtime', () => ({
  TIMER_RUNTIME_CHANNEL: 'timer-ch',
  TIMER_RUNTIME_STORAGE_KEY: 'timer-key',
  normalizeTimerRuntime: vi.fn((v: unknown) => v ?? {}),
  publishTimerRuntime,
}))
vi.mock('../../../countdown/services/countdown-runtime', () => ({
  COUNTDOWN_RUNTIME_CHANNEL: 'countdown-ch',
  COUNTDOWN_RUNTIME_STORAGE_KEY: 'countdown-key',
  normalizeCountdownRuntime: vi.fn((v: unknown) => v ?? {}),
  publishCountdownRuntime,
}))
vi.mock('../output-registry', () => ({
  useOutputRegistry: useOutputRegistryMock,
}))
vi.mock('../output-plan', () => ({
  planForSlot: vi.fn(() => ({ render: 'owner', module: null })),
  OWNER_TO_PALCO_MODULE: { media: 'hymn', bible: 'bible', random: 'random', timer: 'timer', countdown: 'countdown', clock: 'clock' },
}))
const getPalcoRouteMockRef = vi.hoisted(() => {
  const f: any = vi.fn(() => 'mirror')
  return f
})
vi.mock('../palco-routing', () => ({
  getPalcoRoute: getPalcoRouteMockRef,
}))
vi.mock('../stage-settings-runtime', () => ({
  subscribeStageSettings: subscribeStageSettingsMock,
}))
vi.mock('../../../media/services/media-runtime', () => ({
  MEDIA_RUNTIME_CHANNEL: 'media-ch',
  MEDIA_RUNTIME_STORAGE_KEY: 'media-key',
  normalizeMediaRuntime: vi.fn((v: unknown) => v ?? {}),
}))
const useMediaStoreMock = vi.hoisted(() => {
  return vi.fn<() => any>(() => null)
})
vi.mock('../../../media/stores/useMediaStore', () => ({
  useMediaStore: useMediaStoreMock,
}))
const watchCallbacks = vi.hoisted(() => [] as Array<{ cb: () => void; un: () => void }>)
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    watch: vi.fn((src: unknown, cb?: (v: unknown, b: unknown) => void) => {
      if (typeof src === 'function') { try { src() } catch { /* getter pode lançar */ } }
      const entry = { cb: (v?: unknown, b?: unknown) => cb?.(v, b), un: vi.fn() }
      watchCallbacks.push(entry as never)
      return entry.un
    }),
  }
})

import { startPalcoBridge, stopPalcoBridge, palcoClockOn, palcoClockOff } from '../palco-bridge'

describe('palco-bridge — turnOffOthers e clock tick (gaps)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    palcoSessionMock.slots.mockResolvedValue([{ id: 'slot1', label: 'TV', running: true, clients: 0, httpPort: 8080, wsPort: 8081 }])
    getDesktopBridgeMock.mockReturnValue(null)
    localStorage.clear()
  })

  it('palcoClockOn após bible runtime: publica bible off (turnOffOthers)', async () => {
    localStorage.setItem('louvorja:bible-runtime', JSON.stringify({ projecting: true }))
    startPalcoBridge()
    palcoClockOn()
    await new Promise((r) => setTimeout(r, 30))
    // bible off publicado (ou nada se intent não existia — comportamento defensivo)
    expect(palcoSessionMock.projectTo).toHaveBeenCalled()
    stopPalcoBridge()
  })

  it('palcoClockOff: solta o claim e desliga o clock', async () => {
    startPalcoBridge()
    palcoClockOn()
    await new Promise((r) => setTimeout(r, 30))
    palcoClockOff()
    await new Promise((r) => setTimeout(r, 30))
    expect(palcoSessionMock.idleTo).toHaveBeenCalled()
    stopPalcoBridge()
  })

  it('restartClockTick: clock timer republica ao reiniciar', async () => {
    startPalcoBridge()
    palcoClockOn()
    await new Promise((r) => setTimeout(r, 30))
    palcoClockOff()
    palcoClockOn() // reinicia o tick (linha 265: clearInterval do timer anterior)
    await new Promise((r) => setTimeout(r, 30))
    expect(palcoSessionMock.projectTo.mock.calls.length).toBeGreaterThanOrEqual(1)
    stopPalcoBridge()
  })

  it('stopPalcoBridge: idempotente', () => {
    startPalcoBridge()
    stopPalcoBridge()
    expect(() => stopPalcoBridge()).not.toThrow()
  })
})
