import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { DEFAULT_COUNTDOWN_RUNTIME } from '@modules/countdown/types/countdown'
import { useSabbathSchoolAlertEngine } from '../useSabbathSchoolAlertEngine'
import { DEFAULT_ALERT_MARKERS } from '../../types/sabbath-school'

const mocks = vi.hoisted(() => ({ store: null as any, library: vi.fn(), play: vi.fn(), stop: vi.fn(), volume: vi.fn(), clear: vi.fn(), pause: vi.fn(), resume: vi.fn() }))
vi.mock('../../stores/useSabbathSchoolStore', () => ({ useSabbathSchoolStore: () => mocks.store }))
vi.mock('../../services/alert-tone-library', () => ({ getLibraryTone: mocks.library }))
vi.mock('../../services/alert-tone', () => ({
  enqueueAlert: (play: () => Promise<void>) => { void play() },
  playAlertTone: mocks.play,
  stopAllAlerts: mocks.stop,
  pauseAllAlerts: mocks.pause,
  resumeAllAlerts: mocks.resume,
  setLiveVolume: mocks.volume,
  clearAlertQueue: mocks.clear,
  resolveSabbathSchoolAudioLang: () => 'pt-BR',
}))

class AudioStub extends EventTarget {
  static instances: AudioStub[] = []
  preload = ''
  volume = 1
  play = vi.fn().mockResolvedValue(undefined)
  constructor(public src: string) { super(); AudioStub.instances.push(this) }
}

let wrapper: VueWrapper | undefined

function open(markers: Array<{ id: string; offsetMs: number; preset: string }>) {
  mocks.store.config = { ...mocks.store.config, alertMarkers: markers }
  wrapper = mount(defineComponent({ setup() { useSabbathSchoolAlertEngine(); return () => h('div') } }))
}

async function start() {
  mocks.store.runtime = { ...mocks.store.runtime, segmentStartedAt: Date.now(), status: 'running' }
  await nextTick()
}

const tone = (preset: string) => [preset, undefined, undefined, { volume: 0.4, sabbathAudioLang: 'pt-BR' }]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  mocks.store = reactive({
    config: { schedule: { scheduleMode: 'endOnly', durationMs: 2_700_000, endTime: '10:15' }, audioLang: 'auto', alertMarkers: [] },
    runtime: { ...DEFAULT_COUNTDOWN_RUNTIME, mode: 'duration', status: 'idle', durationMs: 600000, accumulatedMs: 0, segmentStartedAt: null },
    firedMarkers: new Set<string>(),
    audioMuted: false,
    audioVolume: 0.4,
  })
  mocks.play.mockResolvedValue(undefined)
  mocks.library.mockReturnValue({ dataUrl: 'data:unique-audio' })
  vi.stubGlobal('Audio', AudioStub)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('motor de alertas da Escola Sabatina', () => {
  it('toca cada marco na hora, sem repetir e sem tocar marcos já vencidos no início', async () => {
    open([{ id: 'start', offsetMs: 0, preset: 'beep' }, { id: 'five', offsetMs: 300000, preset: 'chime' }, { id: 'late', offsetMs: 700000, preset: 'gong' }, { id: 'disabled', offsetMs: 200000, preset: 'none' }])
    await start()
    expect(mocks.play).toHaveBeenCalledWith(...tone('beep'))
    await vi.advanceTimersByTimeAsync(300000)
    expect(mocks.play).toHaveBeenCalledWith(...tone('chime'))
    await vi.advanceTimersByTimeAsync(100000)
    expect(mocks.play).toHaveBeenCalledTimes(2)
    expect(mocks.store.firedMarkers.has('late')).toBe(true)
  })

  it('contagem com vídeo personalizado não toca abertura nem avisos: o vídeo tem o próprio áudio', async () => {
    open([{ id: 'start', offsetMs: 0, preset: 'beep' }, { id: 'five', offsetMs: 300000, preset: 'chime' }])
    mocks.store.runtime = { ...mocks.store.runtime, videoPath: 'modulos/escola-sabatina/video/v.mp4' }
    await start()
    await vi.advanceTimersByTimeAsync(600000)
    expect(mocks.play).not.toHaveBeenCalled()
    expect(mocks.store.firedMarkers.size).toBe(0)
  })

  it('pausa suspende os deadlines e retomar rearma sem repetir a abertura', async () => {
    open([{ id: 'start', offsetMs: 0, preset: 'beep' }, { id: 'five', offsetMs: 300000, preset: 'gong' }])
    await start()
    mocks.store.runtime = { ...mocks.store.runtime, status: 'paused', accumulatedMs: 100000, segmentStartedAt: null }
    await nextTick()
    await vi.advanceTimersByTimeAsync(400000)
    expect(mocks.play).toHaveBeenCalledOnce()
    await start()
    await vi.advanceTimersByTimeAsync(200000)
    expect(mocks.play).toHaveBeenCalledTimes(2)
    mocks.store.runtime = { ...mocks.store.runtime, status: 'idle' }
    await nextTick()
    expect(mocks.store.firedMarkers.size).toBe(0)
  })

  it('não toca quando o operador silenciou', async () => {
    mocks.store.audioMuted = true
    open([{ id: 'start', offsetMs: 0, preset: 'beep' }])
    await start()
    expect(mocks.play).not.toHaveBeenCalled()
  })

  it('ao zerar sem tempo negativo a contagem para, mas o aviso que está tocando termina', async () => {
    open([{ id: 'one', offsetMs: 60000, preset: 'beep' }])
    await start()
    mocks.store.runtime = { ...mocks.store.runtime, status: 'paused', finished: true, accumulatedMs: 600000, segmentStartedAt: null }
    await nextTick()
    expect(mocks.pause).not.toHaveBeenCalled()
  })

  it('pausar a contagem pausa o áudio e retomar continua de onde parou', async () => {
    open([{ id: 'start', offsetMs: 0, preset: 'beep' }])
    await start()
    expect(mocks.resume).not.toHaveBeenCalled()
    mocks.store.runtime = { ...mocks.store.runtime, status: 'paused', accumulatedMs: 1000, segmentStartedAt: null }
    await nextTick()
    expect(mocks.pause).toHaveBeenCalledOnce()
    await start()
    expect(mocks.resume).toHaveBeenCalledOnce()
    expect(mocks.play).toHaveBeenCalledOnce()
  })

  it('toca da biblioteca, usa cache e tolera arquivo ausente', async () => {
    mocks.library.mockReturnValue({ dataUrl: 'data:engine-cache-test' })
    open([{ id: 'start', offsetMs: 0, preset: 'custom:sound' }, { id: 'second', offsetMs: 599000, preset: 'custom:sound' }, { id: 'missing', offsetMs: 598000, preset: 'custom:missing' }])
    await start()
    const audio = AudioStub.instances.at(-1)!
    expect(audio.volume).toBe(0.4)
    expect(audio.preload).toBe('auto')
    audio.play.mockRejectedValue(new Error('autoplay'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(audio.play).toHaveBeenCalledTimes(2)
    mocks.library.mockReturnValue(undefined)
    await vi.advanceTimersByTimeAsync(1000)
    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('abertura desativada depois da montagem não toca', async () => {
    open([{ id: 'start', offsetMs: 0, preset: 'beep' }])
    mocks.store.config = { ...mocks.store.config, alertMarkers: [{ id: 'start', offsetMs: 0, preset: 'none' }] }
    await nextTick()
    await start()
    expect(mocks.play).not.toHaveBeenCalled()
  })

  it('usa os marcos padrão e rearma ao ajustar o tempo com a contagem rodando', async () => {
    open(DEFAULT_ALERT_MARKERS)
    await start()
    expect(mocks.play).toHaveBeenCalledWith(...tone('abertura_es'))
    mocks.store.runtime = { ...mocks.store.runtime, durationMs: 660000 }
    await nextTick()
    await vi.advanceTimersByTimeAsync(359000)
    expect(mocks.play).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.play).toHaveBeenLastCalledWith(...tone('5min_es'))
  })

  it('aplica o volume ao vivo e para de checar marcos ao desmontar', async () => {
    open([{ id: 'five', offsetMs: 300000, preset: 'gong' }])
    await start()
    mocks.store.audioVolume = 0.2
    await nextTick()
    expect(mocks.volume).toHaveBeenCalledWith(0.2)
    wrapper!.unmount()
    wrapper = undefined
    await vi.advanceTimersByTimeAsync(400000)
    expect(mocks.play).not.toHaveBeenCalled()
  })
})
