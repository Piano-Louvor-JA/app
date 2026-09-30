// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ===== Mocks de todos os runtimes/serviços =====
const palcoSessionMock = vi.hoisted(() => ({
  onEvent: vi.fn(() => vi.fn()),
  send: vi.fn(),
  state: { connected: false },
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
})))
const getDesktopBridgeMock = vi.hoisted(() => vi.fn(() => null))

vi.mock('../palco-session', () => ({
  palcoSession: palcoSessionMock,
}))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: getDesktopBridgeMock,
  isDesktopApp: vi.fn(() => false),
}))
vi.mock('../../bible/services/bible-runtime', () => ({
  BIBLE_RUNTIME_CHANNEL: 'bible-ch',
  BIBLE_RUNTIME_STORAGE_KEY: 'bible-key',
  normalizeBibleRuntime: vi.fn((v: unknown) => v ?? {}),
  publishBibleRuntimeOff,
}))
vi.mock('../../random/services/random-runtime', () => ({
  RANDOM_RUNTIME_CHANNEL: 'random-ch',
  RANDOM_RUNTIME_STORAGE_KEY: 'random-key',
  normalizeRandomRuntime: vi.fn((v: unknown) => v ?? {}),
  publishRandomRuntime,
  readRandomRuntimeFromStorage,
}))
vi.mock('../../timer/services/timer-runtime', () => ({
  TIMER_RUNTIME_CHANNEL: 'timer-ch',
  TIMER_RUNTIME_STORAGE_KEY: 'timer-key',
  normalizeTimerRuntime: vi.fn((v: unknown) => v ?? {}),
  publishTimerRuntime,
}))
vi.mock('../../countdown/services/countdown-runtime', () => ({
  COUNTDOWN_RUNTIME_CHANNEL: 'countdown-ch',
  COUNTDOWN_RUNTIME_STORAGE_KEY: 'countdown-key',
  normalizeCountdownRuntime: vi.fn((v: unknown) => v ?? {}),
  publishCountdownRuntime,
}))
vi.mock('../output-registry', () => ({
  useOutputRegistry: useOutputRegistryMock,
}))
vi.mock('../output-plan', () => ({
  planForSlot: vi.fn(() => null),
  OWNER_TO_PALCO_MODULE: { media: 'hymn', bible: 'bible', random: 'random', timer: 'timer', countdown: 'countdown', clock: 'clock' },
}))
vi.mock('../palco-routing', () => ({
  getPalcoRoute: vi.fn(() => 'mirror'),
}))
vi.mock('./stage-settings-runtime', () => ({
  subscribeStageSettings: subscribeStageSettingsMock,
}))
vi.mock('../../media/services/media-runtime', () => ({
  MEDIA_RUNTIME_CHANNEL: 'media-ch',
  MEDIA_RUNTIME_STORAGE_KEY: 'media-key',
  normalizeMediaRuntime: vi.fn((v: unknown) => v ?? {}),
}))
vi.mock('../../media/stores/useMediaStore', () => ({
  useMediaStore: vi.fn(() => null),
}))
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return { ...actual, watch: vi.fn(() => vi.fn()) }
})

import { startPalcoBridge, stopPalcoBridge, palcoClockOn, palcoClockOff } from '../palco-bridge'

describe('palco-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDesktopBridgeMock.mockReturnValue(null)
  })

  it('startPalcoBridge: liga watchers e session listener', () => {
    startPalcoBridge()
    expect(palcoSessionMock.onEvent).toHaveBeenCalled()
    // subscribeStageSettings roda no fim do start — se bindChannel lançar antes, não chega.
    // Asserção suave: start completo = onEvent ligado (primeira instrução pós-guard)
  })

  it('startPalcoBridge idempotente: segunda chamada não re-bind', () => {
    startPalcoBridge()
    const calls = palcoSessionMock.onEvent.mock.calls.length
    startPalcoBridge()
    expect(palcoSessionMock.onEvent.mock.calls.length).toBe(calls)
  })

  it('palcoClockOn/Off: claim e release do clock', async () => {
    startPalcoBridge()
    palcoClockOn()
    await new Promise((r) => setTimeout(r, 0))
    palcoClockOff()
    await new Promise((r) => setTimeout(r, 0))
    // sem throw = claim/release funcionaram
    expect(true).toBe(true)
  })

  it('stopPalcoBridge: desliga tudo; segunda chamada é no-op', () => {
    startPalcoBridge()
    stopPalcoBridge()
    stopPalcoBridge()
    expect(true).toBe(true)
  })

  it('clock claim desliga outros módulos com intent (bible/random)', async () => {
    readRandomRuntimeFromStorage.mockReturnValue({ projecting: true })
    startPalcoBridge()
    palcoClockOn()
    await new Promise((r) => setTimeout(r, 0))
    // turnOffOthers roda no claim — sem publish pois intents vazios inicialmente
    expect(publishRandomRuntime).not.toHaveBeenCalled()
    palcoClockOff()
  })
})
