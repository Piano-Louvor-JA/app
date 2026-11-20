// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../../services/alert-tone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/alert-tone')>()),
  clearAlertQueue: vi.fn(),
  enqueueAlert: vi.fn(),
  playAlertTone: vi.fn(() => Promise.resolve()),
  setLiveVolume: vi.fn(),
  stopAllAlerts: vi.fn(),
}))

import { useCountdownDisplay } from '@modules/countdown/composables/useCountdown'
import { useCountdownStore } from '@modules/countdown/stores/useCountdownStore'
import { useSabbathSchoolAlertEngine } from '../useSabbathSchoolAlertEngine'
import { useSabbathSchoolStore } from '../../stores/useSabbathSchoolStore'
import { clearAlertQueue, enqueueAlert, playAlertTone, stopAllAlerts } from '../../services/alert-tone'

function mountWith(setupFn: () => void) {
  return mount(
    defineComponent({
      setup() {
        setupFn()
        return () => h('div')
      },
    }),
  )
}
const mountEngine = () => mountWith(useSabbathSchoolAlertEngine)

/** Elemento de áudio mínimo: o jsdom não implementa play/pause. */
class FakeAudio extends EventTarget {
  currentTime = 0
  ended = false
  volume = 1
  pause = vi.fn()
  play = vi.fn(() => Promise.resolve())
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T09:00:00'))
  localStorage.clear()
  setActivePinia(createPinia())
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('motor de alertas com os stores reais', () => {
  it('Timer: iniciar NÃO toca o alerta de abertura', async () => {
    const countdown = useCountdownStore()
    countdown.setDurationMs(600_000)
    const wrapper = mountEngine()

    countdown.start()
    await nextTick()

    expect(enqueueAlert).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Escola Sabatina: iniciar toca o alerta de abertura', async () => {
    const wrapper = mountEngine()

    useSabbathSchoolStore().start()
    await nextTick()

    expect(enqueueAlert).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('mexer no Timer não corta o áudio da Escola Sabatina', async () => {
    const wrapper = mountEngine()
    useSabbathSchoolStore().start()
    const countdown = useCountdownStore()

    countdown.setDurationMs(60_000)
    countdown.start()
    countdown.reset()
    await nextTick()

    expect(stopAllAlerts).not.toHaveBeenCalled()
    expect(clearAlertQueue).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('parar a Escola Sabatina corta o que estiver tocando', async () => {
    const wrapper = mountEngine()
    const store = useSabbathSchoolStore()
    store.start()

    store.stop()
    await nextTick()

    expect(stopAllAlerts).toHaveBeenCalled()
    expect(clearAlertQueue).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('play da abertura corta o que estiver tocando e toca a abertura, parada ou contando', async () => {
    const wrapper = mountEngine()
    const store = useSabbathSchoolStore()

    store.toggleOpening()
    await nextTick()
    expect(stopAllAlerts).toHaveBeenCalledOnce()
    expect(clearAlertQueue).toHaveBeenCalledOnce()
    expect(enqueueAlert).toHaveBeenCalledOnce()
    await vi.mocked(enqueueAlert).mock.calls[0]![0]()
    expect(vi.mocked(playAlertTone).mock.calls[0]![0]).toBe('abertura_es')

    store.start()
    await nextTick()
    expect(enqueueAlert).toHaveBeenCalledTimes(2)
    store.toggleOpening()
    await nextTick()
    expect(enqueueAlert).toHaveBeenCalledTimes(3)
    expect(store.runtime.status).toBe('running')
    wrapper.unmount()
  })

  it('a abertura alterna play e pausa, retoma de onde parou e volta ao play ao terminar ou ser cortada', async () => {
    const audio = new FakeAudio()
    vi.mocked(playAlertTone).mockResolvedValueOnce(audio as unknown as HTMLAudioElement)
    const wrapper = mountEngine()
    const store = useSabbathSchoolStore()

    store.toggleOpening()
    await nextTick()
    await vi.mocked(enqueueAlert).mock.calls[0]![0]()
    expect(store.openingPlayback).toBe('playing')

    audio.currentTime = 4
    store.toggleOpening()
    await nextTick()
    expect(audio.pause).toHaveBeenCalledOnce()
    expect(store.openingPlayback).toBe('paused')

    store.toggleOpening()
    await nextTick()
    expect(audio.play).toHaveBeenCalledOnce()
    expect(store.openingPlayback).toBe('playing')
    expect(enqueueAlert).toHaveBeenCalledOnce()

    audio.ended = true
    audio.dispatchEvent(new Event('ended'))
    expect(store.openingPlayback).toBe('stopped')

    audio.ended = false
    audio.dispatchEvent(new Event('playing'))
    expect(store.openingPlayback).toBe('playing')
    audio.currentTime = 0
    audio.dispatchEvent(new Event('pause'))
    expect(store.openingPlayback).toBe('stopped')
    wrapper.unmount()
  })

  it('a abertura tocada ao iniciar a contagem também mostra a pausa', async () => {
    const audio = new FakeAudio()
    vi.mocked(playAlertTone).mockResolvedValueOnce(audio as unknown as HTMLAudioElement)
    const wrapper = mountEngine()
    const store = useSabbathSchoolStore()

    store.start()
    await nextTick()
    await vi.mocked(enqueueAlert).mock.calls[0]![0]()

    expect(store.openingPlayback).toBe('playing')
    wrapper.unmount()
  })

  it('últimos 5 min toca o aviso de 5 min na hora, sem a abertura; o de 1 min segue no horário', async () => {
    const wrapper = mountEngine()
    const store = useSabbathSchoolStore()

    store.toggleFinalMinutes()
    await nextTick()
    expect(enqueueAlert).toHaveBeenCalledOnce()
    await vi.mocked(enqueueAlert).mock.calls[0]![0]()
    expect(vi.mocked(playAlertTone).mock.calls[0]![0]).toBe('5min_es')

    store.toggleFinalMinutes()
    store.toggleFinalMinutes()
    await nextTick()
    expect(enqueueAlert).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(241_000)
    expect(enqueueAlert).toHaveBeenCalledTimes(2)
    await vi.mocked(enqueueAlert).mock.calls[1]![0]()
    expect(vi.mocked(playAlertTone).mock.calls[1]![0]).toBe('1min_es')
    wrapper.unmount()
  })

  it('últimos 5 min no meio da contagem real toca o aviso de 5 min na hora', async () => {
    const wrapper = mountEngine()
    const store = useSabbathSchoolStore()
    store.start()
    await nextTick()
    vi.mocked(enqueueAlert).mockClear()

    store.toggleFinalMinutes()
    await nextTick()

    expect(enqueueAlert).toHaveBeenCalledOnce()
    await vi.mocked(enqueueAlert).mock.calls[0]![0]()
    expect(vi.mocked(playAlertTone).mock.calls.at(-1)![0]).toBe('5min_es')
    wrapper.unmount()
  })

  it('no mudo, o play da abertura fica em silêncio', async () => {
    const wrapper = mountEngine()
    const store = useSabbathSchoolStore()
    store.setAudioMuted(true)

    store.toggleOpening()
    await nextTick()

    expect(enqueueAlert).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('o relógio sozinho (prévia, popup) não toca alerta', async () => {
    const wrapper = mountWith(() => { useCountdownDisplay(undefined, () => useSabbathSchoolStore().runtime) })

    useSabbathSchoolStore().start()
    await nextTick()

    expect(enqueueAlert).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
