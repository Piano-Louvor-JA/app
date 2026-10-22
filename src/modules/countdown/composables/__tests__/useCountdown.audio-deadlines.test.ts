import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useCountdownDisplay } from '../useCountdown'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG, DEFAULT_COUNTDOWN_RUNTIME } from '../../types/countdown'
const mocks = vi.hoisted(() => ({ store: null as any, host: vi.fn(), operator: vi.fn(), release: vi.fn(), library: vi.fn(), play: vi.fn(), stop: vi.fn(), volume: vi.fn(), clear: vi.fn() }))
vi.mock('../../stores/useCountdownStore', () => ({ useCountdownStore: () => mocks.store }))
vi.mock('../../services/audio-control', () => ({ claimAudioHost: mocks.host, isOperatorWindow: mocks.operator, releaseAudioHost: mocks.release }))
vi.mock('../../services/alert-tone-library', () => ({ getLibraryTone: mocks.library }))
vi.mock('../../services/alert-tone', () => ({ enqueueAlert: (play: () => Promise<void>) => { void play() }, playAlertTone: mocks.play, stopAllAlerts: mocks.stop, setLiveVolume: mocks.volume, clearAlertQueue: mocks.clear }))
let wrapper: VueWrapper
let config: ReturnType<typeof ref<any>>
let runtime: ReturnType<typeof ref<any>>
class AudioStub {
  static instances: AudioStub[] = []
  preload = ''
  volume = 1
  play = vi.fn().mockResolvedValue(undefined)
  constructor(public src: string) { AudioStub.instances.push(this) }
}
function open(markers: Array<{ id: string; offsetMs: number; preset: string }>) {
  config = ref({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, mode: 'sabbath', alertMarkers: markers })
  runtime = ref({ ...DEFAULT_COUNTDOWN_RUNTIME, mode: 'duration', status: 'idle', durationMs: 600000, accumulatedMs: 0, segmentStartedAt: null })
  wrapper = mount(defineComponent({ setup() { const display = useCountdownDisplay(config, runtime); return () => h('div', display.formattedTimeWithSign.value) } }))
}
async function start() { runtime.value.segmentStartedAt = Date.now(); runtime.value.status = 'running'; await nextTick() }
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  mocks.store = reactive({ firedMarkers: new Set<string>(), audioMuted: false, audioVolume: 0.4, audioStopTick: 0, startAudioControlSync: vi.fn() })
  mocks.host.mockReturnValue(true)
  mocks.operator.mockReturnValue(true)
  mocks.play.mockResolvedValue(undefined)
  mocks.library.mockReturnValue({ dataUrl: 'data:unique-audio' })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('Audio', AudioStub)
})
afterEach(() => { wrapper?.unmount(); window.history.replaceState({}, '', '/'); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('alertas por deadline absoluto', () => {
  it('toca marcos na hora mesmo com rAF congelado, sem repetir e sem disparar marcos já vencidos no início', async () => {
    open([{ id:'start', offsetMs:0, preset:'beep' }, { id:'five', offsetMs:300000, preset:'chime' }, { id:'late', offsetMs:700000, preset:'gong' }, { id:'disabled', offsetMs:200000, preset:'none' }])
    await start()
    expect(mocks.play).toHaveBeenCalledWith('beep', undefined, undefined, { volume:0.4 })
    await vi.advanceTimersByTimeAsync(300000)
    expect(mocks.play).toHaveBeenCalledWith('chime', undefined, undefined, { volume:0.4 })
    await vi.advanceTimersByTimeAsync(100000)
    expect(mocks.play).toHaveBeenCalledTimes(2)
    expect(mocks.store.firedMarkers.has('late')).toBe(true)
  })
  it('pausa suspende os deadlines e retomar rearma sem repetir abertura', async () => {
    open([{ id:'start', offsetMs:0, preset:'beep' }, { id:'five', offsetMs:300000, preset:'gong' }])
    await start()
    runtime.value.status = 'paused'
    runtime.value.accumulatedMs = 100000
    runtime.value.segmentStartedAt = null
    await nextTick()
    await vi.advanceTimersByTimeAsync(400000)
    expect(mocks.play).toHaveBeenCalledOnce()
    await start()
    await vi.advanceTimersByTimeAsync(200000)
    expect(mocks.play).toHaveBeenCalledTimes(2)
    runtime.value.status = 'idle'
    await nextTick()
    expect(mocks.store.firedMarkers.size).toBe(0)
  })
  it.each(['muted','other-host'])('não toca quando %s', async reason => {
    if(reason === 'muted') mocks.store.audioMuted = true
    else mocks.host.mockReturnValue(false)
    open([{ id:'start', offsetMs:0, preset:'beep' }])
    await start()
    expect(mocks.play).not.toHaveBeenCalled()
  })
  it('toca da biblioteca, usa cache e tolera arquivo ausente', async () => {
    mocks.library.mockReturnValue({ dataUrl:'data:countdown-cache-test' })
    open([{ id:'start', offsetMs:0, preset:'custom:sound' }, { id:'second', offsetMs:599000, preset:'custom:sound' }, { id:'missing', offsetMs:598000, preset:'custom:missing' }])
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
  it('sincroniza popup, reage a stop e volume e libera a eleição ao desmontar', async () => {
    window.history.replaceState({}, '', '/popup?module=countdown')
    open([{ id:'start', offsetMs:0, preset:'none' }])
    expect(mocks.store.startAudioControlSync).toHaveBeenCalledOnce()
    await start()
    mocks.store.audioStopTick++
    mocks.store.audioVolume = 0.2
    await nextTick()
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(mocks.volume).toHaveBeenCalledWith(0.2)
    config.value.mode = 'standard'
    await nextTick()
    expect(mocks.clear).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(mocks.release).toHaveBeenCalledOnce()
  })
  it('janela auxiliar fora da eleição não arma alertas', async () => {
    mocks.operator.mockReturnValue(false)
    open([{ id:'start', offsetMs:0, preset:'beep' }])
    await start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.play).not.toHaveBeenCalled()
  })
})
