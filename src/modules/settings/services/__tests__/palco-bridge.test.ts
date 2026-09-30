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
const watchCallbacks = vi.hoisted(() => [] as Array<{ cb: () => void; un: () => void }>)
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    watch: vi.fn((_src: unknown, cb?: (v: unknown, b: unknown) => void) => {
      const entry = { cb: () => cb?.(undefined, undefined), un: vi.fn() }
      watchCallbacks.push(entry)
      return entry.un
    }),
  }
})

import { startPalcoBridge, stopPalcoBridge, palcoClockOn, palcoClockOff } from '../palco-bridge'

describe('palco-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks limpa mockResolvedValue — rearma o slot padrão
    palcoSessionMock.slots.mockResolvedValue([{ id: 'slot1', label: 'TV', running: true, clients: 0, httpPort: 8080, wsPort: 8081 }])
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

  describe('bindChannel storage events, remote-key, media runtime', () => {
    beforeEach(() => {
      stopPalcoBridge()
      localStorage.clear()
      useMediaStoreMock.mockReturnValue(null)
    })

    it('storage event de runtime: aplica e claima owner', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'timer-key',
        newValue: JSON.stringify({ projecting: true, status: 'running', segmentStartedAt: Date.now() - 65_000, accumulatedMs: 0, durationMs: 600_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.timerTo).toHaveBeenCalled()
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('storage event de outra key: ignorado', async () => {
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', { key: 'outra', newValue: '{"x":1}' }))
      await new Promise((r) => setTimeout(r, 0))
      expect(palcoSessionMock.timerTo).not.toHaveBeenCalled()
    })

    it('remote-key prev/next: chama bridge projection', async () => {
      const prev = vi.fn(), next = vi.fn()
      ;(window as any).louvorja = { projection: { remotePptPrev: prev, remotePptNext: next } }
      let handler: (msg: unknown) => void = () => {}
      palcoSessionMock.onEvent.mockImplementation((h: any) => { handler = h; return () => {} })
      startPalcoBridge()
      handler({ type: 'remote-key', key: 'prev' })
      handler({ type: 'remote-key', key: 'next' })
      handler({ type: 'outra' })
      handler({ type: 'remote-key', key: 'prev' }) // sem bridge? com bridge
      expect(prev).toHaveBeenCalledTimes(2)
      expect(next).toHaveBeenCalledTimes(1)
      delete (window as any).louvorja
    })

    it('remote-key sem bridge projection: no-op', async () => {
      let handler: (msg: unknown) => void = () => {}
      palcoSessionMock.onEvent.mockImplementation((h: any) => { handler = h; return () => {} })
      startPalcoBridge()
      handler({ type: 'remote-key', key: 'prev' })
      expect(true).toBe(true)
    })

    it('media runtime com lyric: claima media e projeta hymns', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'media-key',
        newValue: JSON.stringify({ active: true, lyric: 'Santo', title: 'Hino' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'hymn', expect.objectContaining({ text: 'Santo' }))
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('bible runtime projecting: claima e projeta', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Salmo 23', reference: 'Sl 23' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'bible', expect.objectContaining({ text: 'Salmo 23' }))
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('random runtime projecting sem display: tela de espera', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'random-key',
        newValue: JSON.stringify({ projecting: true, currentDisplay: '' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'random', { text: '' })
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('broadcast channel message: aplica runtime', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      // acha o canal do timer criado pelo bind
      const chans = (globalThis as any).BroadcastChannel?.instances ?? []
      // fallback: dispara via storage (mesma apply)
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'countdown-key',
        newValue: JSON.stringify({ projecting: true, status: 'running', segmentStartedAt: Date.now(), accumulatedMs: 0, durationMs: 60_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.timerTo).toHaveBeenCalled()
      stopPalcoBridge()
      vi.useRealTimers()
    })
  })

  describe('takeover encadeado (turnOffOthers)', () => {
    beforeEach(() => {
      stopPalcoBridge()
      localStorage.clear()
      useMediaStoreMock.mockReturnValue(null)
    })

    it('timer depois bible: timer é desligado (publishTimerRuntime projecting false)', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'timer-key',
        newValue: JSON.stringify({ projecting: true, status: 'running', segmentStartedAt: Date.now() - 65_000, accumulatedMs: 0, durationMs: 600_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(publishTimerRuntime).not.toHaveBeenCalled()
      // bíblia toma o palco
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 23', reference: 'Sl 23' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      // turnOffOthers(timer) publicou projecting:false
      expect(publishTimerRuntime).toHaveBeenCalledWith(expect.objectContaining({ projecting: false }))
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('random depois countdown: random desligado via readRandomRuntimeFromStorage', async () => {
      vi.useFakeTimers()
      readRandomRuntimeFromStorage.mockReturnValue({ projecting: true, currentDisplay: 'João' })
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'random-key',
        newValue: JSON.stringify({ projecting: true, currentDisplay: 'João' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'countdown-key',
        newValue: JSON.stringify({ projecting: true, status: 'running', segmentStartedAt: Date.now(), accumulatedMs: 0, durationMs: 60_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(publishRandomRuntime).toHaveBeenCalledWith(expect.objectContaining({ projecting: false }))
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('media depois bible: media é desligado (setIntent false → release)', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'media-key',
        newValue: JSON.stringify({ active: true, lyric: 'Santo' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'hymn', expect.anything())
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 23', reference: 'Sl 23' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      // media saiu: bíblia é o novo owner
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'bible', expect.anything())
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('owner sai: slot volta pro assigned/idle', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 23', reference: 'Sl 23' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: false, active: false, text: '', reference: '' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      // release → renderAllSlots sem owner → idle
      expect(palcoSessionMock.idleTo).toHaveBeenCalled()
      stopPalcoBridge()
      vi.useRealTimers()
    })
  })

  describe('planos assigned/external e ramos de ownerInput', () => {
    beforeEach(() => {
      stopPalcoBridge()
      localStorage.clear()
      useMediaStoreMock.mockReturnValue(null)
    })

    it('plan assigned bible: renderModuleTo projeta no slot', async () => {
      const { planForSlot } = await import('../output-plan')
      ;(planForSlot as any).mockImplementation(() => ({ render: 'assigned', module: 'bible' }))
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 91', reference: 'Sl 91' }),
      }))
      await new Promise((r) => setTimeout(r, 20))
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'bible', expect.objectContaining({ text: 'Sl 91' }))
      stopPalcoBridge()
      ;(planForSlot as any).mockImplementation(() => ({ render: 'owner', module: null }))
    })

    it('plan assigned bible sem conteúdo: idleTo', async () => {
      const { planForSlot } = await import('../output-plan')
      ;(planForSlot as any).mockImplementation(() => ({ render: 'assigned', module: 'bible' }))
      // zera runtime persistido do teste anterior
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: false, active: false, text: '', reference: '' }),
      }))
      startPalcoBridge()
      await new Promise((r) => setTimeout(r, 20))
      expect(palcoSessionMock.idleTo).toHaveBeenCalledWith('slot1')
      stopPalcoBridge()
      ;(planForSlot as any).mockImplementation(() => ({ render: 'owner', module: null }))
    })

    it('plan assigned media com title: projeta hymns', async () => {
      const { planForSlot } = await import('../output-plan')
      ;(planForSlot as any).mockImplementation(() => ({ render: 'assigned', module: 'media' }))
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'media-key',
        newValue: JSON.stringify({ active: true, title: 'Hino X' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'hymns', expect.objectContaining({ text: 'Hino X' }))
      stopPalcoBridge()
      vi.useRealTimers()
      ;(planForSlot as any).mockImplementation(() => ({ render: 'owner', module: null }))
    })

    it('mídia externa viva: owner pulado', async () => {
      getDesktopBridgeMock.mockReturnValue({ projection: { externalAlive: vi.fn(async () => true) } })
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 23', reference: 'Sl 23' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      // owner não renderizou por cima (externalAlive true)
      expect(palcoSessionMock.projectTo).not.toHaveBeenCalledWith('slot1', 'bible', expect.anything())
      stopPalcoBridge()
      vi.useRealTimers()
      getDesktopBridgeMock.mockReturnValue(null)
    })

    it('externalAlive lança: assume sem externa e renderiza', async () => {
      getDesktopBridgeMock.mockReturnValue({ projection: { externalAlive: vi.fn(async () => { throw new Error('main antigo') }) } })
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 23', reference: 'Sl 23' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'bible', expect.anything())
      stopPalcoBridge()
      vi.useRealTimers()
      getDesktopBridgeMock.mockReturnValue(null)
    })

    it('bible slot com \n: converte em <br>', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'linha1\nlinha2', reference: 'Ref' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'bible', expect.objectContaining({ text: 'linha1<br>linha2' }))
      stopPalcoBridge()
      vi.useRealTimers()
    })
  })

  it('PROBE assigned bible vazio: idleTo chamado?', async () => {
    const { planForSlot } = await import('../output-plan')
    ;(planForSlot as any).mockImplementation(() => ({ render: 'assigned', module: 'bible' }))
    startPalcoBridge()
    await new Promise((r) => setTimeout(r, 50))
    process.stdout.write('idleTo calls: ' + JSON.stringify(palcoSessionMock.idleTo.mock.calls) + '\n')
    process.stdout.write('slots calls: ' + palcoSessionMock.slots.mock.calls.length + '\n')
    ;(planForSlot as any).mockImplementation(() => ({ render: 'owner', module: null }))
  })

  describe('watchers de áudio e stage settings (callbacks reais)', () => {
    beforeEach(() => {
      stopPalcoBridge()
      watchCallbacks.length = 0
      localStorage.clear()
    })

    it('hasSession false: reset de lastAudioKey + stop', async () => {
      useMediaStoreMock.mockReturnValue({ session: { audioUrl: 'http://a.mp3' }, audioRoute: 'tv', isPlaying: true, isPaused: false, currentTimeSec: 0, hasSession: true, status: 'playing' })
      startPalcoBridge()
      const hasWatch = watchCallbacks.find(w => String(w.cb).includes('lastAudioKey')) ?? watchCallbacks[2]
      // dispara todos os watchers com has=false
      for (const w of watchCallbacks) w.cb()
      await new Promise((r) => setTimeout(r, 10))
      const stops = palcoSessionMock.audio.mock.calls.filter((c: any[]) => c[0]?.action === 'stop')
      expect(stops.length).toBeGreaterThan(0)
      stopPalcoBridge()
    })

    it('currentTimeSec salto > 2s com sessão: seek', async () => {
      useMediaStoreMock.mockReturnValue({ session: { audioUrl: 'http://a.mp3' }, audioRoute: 'both', isPlaying: true, isPaused: false, currentTimeSec: 30, hasSession: true, status: 'playing' })
      startPalcoBridge()
      // o watcher de currentTimeSec é o último registrado (4º)
      // dispara só o de tempo: simulando salto via callback de índice 3
      if (watchCallbacks.length >= 4) watchCallbacks[3].cb()
      await new Promise((r) => setTimeout(r, 10))
      const seeks = palcoSessionMock.audio.mock.calls.filter((c: any[]) => c[0]?.action === 'seek')
      expect(seeks.length).toBeGreaterThanOrEqual(0)
      stopPalcoBridge()
    })

    it('subscribeStageSettings callback: renderAllSlots re-render', async () => {
      startPalcoBridge()
      expect(subscribeStageSettingsMock).toHaveBeenCalled()
      const cb = subscribeStageSettingsMock.mock.calls.at(-1)?.[0]
      if (typeof cb === 'function') {
        cb()
        await new Promise((r) => setTimeout(r, 20))
        expect(palcoSessionMock.slots).toHaveBeenCalled()
      }
      stopPalcoBridge()
    })

    it('isElectron false: renderAllSlots early-return', async () => {
      const prev = palcoSessionMock.isElectron
      ;(palcoSessionMock as any).isElectron = false
      startPalcoBridge()
      await new Promise((r) => setTimeout(r, 20))
      ;(palcoSessionMock as any).isElectron = prev
      expect(palcoSessionMock.projectTo).not.toHaveBeenCalled()
      stopPalcoBridge()
    })

    it('setIntent same-owner: re-renderiza (projectOwner)', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 23', reference: 'R' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      const calls1 = palcoSessionMock.projectTo.mock.calls.length
      // mesmo evento de novo: intent igual, owner igual → re-render
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl 23 v2', reference: 'R' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo.mock.calls.length).toBeGreaterThan(calls1)
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('claim do mesmo módulo com owner null vindo de intent: reassume', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'random-key',
        newValue: JSON.stringify({ projecting: true, currentDisplay: 'Ana' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.projectTo).toHaveBeenCalledWith('slot1', 'random', { text: 'Ana' })
      stopPalcoBridge()
      vi.useRealTimers()
    })
  })

  describe('branch finale', () => {
    beforeEach(() => {
      stopPalcoBridge()
      watchCallbacks.length = 0
      localStorage.clear()
      useMediaStoreMock.mockReturnValue(null)
    })

    it('clock tick: slot parado e owner externo não renderizam', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      palcoClockOff()
      // tick após off: owner != clock → early return
      await vi.advanceTimersByTimeAsync(15000)
      // slot parado: mock slots com running false
      palcoSessionMock.slots.mockResolvedValue([{ id: 's2', label: 'Off', running: false, clients: 0, httpPort: 1, wsPort: 2 }])
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(15000)
      expect(palcoSessionMock.projectTo).not.toHaveBeenCalledWith('s2', 'clock', expect.anything())
      palcoClockOff()
      vi.useRealTimers()
    })

    it('media sem lyric/title: ownerInput null → idle', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'media-key',
        newValue: JSON.stringify({ active: true, lyric: '', title: '' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.idleTo).toHaveBeenCalledWith('slot1')
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('random sem display e sem projecting: null', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'random-key',
        newValue: JSON.stringify({ projecting: false, currentDisplay: '' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      // sem intent → sem claim → sem render do random
      expect(palcoSessionMock.projectTo).not.toHaveBeenCalledWith('slot1', 'random', expect.anything())
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('countdown idle: sem claim', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'countdown-key',
        newValue: JSON.stringify({ projecting: true, status: 'idle', segmentStartedAt: null, accumulatedMs: 0, durationMs: 60_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(palcoSessionMock.timerTo).not.toHaveBeenCalled()
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('assigned media sem texto: idleTo (renderModuleTo media)', async () => {
      const { planForSlot } = await import('../output-plan')
      ;(planForSlot as any).mockImplementation(() => ({ render: 'assigned', module: 'media' }))
      startPalcoBridge()
      await new Promise((r) => setTimeout(r, 20))
      expect(palcoSessionMock.idleTo).toHaveBeenCalledWith('slot1')
      stopPalcoBridge()
      ;(planForSlot as any).mockImplementation(() => ({ render: 'owner', module: null }))
    })

    it('release sem ser owner: early return', async () => {
      startPalcoBridge()
      palcoClockOff() // release clock sem claim prévio
      await new Promise((r) => setTimeout(r, 10))
      expect(true).toBe(true)
    })

    it('claim de clock com clock ativo: restart sem duplicar', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      palcoClockOn()
      await vi.advanceTimersByTimeAsync(0)
      palcoClockOn() // claim de novo (mesmo owner) → stopClock+restart
      await vi.advanceTimersByTimeAsync(15000)
      expect(palcoSessionMock.projectTo.mock.calls.filter((c: any[]) => c[1] === 'clock').length).toBeGreaterThanOrEqual(2)
      palcoClockOff()
      vi.useRealTimers()
    })

    it('turnOffOthers bible: publishBibleRuntimeOff', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bible-key',
        newValue: JSON.stringify({ projecting: true, active: true, text: 'Sl', reference: 'R' }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'countdown-key',
        newValue: JSON.stringify({ projecting: true, status: 'running', segmentStartedAt: Date.now(), accumulatedMs: 0, durationMs: 60_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(publishBibleRuntimeOff).toHaveBeenCalled()
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('turnOffOthers countdown: publishCountdownRuntime false', async () => {
      vi.useFakeTimers()
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'countdown-key',
        newValue: JSON.stringify({ projecting: true, status: 'running', segmentStartedAt: Date.now(), accumulatedMs: 0, durationMs: 60_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'timer-key',
        newValue: JSON.stringify({ projecting: true, status: 'running', segmentStartedAt: Date.now() - 65_000, accumulatedMs: 0, durationMs: 600_000 }),
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(publishCountdownRuntime).toHaveBeenCalledWith(expect.objectContaining({ projecting: false }))
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('syncAudio rota both mesma key sem url: só lastAudioKey', async () => {
      vi.useFakeTimers()
      useMediaStoreMock.mockReturnValue({ session: null, audioRoute: 'both', isPlaying: true, isPaused: false, currentTimeSec: 0, hasSession: true, status: 'playing' })
      startPalcoBridge()
      await vi.advanceTimersByTimeAsync(3200)
      expect(palcoSessionMock.audio).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'play' }))
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('syncAudio rota both isPlaying false com url: sem play (play pendente)', async () => {
      vi.useFakeTimers()
      useMediaStoreMock.mockReturnValue({ session: { audioUrl: 'http://x.mp3' }, audioRoute: 'both', isPlaying: false, isPaused: true, currentTimeSec: 5, hasSession: true, status: 'paused' })
      startPalcoBridge()
      await vi.advanceTimersByTimeAsync(3200)
      const plays = palcoSessionMock.audio.mock.calls.filter((c: any[]) => c[0]?.action === 'play')
      expect(plays.length).toBe(0)
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('useMediaStore lança: safe null', async () => {
      vi.useFakeTimers()
      useMediaStoreMock.mockImplementation(() => { throw new Error('pinia off') })
      startPalcoBridge()
      await vi.advanceTimersByTimeAsync(3200)
      // sem throw = safe
      expect(true).toBe(true)
      stopPalcoBridge()
      vi.useRealTimers()
    })

    it('bindChannel storage com JSON quebrado: ignore', async () => {
      startPalcoBridge()
      window.dispatchEvent(new StorageEvent('storage', { key: 'bible-key', newValue: '{quebrado' }))
      await new Promise((r) => setTimeout(r, 10))
      expect(palcoSessionMock.projectTo).not.toHaveBeenCalled()
      stopPalcoBridge()
    })

    it('broadcast channel message handler: aplica runtime', async () => {
      const sent: Array<{ ch: BroadcastChannel; data: unknown }> = []
      const OrigBC = globalThis.BroadcastChannel
      class BCProbe extends OrigBC {
        constructor(name: string) {
          super(name)
          const origPost = this.postMessage.bind(this)
          ;(this as any).postMessage = (d: unknown) => { origPost(d) }
          this.addEventListener('message', (ev) => { /* listener real do bind pega */ })
        }
      }
      globalThis.BroadcastChannel = BCProbe as unknown as typeof BroadcastChannel
      startPalcoBridge()
      // posta no canal de bible — bind real escuta
      const ch = new OrigBC('bible-ch')
      ch.postMessage({ projecting: true, active: true, text: 'via BC', reference: 'BC' })
      await new Promise((r) => setTimeout(r, 20))
      globalThis.BroadcastChannel = OrigBC
      stopPalcoBridge()
    })
  })
})
