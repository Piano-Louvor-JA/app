// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('../../composables/useCountdown', () => ({
  useCountdownDisplay: () => ({
    formattedTime: ref('00:03:00'),
    formattedTimeWithSign: ref('00:03:00'),
    isUrgent: ref(false),
    isFinished: ref(false),
    isNegative: ref(false),
  }),
}))

vi.mock('@shared/services/workspace-api', () => ({
  resolveMediaUrl: (p: string) => `local://media/${p}`,
}))

import CountdownPreview from '../CountdownPreview.vue'
import type { CountdownDisplayConfig, CountdownRuntimeState } from '../../types/countdown'

const VIDEO = 'modulos/escola-sabatina/video/video-1.mp4'
const config: CountdownDisplayConfig = { timeFormat: 'mm:ss', bgColor: '#000000', textColor: '#FFFFFF' }
const idle: CountdownRuntimeState = {
  status: 'idle',
  segmentStartedAt: null,
  accumulatedMs: 0,
  durationMs: 180_000,
  savedTimesMs: [],
  finished: false,
  videoPath: VIDEO,
}

const i18n = createI18n({ legacy: false, locale: 'pt', messages: { pt: { countdown: { finished: 'Encerrado' } } } })
const play = vi.fn(function (this: HTMLMediaElement) {
  Object.defineProperty(this, 'paused', { configurable: true, value: false })
  return Promise.resolve()
})
const pause = vi.fn(function (this: HTMLMediaElement) {
  Object.defineProperty(this, 'paused', { configurable: true, value: true })
})
let wrapper: VueWrapper | undefined

function mountPreview(runtime: CountdownRuntimeState, extra: Record<string, unknown> = {}) {
  wrapper = mount(CountdownPreview, { props: { config, runtime, ...extra }, global: { plugins: [i18n] } })
  return wrapper
}

function video(): HTMLVideoElement {
  return wrapper!.find('video').element as HTMLVideoElement
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-07T09:00:00'))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  play.mockClear()
  pause.mockClear()
})

describe('CountdownPreview com vídeo personalizado', () => {
  it('mostra o vídeo no lugar dos números, parado no início', async () => {
    mountPreview(idle)
    await nextTick()
    expect(wrapper!.find('.countdown-preview__digital').exists()).toBe(false)
    expect(video().getAttribute('src')).toBe(`local://media/${VIDEO}`)
    expect(video().currentTime).toBe(0)
    expect(play).not.toHaveBeenCalled()
  })

  it('a projeção toca com som; as prévias flutuantes ficam mudas', async () => {
    mountPreview(idle)
    expect(video().muted).toBe(false)
    wrapper!.unmount()
    mountPreview(idle, { muted: true })
    expect(video().muted).toBe(true)
  })

  it('aplica o volume do vídeo vindo da contagem; sem volume informado, toca cheio', async () => {
    mountPreview({ ...idle, videoVolume: 0.3 })
    await nextTick()
    expect(video().volume).toBeCloseTo(0.3)
    await wrapper!.setProps({ runtime: { ...idle, videoVolume: 0 } })
    await nextTick()
    expect(video().volume).toBe(0)
    await wrapper!.setProps({ runtime: idle })
    await nextTick()
    expect(video().volume).toBe(1)
  })

  it('acompanha a contagem: toca, pausa e pula para o ponto certo', async () => {
    mountPreview(idle)
    await nextTick()
    await wrapper!.setProps({ runtime: { ...idle, status: 'running', segmentStartedAt: Date.now() - 30_000 } })
    await nextTick()
    expect(play).toHaveBeenCalledOnce()
    expect(video().currentTime).toBe(30)

    await wrapper!.setProps({ runtime: { ...idle, status: 'paused', accumulatedMs: 40_000 } })
    await nextTick()
    expect(pause).toHaveBeenCalledOnce()
    expect(video().currentTime).toBe(40)
  })

  it('diferença pequena não faz o vídeo pular', async () => {
    mountPreview(idle)
    await nextTick()
    video().currentTime = 10.4
    await wrapper!.setProps({ runtime: { ...idle, status: 'paused', accumulatedMs: 10_000 } })
    await nextTick()
    expect(video().currentTime).toBe(10.4)
  })

  it('ao carregar o arquivo já entra no ponto da contagem em andamento', async () => {
    mountPreview({ ...idle, status: 'running', segmentStartedAt: Date.now() - 20_000 })
    video().currentTime = 0
    play.mockClear()
    Object.defineProperty(video(), 'paused', { configurable: true, value: true })
    video().dispatchEvent(new Event('loadedmetadata'))
    expect(video().currentTime).toBe(20)
    expect(play).toHaveBeenCalledOnce()
  })

  it('encerrada, fica no último quadro', async () => {
    mountPreview({ ...idle, status: 'running', segmentStartedAt: Date.now() })
    await nextTick()
    await wrapper!.setProps({ runtime: { ...idle, status: 'paused', finished: true, accumulatedMs: 180_000 } })
    await nextTick()
    expect(video().currentTime).toBe(180)
    expect(pause).toHaveBeenCalled()
  })

  it('autoplay bloqueado não quebra a tela', async () => {
    play.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')))
    mountPreview({ ...idle, status: 'running', segmentStartedAt: Date.now() })
    await nextTick()
    await Promise.resolve()
    expect(wrapper!.find('video').exists()).toBe(true)
  })

  it('sem vídeo no runtime continua mostrando os números', () => {
    const { videoPath: _ignored, ...plain } = idle
    mountPreview(plain)
    expect(wrapper!.find('video').exists()).toBe(false)
    expect(wrapper!.find('.countdown-preview__digital').text()).toBe('00:03:00')
  })
})
