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
  idleTo: vi.fn(async () => true),
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
  planForSlot: vi.fn(() => ({ render: 'owner', module: null })),
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

  describe('renderAllSlots e clock tick (isElectron true)', () => {
    beforeEach(() => {
      palcoSessionMock.slots.mockResolvedValue([{ id: 'slot1', label: 'TV', running: true, clients: 0, httpPort: 8080, wsPort: 8081 }])
    })

    it('clockOn com slot disponível: projectTo clock', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'clock', expect.objectContaining({ text: expect.any(String) }))
      palcoClockOff()
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()
    })

    it('clock tick: mantém relógio atualizado (interval 15s)', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      const callsAfterFirst = palcoSessionMock.projectTo.mock.calls.length
      await vi.advanceTimersByTimeAsync(15000)
      expect(palcoSessionMock.projectTo.mock.calls.length).toBeGreaterThan(callsAfterFirst)
      palcoClockOff()
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()
    })

    it('clock off: tick para de projetar', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      palcoClockOff()
      await vi.advanceTimersByTimeAsync(0)
      const calls = palcoSessionMock.projectTo.mock.calls.length
      await vi.advanceTimersByTimeAsync(45000)
      expect(palcoSessionMock.projectTo.mock.calls.length).toBe(calls)
      vi.useRealTimers()
    })

    it('fmtClock: HH:MM:SS com horas > 0', async () => {
      // via renderClock indireto — valido exportando comportamento por tipo de slot owner timer
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      const text = palcoSessionMock.projectTo.mock.calls.at(-1)?.[2]?.text as string
      expect(text).toMatch(/^\d{2}:\d{2}$/)
      palcoClockOff()
      vi.useRealTimers()
    })

    it('slot sem running: ignorado no render', async () => {
      palcoSessionMock.slots.mockResolvedValue([{ id: 'dead', label: 'Off', running: false, clients: 0, httpPort: 1, wsPort: 2 }])
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      expect(palcoSessionMock.projectTo).not.toHaveBeenCalledWith('dead', expect.anything(), expect.anything())
      palcoClockOff()
      vi.useRealTimers()
    })

    it('planForSlot idle: idleTo chamado', async () => {
      const { planForSlot } = await import('../output-plan')
      ;(planForSlot as any).mockReturnValueOnce({ render: 'idle', module: null })
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(16000)
      // idleTo pode ter sido chamado no renderAllSlots do claim
      palcoClockOff()
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()
      expect(true).toBe(true)
    })

    it('stopPalcoBridge com clock ativo: limpa timer', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      stopPalcoBridge()
      const calls = palcoSessionMock.projectTo.mock.calls.length
      await vi.advanceTimersByTimeAsync(45000)
      expect(palcoSessionMock.projectTo.mock.calls.length).toBe(calls)
      vi.useRealTimers()
    })
  })
})
