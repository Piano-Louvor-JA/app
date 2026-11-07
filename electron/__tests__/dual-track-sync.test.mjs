// @vitest-environment node
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const code = readFileSync(new URL('../player/dual-track-sync.js', import.meta.url), 'utf8')

class FakeMedia extends EventTarget {
  paused = true
  currentTime = 0
  volume = 1
  muted = false
  playbackRate = 1
  seeking = false
  play = vi.fn(() => {
    if (this.paused) {
      this.paused = false
      this.emit('play')
    }
    return Promise.resolve()
  })
  pause = vi.fn(() => {
    if (!this.paused) {
      this.paused = true
      this.emit('pause')
    }
  })
  emit(type) {
    this.dispatchEvent(new Event(type))
  }
}

function load(globals = {}) {
  const context = vm.createContext({ ...globals })
  vm.runInContext(code, context)
  return context.LouvorjaDualTrack
}

function setup(options = {}) {
  const video = new FakeMedia()
  const audio = new FakeMedia()
  const intervals = []
  const api = load()
  const sync = api.attach(video, audio, {
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length },
    clearInterval: vi.fn(),
    ...options,
  })
  return { video, audio, sync, intervals }
}

describe('dual-track-sync', () => {
  it('play e pausa no vídeo comandam o som', () => {
    const { video, audio } = setup()
    video.play()
    expect(audio.paused).toBe(false)
    video.pause()
    expect(audio.paused).toBe(true)
  })

  it('busca no vídeo leva o som junto, sem repetir quando já estão no mesmo ponto', () => {
    const { video, audio } = setup()
    video.currentTime = 30
    video.emit('seeking')
    expect(audio.currentTime).toBe(30)
    audio.currentTime = 10
    video.currentTime = 10.01
    video.emit('seeking')
    expect(audio.currentTime).toBe(10)
  })

  it('volume e mudo do vídeo valem para o som, desde o início', () => {
    const video = new FakeMedia()
    const audio = new FakeMedia()
    video.volume = 0.4
    video.muted = true
    load().attach(video, audio, { setInterval: () => 1, clearInterval: () => {} })
    expect(audio.volume).toBe(0.4)
    expect(audio.muted).toBe(true)
    video.volume = 0.8
    video.muted = false
    video.emit('volumechange')
    expect(audio.volume).toBe(0.8)
    expect(audio.muted).toBe(false)
  })

  it('imagem esperando dados para o som; quando volta, o som segue', () => {
    const { video, audio } = setup()
    video.play()
    video.emit('waiting')
    expect(audio.paused).toBe(true)
    video.emit('playing')
    expect(audio.paused).toBe(false)
    audio.play.mockClear()
    video.emit('playing')
    expect(audio.play).not.toHaveBeenCalled()
  })

  it('som esperando dados para a imagem até ter dados de novo', () => {
    const { video, audio } = setup()
    video.play()
    audio.emit('waiting')
    expect(video.paused).toBe(true)
    audio.emit('canplay')
    expect(video.paused).toBe(false)
    expect(audio.paused).toBe(false)
    video.play.mockClear()
    audio.emit('playing')
    expect(video.play).not.toHaveBeenCalled()
  })

  it('som esperando com o vídeo pausado não retoma sozinho', () => {
    const { video, audio } = setup()
    audio.emit('waiting')
    audio.emit('canplay')
    expect(video.paused).toBe(true)
  })

  it('fim do vídeo para o som', () => {
    const { video, audio } = setup()
    video.play()
    video.emit('ended')
    expect(audio.paused).toBe(true)
  })

  it('o som é o relógio: diferença grande corrige a posição, pequena corrige a velocidade', () => {
    const { video, audio, sync, intervals } = setup()
    expect(intervals[0].ms).toBe(250)
    video.play()

    video.currentTime = 12
    audio.currentTime = 11
    intervals[0].fn()
    expect(video.currentTime).toBe(11)
    expect(video.playbackRate).toBe(1)

    video.currentTime = 11.2
    sync.tick()
    expect(video.playbackRate).toBeCloseTo(0.95)

    video.currentTime = 10.9
    sync.tick()
    expect(video.playbackRate).toBeCloseTo(1.05)

    video.currentTime = 11.01
    sync.tick()
    expect(video.playbackRate).toBe(1)
    sync.tick()
    expect(video.playbackRate).toBe(1)
  })

  it('não corrige com pausa ou durante uma busca', () => {
    const { video, audio, sync } = setup()
    video.currentTime = 20
    sync.tick()
    expect(video.currentTime).toBe(20)
    video.play()
    video.seeking = true
    sync.tick()
    expect(video.currentTime).toBe(20)
    video.seeking = false
    audio.seeking = true
    sync.tick()
    expect(video.currentTime).toBe(20)
  })

  it('erro no som avisa a página; sem callback não quebra', () => {
    const onError = vi.fn()
    const { audio } = setup({ onError })
    audio.emit('error')
    expect(onError).toHaveBeenCalledTimes(1)
    const other = setup()
    expect(() => other.audio.emit('error')).not.toThrow()
  })

  it('play que rejeita não vira erro solto', async () => {
    const { video, audio } = setup()
    audio.play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')))
    video.play()
    await Promise.resolve()
    expect(audio.play).toHaveBeenCalled()
  })

  it('detach para o relógio e solta os eventos', () => {
    const clearInterval = vi.fn()
    const { video, audio, sync } = setup({ clearInterval })
    sync.detach()
    expect(clearInterval).toHaveBeenCalledWith(1)
    video.play()
    expect(audio.paused).toBe(true)
  })

  it('usa o setInterval da página quando não recebe um', () => {
    const setIntervalSpy = vi.fn(() => 7)
    const clearIntervalSpy = vi.fn()
    const api = load({ setInterval: setIntervalSpy, clearInterval: clearIntervalSpy })
    const sync = api.attach(new FakeMedia(), new FakeMedia())
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 250)
    sync.detach()
    expect(clearIntervalSpy).toHaveBeenCalledWith(7)
  })
})
