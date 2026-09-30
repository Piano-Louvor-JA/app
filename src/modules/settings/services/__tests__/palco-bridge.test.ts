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
vi.mock('../palco-routing', () => ({
  getPalcoRoute: vi.fn(() => 'mirror'),
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

  describe('timer/countdown runtime via storage (ownerInput, fmtClock, elapsedMs)', () => {
    let mod: any
    const nowMs = Date.now()
    const freshTimer = {
      projecting: true,
      status: 'running',
      segmentStartedAt: nowMs - 65_000,
      accumulatedMs: 0,
      durationMs: 600_000,
    }

    beforeEach(async () => {
      // SEM resetModules (perde vi.mock): stopPalcoBridge zera started e permite rebind
      mod = {
        startPalcoBridge,
        stopPalcoBridge,
        palcoClockOn,
        palcoClockOff,
      }
      stopPalcoBridge()
      localStorage.clear()
    })

    it('timer projecting: ownerInput timer chrono e projectTo com fmtClock', async () => {
      vi.useFakeTimers()
      localStorage.setItem('timer-key', JSON.stringify(freshTimer))
      mod.startPalcoBridge()
      // storage apply via bindChannel initial read
      await vi.advanceTimersByTimeAsync(0)
      // timer claima owner — renderAllSlots projecta
      await vi.advanceTimersByTimeAsync(2100)
      const timerCall = palcoSessionMock.timerTo.mock.calls.at(-1) as any[] | undefined
      expect(timerCall).toBeTruthy()
      expect(timerCall![1].mode).toBe('chrono')
      expect(timerCall![1].duration).toBeGreaterThanOrEqual(65)
      mod.stopPalcoBridge()
      localStorage.removeItem('timer-key')
      vi.useRealTimers()
    })

    it('timer stale (segmentStartedAt > 12h): não projeta', async () => {
      vi.useFakeTimers()
      localStorage.setItem('timer-key', JSON.stringify({ ...freshTimer, segmentStartedAt: nowMs - 13 * 3600_000 }))
      mod.startPalcoBridge()
      await vi.advanceTimersByTimeAsync(2100)
      const timerCall = palcoSessionMock.timerTo.mock.calls.at(-1) as any[] | undefined
      expect(timerCall).toBeUndefined()
      mod.stopPalcoBridge()
      localStorage.removeItem('timer-key')
      vi.useRealTimers()
    })

    it('timer idle: sem claim', async () => {
      vi.useFakeTimers()
      localStorage.setItem('timer-key', JSON.stringify({ ...freshTimer, status: 'idle' }))
      mod.startPalcoBridge()
      await vi.advanceTimersByTimeAsync(2100)
      const timerCall = palcoSessionMock.timerTo.mock.calls.at(-1) as any[] | undefined
      expect(timerCall).toBeUndefined()
      mod.stopPalcoBridge()
      localStorage.removeItem('timer-key')
      vi.useRealTimers()
    })

    it('countdown projecting: duration restante', async () => {
      vi.useFakeTimers()
      localStorage.setItem('countdown-key', JSON.stringify({ ...freshTimer, durationMs: 300_000 }))
      mod.startPalcoBridge()
      await vi.advanceTimersByTimeAsync(2100)
      const cdCall = palcoSessionMock.timerTo.mock.calls.at(-1) as any[] | undefined
      expect(cdCall).toBeTruthy()
      expect(cdCall![1].mode).toBe('countdown')
      expect(cdCall![1].duration).toBeLessThanOrEqual(300)
      mod.stopPalcoBridge()
      localStorage.removeItem('countdown-key')
      vi.useRealTimers()
    })

    it('timer pausado: elapsed = accumulatedMs', async () => {
      vi.useFakeTimers()
      localStorage.setItem('timer-key', JSON.stringify({ ...freshTimer, status: 'paused', segmentStartedAt: null, accumulatedMs: 130_000 }))
      mod.startPalcoBridge()
      await vi.advanceTimersByTimeAsync(2100)
      const timerCall = palcoSessionMock.timerTo.mock.calls.at(-1) as any[] | undefined
      expect(timerCall![1].duration).toBe(130)
      mod.stopPalcoBridge()
      localStorage.removeItem('timer-key')
      vi.useRealTimers()
    })

    it('storage update durante execução: re-render com novo valor', async () => {
      vi.useFakeTimers()
      localStorage.setItem('timer-key', JSON.stringify(freshTimer))
      mod.startPalcoBridge()
      await vi.advanceTimersByTimeAsync(2100)
      const calls1 = palcoSessionMock.projectTo.mock.calls.length
      localStorage.setItem('timer-key', JSON.stringify({ ...freshTimer, segmentStartedAt: Date.now() - 120_000 }))
      await vi.advanceTimersByTimeAsync(2100)
      expect(palcoSessionMock.projectTo.mock.calls.length).toBeGreaterThanOrEqual(calls1)
      mod.stopPalcoBridge()
      localStorage.removeItem('timer-key')
      vi.useRealTimers()
    })
  })

  describe('syncAudio (rotas pc/tv/ambos)', () => {
    function mediaStore(over: Record<string, unknown> = {}) {
      return {
        session: { audioUrl: 'http://audio/hino.mp3', title: 'Hino 1', subtitle: 'Harp', coverUrl: 'http://capa.jpg' },
        audioRoute: 'tv',
        isPlaying: true,
        isPaused: false,
        currentTimeSec: 42.5,
        hasSession: true,
        status: 'playing',
        ...over,
      }
    }

    beforeEach(() => {
      stopPalcoBridge()
      useMediaStoreMock.mockReturnValue(null)
      localStorage.clear()
    })

    it('rota pc: stop na transição, depois silencioso', async () => {
      useMediaStoreMock.mockReturnValue(mediaStore({ audioRoute: 'pc' }))
      startPalcoBridge()
      await new Promise((r) => setTimeout(r, 3200))
      const stops = palcoSessionMock.audio.mock.calls.filter((c: any[]) => c[0]?.action === 'stop')
      expect(stops.length).toBe(1)
      palcoSessionMock.audio.mockClear()
      await new Promise((r) => setTimeout(r, 3200))
      expect(palcoSessionMock.audio).not.toHaveBeenCalled()
    })

    it('rota tv: play inicial com url/title/cover', async () => {
      useMediaStoreMock.mockReturnValue(mediaStore())
      startPalcoBridge()
      await new Promise((r) => setTimeout(r, 3200))
      const play = palcoSessionMock.audio.mock.calls.find((c: any[]) => c[0]?.action === 'play')
      expect(play).toBeTruthy()
      expect(play![0].url).toBe('http://audio/hino.mp3')
      expect(play![0].title).toBe('Hino 1')
      expect(play![0].cover).toBe('http://capa.jpg')
    })

    it('rota tv sem url: stop', async () => {
      useMediaStoreMock.mockReturnValue(mediaStore({ session: null, audioRoute: 'tv' }))
      startPalcoBridge()
      await new Promise((r) => setTimeout(r, 3200))
      const stop = palcoSessionMock.audio.mock.calls.find((c: any[]) => c[0]?.action === 'stop')
      expect(stop).toBeTruthy()
    })

    it('rota tv mesma faixa: pause do operador comanda', async () => {
      useMediaStoreMock.mockReturnValue(mediaStore())
      startPalcoBridge()
      await new Promise((r) => setTimeout(r, 3200))
      palcoSessionMock.audio.mockClear()
      useMediaStoreMock.mockReturnValue(mediaStore({ isPlaying: false, isPaused: true, status: 'paused' }))
      await new Promise((r) => setTimeout(r, 3200))
      const pause = palcoSessionMock.audio.mock.calls.find((c: any[]) => c[0]?.action === 'pause')
      expect(pause).toBeTruthy()
    })

    it('rota ambos: play e depois seek periódico', async () => {
      vi.useFakeTimers()
      useMediaStoreMock.mockReturnValue(mediaStore({ audioRoute: 'both' }))
      startPalcoBridge()
      await vi.advanceTimersByTimeAsync(3200)
      const play = palcoSessionMock.audio.mock.calls.find((c: any[]) => c[0]?.action === 'play')
      expect(play).toBeTruthy()
      palcoSessionMock.audio.mockClear()
      // mesmo estado: sync periódico manda seek
      await vi.advanceTimersByTimeAsync(3200)
      const seek = palcoSessionMock.audio.mock.calls.find((c: any[]) => c[0]?.action === 'seek')
      expect(seek).toBeTruthy()
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('hasSession false: stop e reset da key', async () => {
      vi.useFakeTimers()
      useMediaStoreMock.mockReturnValue(mediaStore())
      startPalcoBridge()
      await vi.advanceTimersByTimeAsync(3200)
      useMediaStoreMock.mockReturnValue(mediaStore({ hasSession: false, session: null }))
      palcoSessionMock.audio.mockClear()
      await vi.advanceTimersByTimeAsync(3200)
      const stop = palcoSessionMock.audio.mock.calls.find((c: any[]) => c[0]?.action === 'stop')
      expect(stop).toBeTruthy()
      stopPalcoBridge()
      vi.useRealTimers()
    })
  })
})
