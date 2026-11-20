// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { probeMediaDurationMs } from '../services/media-probe'

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

function setLouvorja(value: unknown) {
  Object.defineProperty(window, 'louvorja', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  setLouvorja(undefined)
  warnSpy.mockClear()
})

describe('media-probe - mutation kill', () => {
  it('retorna 0 quando louvorja existe mas media é undefined', async () => {
    setLouvorja({})
    expect(await probeMediaDurationMs('/x.mp4')).toBe(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('retorna 0 quando louvorja.media existe mas probeDuration é undefined', async () => {
    setLouvorja({ media: { probeDuration: undefined } })
    expect(await probeMediaDurationMs('/x.mp4')).toBe(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('retorna 0 quando louvorja.media.probeDuration é null', async () => {
    setLouvorja({ media: { probeDuration: null } })
    expect(await probeMediaDurationMs('/x.mp4')).toBe(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('chama probeDuration com path correto', async () => {
    const probeDuration = vi.fn().mockResolvedValue(123_456)
    setLouvorja({ media: { probeDuration } })
    expect(await probeMediaDurationMs('/custom/path/video.mp4')).toBe(123_456)
    expect(probeDuration).toHaveBeenCalledWith('/custom/path/video.mp4')
  })
})