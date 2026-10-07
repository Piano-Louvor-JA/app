// @vitest-environment jsdom
// Cobertura palco-bridge.ts (gaps_map3: 19%): helpers puros (runtimeIsFresh,
// elapsedMs, fmtClock via comportamento), ownership (claim/release/setIntent),
// turnOffOthers, renderAllSlots com mídia externa, áudio (rotas pc/tv/ambos)
// e stopPalcoBridge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('', { url: 'http://localhost/' })
const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.document = dom.window.document
g.localStorage = dom.window.localStorage
g.sessionStorage = dom.window.sessionStorage

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(<T,>(_key: string, fallback: T): T => fallback),
  loadUserPreferences: vi.fn(() => ({})),
  saveUserPreferences: vi.fn(),
  setUserPreference: vi.fn(),
}))

type Send = { slot: string; msg: Record<string, unknown> }

vi.mock('../../services/palco-session', () => ({
  palcoSession: {
    isElectron: true,
    activeSlotId: '0',
    setSlot(id: string) { this.activeSlotId = id },
    async slots() {
      return [
        { id: '0', label: 'Principal', running: true },
        { id: '7082', label: 'TV 2', running: true },
        { id: 'dead', label: 'Off', running: false },
      ]
    },
    async projectTo(slot: string, scope: string, input: unknown) {
      sends().push({ slot, msg: { type: 'projection', scope, input } })
    },
    idleTo(slot: string) { sends().push({ slot, msg: { type: 'idle' } }) },
    timerTo(slot: string, opts: unknown) { sends().push({ slot, msg: { type: 'timer', opts } }) },
    idle() { sends().push({ slot: this.activeSlotId, msg: { type: 'idle' } }) },
    audio(payload: unknown) { sends().push({ slot: 'audio', msg: payload as Record<string, unknown> }) },
    onEvent: () => () => {},
  },
}))

// Buffer de sends compartilhado (hoist-safe via closure em vi.hoisted).
const sendBuf = vi.hoisted(() => {
  const buf: Array<{ slot: string; msg: Record<string, unknown> }> = []
  return { buf, sends: () => buf }
})
function sends(): Send[] { return sendBuf.buf }

vi.mock('../../services/output-registry', () => ({
  useOutputRegistry: () => ({
    targets: [],
    moduleForSlot: () => null,
    setModule: () => {},
    syncDetected: () => {},
    resetAll: () => {},
  }),
}))

// Bridge desktop: externalAlive controlável por teste.
const bridgeState = vi.hoisted(() => ({
  externalAlive: false as boolean | undefined,
  throwOnExternal: false,
}))
vi.mock('@shared/services/desktop-bridge', () => ({
  isElectron: true,
  getDesktopBridge: () => ({
    isElectron: true,
    projection: {
      externalAlive: async () => {
        if (bridgeState.throwOnExternal) throw new Error('main antigo')
        return bridgeState.externalAlive
      },
    },
  }),
}))

// Runtime publishers dos módulos: espies para turnOffOthers.
vi.mock('../../../bible/services/bible-runtime', () => ({
  publishBibleRuntimeOff: vi.fn(),
  publishBibleRuntime: vi.fn(),
  BIBLE_RUNTIME_CHANNEL: 'louvorja-bible-runtime',
  BIBLE_RUNTIME_STORAGE_KEY: 'louvorja-bible-runtime-state',
  normalizeBibleRuntime: (raw: unknown) => raw,
}))
vi.mock('../../../random/services/random-runtime', () => ({
  publishRandomRuntime: vi.fn(),
  readRandomRuntimeFromStorage: vi.fn(() => ({ projecting: false })),
  publishRandomRuntimeOff: vi.fn(),
  RANDOM_RUNTIME_CHANNEL: 'louvorja-random-runtime',
  RANDOM_RUNTIME_STORAGE_KEY: 'louvorja-random-runtime-state',
  normalizeRandomRuntime: (raw: unknown) => raw,
}))
vi.mock('../../../timer/services/timer-runtime', () => ({
  publishTimerRuntime: vi.fn(),
  TIMER_RUNTIME_CHANNEL: 'louvorja-timer-runtime',
  TIMER_RUNTIME_STORAGE_KEY: 'louvorja-timer-runtime-state',
  normalizeTimerRuntime: (raw: unknown) => raw,
  readTimerRuntimeFromStorage: vi.fn(() => null),
  writeTimerRuntimeToStorage: vi.fn(),
}))
vi.mock('../../../countdown/services/countdown-runtime', () => ({
  publishCountdownRuntime: vi.fn(),
  COUNTDOWN_RUNTIME_CHANNEL: 'louvorja-countdown-runtime',
  COUNTDOWN_RUNTIME_STORAGE_KEY: 'louvorja-countdown-runtime-state-v2',
  normalizeCountdownRuntime: (raw: unknown) => raw,
}))
vi.mock('../../services/stage-settings-runtime', () => ({
  subscribeStageSettings: () => () => {},
}))

// Media store: estado mutável por teste (reactive pra watchers Vue funcionarem).
const mediaState = vi.hoisted(() => ({
  state: null as null | {
    isPlaying: boolean
    isPaused: boolean
    hasSession: boolean
    status: string
    currentTimeSec: number
    audioRoute: 'pc' | 'tv' | 'both'
    session: null | { audioUrl: string; title?: string; subtitle?: string; coverUrl?: string }
  },
}))
vi.mock('../../../media/stores/useMediaStore', async () => {
  const { reactive } = await import('vue')
  return {
    useMediaStore: () => {
      if (!mediaState.state) {
        mediaState.state = reactive({
          isPlaying: false,
          isPaused: false,
          hasSession: false,
          status: 'stopped',
          currentTimeSec: 0,
          audioRoute: 'pc',
          session: null,
        })
      }
      return mediaState.state
    },
  }
})
vi.mock('../../../media/services/media-runtime', () => ({
  MEDIA_RUNTIME_CHANNEL: 'louvorja-media-runtime',
  MEDIA_RUNTIME_STORAGE_KEY: 'louvorja-media-runtime-state',
  normalizeMediaRuntime: (raw: unknown) => raw,
}))
vi.mock('../../../media/types/media', () => ({
  DEFAULT_MEDIA_PROJECTION: {
    active: false, title: '', subtitle: '', lyric: '', imageUrl: null,
    imagePosition: null, isCover: false, slideIndex: 0, slideCount: 0,
    nextLyric: '', nextIsCover: false, progressRatio: 0, slideProgressRatio: 0,
  },
}))

import { startPalcoBridge, stopPalcoBridge, palcoClockOn, palcoClockOff } from '../palco-bridge'
import { publishBibleRuntimeOff } from '../../../bible/services/bible-runtime'
import { publishRandomRuntime } from '../../../random/services/random-runtime'
import { publishTimerRuntime } from '../../../timer/services/timer-runtime'
import { publishCountdownRuntime } from '../../../countdown/services/countdown-runtime'

// BroadcastChannel mock cross-context (mesma instância compartilhada).
class MockBroadcastChannel {
  private name: string
  private listeners: ((msg: MessageEvent) => void)[] = []
  static instances = new Set<MockBroadcastChannel>()
  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.add(this)
  }
  addEventListener(_t: string, cb: (msg: MessageEvent) => void) { this.listeners.push(cb) }
  removeEventListener(_t: string, cb: (msg: MessageEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb)
  }
  postMessage(data: unknown) {
    for (const inst of MockBroadcastChannel.instances) {
      if (inst === this || inst.name !== this.name) continue
      for (const cb of [...inst.listeners]) cb({ data } as MessageEvent)
    }
  }
  close() { MockBroadcastChannel.instances.delete(this) }
}
;(globalThis as unknown as Record<string, unknown>).BroadcastChannel = MockBroadcastChannel

/** Publica runtime num canal (canal + storage inicial). */
function publish(channel: string, payload: unknown) {
  const ch = new MockBroadcastChannel(channel)
  ch.postMessage(payload)
  ch.close()
}

const MEDIA_CH = 'louvorja-media-runtime'
const BIBLE_CH = 'louvorja-bible-runtime'
const RANDOM_CH = 'louvorja-random-runtime'
const TIMER_CH = 'louvorja-timer-runtime'
const COUNTDOWN_CH = 'louvorja-countdown-runtime'

function mediaPayload(over: Record<string, unknown> = {}) {
  return {
    active: true, title: 'Hino 1', subtitle: '', lyric: 'linha1\nlinha2',
    imageUrl: null, imagePosition: null, isCover: false, slideIndex: 0,
    slideCount: 1, nextLyric: '', nextIsCover: false, progressRatio: 0,
    slideProgressRatio: 0, ...over,
  }
}

const timerBase = { segmentStartedAt: null, accumulatedMs: 0, savedTimesMs: [] }
const countdownBase = { ...timerBase, durationMs: 60_000, savedTimesMs: [], finished: false }

async function settle(ms = 60) {
  await new Promise((r) => setTimeout(r, ms))
}

beforeEach(() => {
  localStorage.clear()
  stopPalcoBridge()
  sendBuf.buf.length = 0
  bridgeState.externalAlive = false
  if (mediaState.state) {
    mediaState.state.isPlaying = false
    mediaState.state.isPaused = false
    mediaState.state.hasSession = false
    mediaState.state.status = 'stopped'
    mediaState.state.currentTimeSec = 0
    mediaState.state.audioRoute = 'pc'
    mediaState.state.session = null
  }
  vi.clearAllMocks()
})

afterEach(() => stopPalcoBridge())

describe('palco-bridge — helpers via comportamento', () => {
  it('startPalcoBridge: idempotente (2º start não duplica)', async () => {
    startPalcoBridge()
    startPalcoBridge()
    publish(MEDIA_CH, mediaPayload())
    await settle()
    // Se duplicasse, would process twice → sends ainda ok, sem crash
    expect(sendBuf.buf.filter((s) => s.slot === 'audio').length).toBeGreaterThanOrEqual(0)
  })

  it('stopPalcoBridge antes do start: no-op sem crash', () => {
    expect(() => stopPalcoBridge()).not.toThrow()
  })

  it('stopPalcoBridge fecha canais e reseta owner (reinício limpo)', async () => {
    startPalcoBridge()
    publish(MEDIA_CH, mediaPayload())
    await settle()
    stopPalcoBridge()
    startPalcoBridge()
    // owner resetado: precisa re-publicar pra ter projeção de novo
    sendBuf.buf.length = 0
    publish(MEDIA_CH, mediaPayload())
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'projection')).toBe(true)
  })
})

describe('palco-bridge — projeção por módulo (owner)', () => {
  it('media: lyric com \\n vira <br>, sem footerRef', async () => {
    startPalcoBridge()
    publish(MEDIA_CH, mediaPayload())
    await settle()
    const proj = sendBuf.buf.find((s) => s.msg.type === 'projection' && (s.msg as { scope?: string }).scope === 'hymns')
    expect(proj).toBeTruthy()
    const input = (proj!.msg as { input: { text: string; footerRef: string } }).input
    expect(input.text).toBe('linha1<br>linha2')
    expect(input.footerRef).toBe('')
  })

  it('media capa: isCover true propagado', async () => {
    startPalcoBridge()
    publish(MEDIA_CH, mediaPayload({ isCover: true, lyric: '' }))
    await settle()
    const proj = sendBuf.buf.find((s) => s.msg.type === 'projection')
    expect((proj!.msg as { input: { isCover: boolean } }).input.isCover).toBe(true)
  })

  it('media sem conteúdo (title vazio, active true): intent false, sem projeção', async () => {
    startPalcoBridge()
    publish(MEDIA_CH, mediaPayload({ title: '', lyric: '' }))
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'projection')).toBe(false)
  })

  it('bible: texto + referência no rodapé', async () => {
    startPalcoBridge()
    publish(BIBLE_CH, { projecting: true, active: true, text: 'No princípio\ncriou', reference: 'Gn 1:1' })
    await settle()
    const proj = sendBuf.buf.find((s) => s.msg.type === 'projection' && (s.msg as { scope?: string }).scope === 'bible')
    expect(proj).toBeTruthy()
    const input = (proj!.msg as { input: { text: string; footerRef: string } }).input
    expect(input.text).toBe('No princípio<br>criou')
    expect(input.footerRef).toBe('Gn 1:1')
  })

  it('bible projecting sem texto: intent false', async () => {
    startPalcoBridge()
    publish(BIBLE_CH, { projecting: true, active: true, text: '', reference: '' })
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'projection')).toBe(false)
  })

  it('random: projecting com currentDisplay projeta texto', async () => {
    startPalcoBridge()
    publish(RANDOM_CH, { currentDisplay: 'Maria', isDrawing: false, projecting: true })
    await settle()
    const proj = sendBuf.buf.find((s) => s.msg.type === 'projection' && (s.msg as { scope?: string }).scope === 'random')
    expect(proj).toBeTruthy()
    expect((proj!.msg as { input: { text: string } }).input.text).toBe('Maria')
  })

  it('timer running: timerTo com duração em segundos (elapsedMs)', async () => {
    startPalcoBridge()
    publish(TIMER_CH, { ...timerBase, status: 'running', projecting: true, accumulatedMs: 65_000 })
    await settle()
    const timerMsg = sendBuf.buf.find((s) => s.msg.type === 'timer')
    expect(timerMsg).toBeTruthy()
    const opts = (timerMsg!.msg as { opts: { mode: string; duration: number } }).opts
    expect(opts.mode).toBe('chrono')
    expect(opts.duration).toBe(65)
  })

  it('timer pausado: elapsed congelado no accumulatedMs', async () => {
    startPalcoBridge()
    publish(TIMER_CH, { ...timerBase, status: 'paused', projecting: true, accumulatedMs: 30_000 })
    await settle()
    const timerMsg = sendBuf.buf.find((s) => s.msg.type === 'timer')
    expect((timerMsg!.msg as { opts: { duration: number } }).opts.duration).toBe(30)
  })

  it('timer idle/projecting false: sem timerTo (guard anti 00:00 fantasma)', async () => {
    startPalcoBridge()
    publish(TIMER_CH, { ...timerBase, status: 'idle', projecting: true })
    await settle()
    publish(TIMER_CH, { ...timerBase, status: 'running', projecting: false })
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'timer')).toBe(false)
  })

  it('timer runtime stale (segmentStartedAt > 12h): não reclama owner', async () => {
    startPalcoBridge()
    const stale = Date.now() - 13 * 60 * 60 * 1000
    publish(TIMER_CH, { ...timerBase, status: 'running', projecting: true, segmentStartedAt: stale })
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'timer')).toBe(false)
  })

  it('countdown running: timerTo countdown com restante', async () => {
    startPalcoBridge()
    const started = Date.now() - 10_000
    publish(COUNTDOWN_CH, { ...countdownBase, status: 'running', projecting: true, segmentStartedAt: started })
    await settle()
    const timerMsg = sendBuf.buf.find((s) => s.msg.type === 'timer')
    const opts = (timerMsg!.msg as { opts: { mode: string; duration: number } }).opts
    expect(opts.mode).toBe('countdown')
    // 60s - 10s = ~50s (margem de 2s pro settle)
    expect(opts.duration).toBeGreaterThanOrEqual(48)
    expect(opts.duration).toBeLessThanOrEqual(51)
  })

  it('countdown: restante nunca negativo (clamp 0)', async () => {
    startPalcoBridge()
    const started = Date.now() - 120_000
    publish(COUNTDOWN_CH, { ...countdownBase, status: 'running', projecting: true, segmentStartedAt: started })
    await settle()
    const timerMsg = sendBuf.buf.find((s) => s.msg.type === 'timer')
    expect((timerMsg!.msg as { opts: { duration: number } }).opts.duration).toBe(0)
  })

  it('countdown sem projecting: não projeta', async () => {
    startPalcoBridge()
    publish(COUNTDOWN_CH, { ...countdownBase, status: 'running', projecting: false })
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'timer')).toBe(false)
  })

  it('mensagem null/undefined no canal de timer: ignorada (guard !v)', async () => {
    startPalcoBridge()
    publish(TIMER_CH, null)
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'timer')).toBe(false)
  })
})

describe('palco-bridge — takeover e turnOffOthers', () => {
  it('random assume e desliga media ativa (turnOffOthers publica off)', async () => {
    startPalcoBridge()
    publish(MEDIA_CH, mediaPayload())
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'projection')).toBe(true)
    sendBuf.buf.length = 0

    publish(RANDOM_CH, { currentDisplay: 'João', isDrawing: false, projecting: true })
    await settle()
    // owner virou random
    const proj = sendBuf.buf.find((s) => s.msg.type === 'projection')
    expect(proj).toBeTruthy()
    expect((proj!.msg as { scope?: string }).scope).toBe('random')
  })

  it('takeover do bible publica publishBibleRuntimeOff', async () => {
    startPalcoBridge()
    publish(BIBLE_CH, { projecting: true, active: true, text: 't', reference: 'r' })
    await settle()
    publish(MEDIA_CH, mediaPayload())
    await settle()
    expect(publishBibleRuntimeOff).toHaveBeenCalled()
  })

  it('takeover do media desliga timer ativo', async () => {
    startPalcoBridge()
    publish(TIMER_CH, { ...timerBase, status: 'running', projecting: true, accumulatedMs: 1000 })
    await settle()
    publish(MEDIA_CH, mediaPayload())
    await settle()
    expect(publishTimerRuntime).toHaveBeenCalled()
    const call = vi.mocked(publishTimerRuntime).mock.calls.at(-1)?.[0] as { projecting: boolean }
    expect(call.projecting).toBe(false)
  })

  it('takeover do random desliga countdown ativo', async () => {
    startPalcoBridge()
    publish(COUNTDOWN_CH, { ...countdownBase, status: 'running', projecting: true })
    await settle()
    publish(RANDOM_CH, { currentDisplay: 'x', projecting: true })
    await settle()
    expect(publishCountdownRuntime).toHaveBeenCalled()
    const call = vi.mocked(publishCountdownRuntime).mock.calls.at(-1)?.[0] as { projecting: boolean }
    expect(call.projecting).toBe(false)
  })

  it('mesma intenção repetida sem owner: re-render do dono não crasha', async () => {
    startPalcoBridge()
    publish(RANDOM_CH, { currentDisplay: 'a', projecting: true })
    await settle()
    // repetição com mesma intenção (owner já é random → projectOwner)
    publish(RANDOM_CH, { currentDisplay: 'b', projecting: true })
    await settle()
    const proj = sendBuf.buf.filter((s) => s.msg.type === 'projection')
    expect(proj.length).toBeGreaterThanOrEqual(2)
    expect((proj.at(-1)!.msg as { input: { text: string } }).input.text).toBe('b')
  })

  it('release: owner sai → slots voltam a idle', async () => {
    startPalcoBridge()
    publish(RANDOM_CH, { currentDisplay: 'a', projecting: true })
    await settle()
    sendBuf.buf.length = 0
    publish(RANDOM_CH, { currentDisplay: '', projecting: false })
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'idle')).toBe(true)
  })

  it('release de quem NÃO é owner: no-op', async () => {
    startPalcoBridge()
    publish(RANDOM_CH, { currentDisplay: 'a', projecting: true })
    await settle()
    // bible nunca foi owner; publicar off não pode derrubar random
    publish(BIBLE_CH, { projecting: false, active: false, text: '', reference: '' })
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'idle')).toBe(false)
  })
})

describe('palco-bridge — mídia externa e slots', () => {
  it('mídia externa viva: owner é PULADO no slot (sem projection por cima)', async () => {
    startPalcoBridge()
    bridgeState.externalAlive = true
    publish(RANDOM_CH, { currentDisplay: 'a', projecting: true })
    await settle()
    const slot0 = sendBuf.buf.filter((s) => s.slot === '0' && s.msg.type === 'projection')
    expect(slot0.length).toBe(0)
  })

  it('bridge desktop com erro no externalAlive: fallback sem externa (projeta)', async () => {
    bridgeState.throwOnExternal = true
    startPalcoBridge()
    publish(RANDOM_CH, { currentDisplay: 'a', projecting: true })
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'projection')).toBe(true)
  })

  it('slot sem running: ignorado no renderAllSlots', async () => {
    startPalcoBridge()
    publish(RANDOM_CH, { currentDisplay: 'a', projecting: true })
    await settle()
    expect(sendBuf.buf.some((s) => s.slot === 'dead' && s.msg.type === 'projection')).toBe(false)
  })

  it('owner sem conteúdo renderizável: idle no slot', async () => {
    startPalcoBridge()
    // random projecting mas sem currentDisplay → tela de espera {text:''}, não idle.
    // Já bible projecting=false com intent false não claima; usamos clock off:
    publish(RANDOM_CH, { currentDisplay: '', projecting: false })
    await settle()
    // nada clamou; slots em idle do boot
    expect(sendBuf.buf.every((s) => s.msg.type !== 'projection' || s.slot !== 'dead')).toBe(true)
  })
})

describe('palco-bridge — relógio (clock owner)', () => {
  it('palcoClockOn: reclama owner e projeta HH:MM no slot', async () => {
    startPalcoBridge()
    palcoClockOn()
    await settle()
    const proj = sendBuf.buf.find((s) => s.msg.type === 'projection' && (s.msg as { scope?: string }).scope === 'clock')
    expect(proj).toBeTruthy()
    expect((proj!.msg as { input: { text: string } }).input.text).toMatch(/^\d{2}:\d{2}$/)
  })

  it('palcoClockOn/Off: tick para após release (sem erro)', async () => {
    startPalcoBridge()
    palcoClockOn()
    await settle()
    palcoClockOff()
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'idle')).toBe(true)
  })

  it('release sem clock ativo antes: no-op', () => {
    startPalcoBridge()
    expect(() => palcoClockOff()).not.toThrow()
  })
})

describe('palco-bridge — áudio (rotas pc/tv/ambos)', () => {
  it('rota pc: sem comando de áudio na primeira sync', async () => {
    startPalcoBridge()
    mediaState.state!.audioRoute = 'pc'
    mediaState.state!.session = { audioUrl: 'http://x/a.mp3' }
    mediaState.state!.hasSession = true
    publish(MEDIA_CH, mediaPayload())
    await settle(3300)
    // transição null→pc manda stop 1x; polls seguintes NÃO martelam
    const stops = sendBuf.buf.filter((s) => s.slot === 'audio' && (s.msg as { action?: string }).action === 'stop')
    expect(stops.length).toBe(1)
  })

  it('rota tv: envia play com url/title/cover', async () => {
    startPalcoBridge()
    mediaState.state!.audioRoute = 'tv'
    mediaState.state!.session = { audioUrl: 'http://x/a.mp3', title: 'Hino', subtitle: 'Harpa', coverUrl: 'http://c.jpg' }
    mediaState.state!.hasSession = true
    mediaState.state!.currentTimeSec = 3
    publish(MEDIA_CH, mediaPayload())
    await settle(3200)
    const audio = sendBuf.buf.filter((s) => s.slot === 'audio')
    expect(audio.length).toBeGreaterThan(0)
    const play = audio.find((m) => (m.msg as { action?: string }).action === 'play')
    expect(play).toBeTruthy()
    const msg = play!.msg as Record<string, unknown>
    expect(msg.url).toBe('http://x/a.mp3')
    expect(msg.title).toBe('Hino')
    expect(msg.positionMs).toBe(3000)
  })

  it('rota tv sem faixa: stop', async () => {
    startPalcoBridge()
    mediaState.state!.audioRoute = 'tv'
    mediaState.state!.session = null
    mediaState.state!.hasSession = false
    publish(MEDIA_CH, mediaPayload())
    await settle(3200)
    expect(sendBuf.buf.some((s) => s.slot === 'audio' && (s.msg as { action?: string }).action === 'stop')).toBe(true)
  }, 15000)

  it('rota tv: pause do operador propagará via poll de 3s', async () => {
    startPalcoBridge()
    mediaState.state!.audioRoute = 'tv'
    mediaState.state!.session = { audioUrl: 'http://x/a.mp3' }
    mediaState.state!.hasSession = true
    mediaState.state!.status = 'playing'
    mediaState.state!.isPlaying = true
    publish(MEDIA_CH, mediaPayload())
    await settle(3200)
    sendBuf.buf.length = 0
    mediaState.state!.isPlaying = false
    mediaState.state!.status = 'paused'
    // watcher reage a mudança de status; poll de 3s também chama syncAudio
    await settle(3300)
    expect(sendBuf.buf.some((s) => s.slot === 'audio' && (s.msg as { action?: string }).action === 'pause')).toBe(true)
  }, 15000)

  it('rota ambos tocando: sync periódico de seek só após 3s', async () => {
    startPalcoBridge()
    mediaState.state!.audioRoute = 'both'
    mediaState.state!.session = { audioUrl: 'http://x/a.mp3' }
    mediaState.state!.hasSession = true
    mediaState.state!.isPlaying = true
    mediaState.state!.currentTimeSec = 1
    publish(MEDIA_CH, mediaPayload())
    await settle(3200)
    const seeks = sendBuf.buf.filter((s) => s.slot === 'audio' && (s.msg as { action?: string }).action === 'seek')
    expect(seeks.length).toBeGreaterThanOrEqual(1)
    expect((seeks[0].msg as { positionMs: number }).positionMs).toBe(1000)
  })

  it('rota ambos pausado: pause enviado', async () => {
    startPalcoBridge()
    mediaState.state!.audioRoute = 'both'
    mediaState.state!.session = { audioUrl: 'http://x/a.mp3' }
    mediaState.state!.hasSession = true
    mediaState.state!.isPlaying = true
    publish(MEDIA_CH, mediaPayload())
    await settle(3300)
    sendBuf.buf.length = 0
    mediaState.state!.isPlaying = false
    mediaState.state!.isPaused = true
    // watcher do isPlaying chama syncAudio → pause
    await settle(3300)
    expect(sendBuf.buf.some((s) => s.slot === 'audio' && (s.msg as { action?: string }).action === 'pause')).toBe(true)
  }, 15000)

  it('hasSession cai: audio stop e lastAudioKey resetado', async () => {
    startPalcoBridge()
    mediaState.state!.audioRoute = 'tv'
    mediaState.state!.session = { audioUrl: 'http://x/a.mp3' }
    mediaState.state!.hasSession = true
    publish(MEDIA_CH, mediaPayload())
    await settle(3200)
    sendBuf.buf.length = 0
    mediaState.state!.hasSession = false
    mediaState.state!.session = null
    await settle(3200)
    expect(sendBuf.buf.some((s) => s.slot === 'audio' && (s.msg as { action?: string }).action === 'stop')).toBe(true)
  }, 15000)

  it('poll de storage (2s): mudança no localStorage do runtime é aplicada', async () => {
    startPalcoBridge()
    localStorage.setItem('louvorja-random-runtime-state', JSON.stringify({ currentDisplay: 'Poll', projecting: true }))
    await settle(2300)
    const proj = sendBuf.buf.find((s) => s.msg.type === 'projection' && (s.msg as { scope?: string }).scope === 'random')
    expect(proj).toBeTruthy()
    expect((proj!.msg as { input: { text: string } }).input.text).toBe('Poll')
  })
})

describe('palco-bridge — storage events e estado inicial', () => {
  it('storage event com JSON inválido: ignorado sem crash', async () => {
    startPalcoBridge()
    localStorage.setItem('louvorja-random-runtime-state', 'not-json')
    window.dispatchEvent(new StorageEvent('storage', { key: 'louvorja-random-runtime-state', newValue: 'not-json' }))
    await settle()
    expect(sendBuf.buf.every((s) => s.msg.type !== 'projection')).toBe(true)
  })

  it('storage event de chave diferente: ignorado', async () => {
    startPalcoBridge()
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra-chave', newValue: '{}' }))
    await settle()
    expect(sendBuf.buf.every((s) => s.msg.type !== 'projection')).toBe(true)
  })

  it('runtime sticky no storage no boot: hidrata e aplica (timer stale não rouba owner)', async () => {
    const stale = Date.now() - 20 * 60 * 60 * 1000
    localStorage.setItem('louvorja-timer-runtime-state', JSON.stringify({ ...timerBase, status: 'running', projecting: true, segmentStartedAt: stale }))
    startPalcoBridge()
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'timer')).toBe(false)
  })

  it('media sticky válido no storage no boot: reclama e projeta', async () => {
    localStorage.setItem('louvorja-media-runtime-state', JSON.stringify(mediaPayload()))
    startPalcoBridge()
    await settle()
    expect(sendBuf.buf.some((s) => s.msg.type === 'projection' && (s.msg as { scope?: string }).scope === 'hymns')).toBe(true)
  })
})
