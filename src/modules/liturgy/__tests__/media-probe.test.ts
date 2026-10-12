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

describe('probeMediaDurationMs', () => {
  it('retorna 0 com warn EXATO quando API do electron não existe', async () => {
      setLouvorja(undefined)
      expect(await probeMediaDurationMs('/x.mp4')).toBe(0)
      expect(warnSpy).toHaveBeenCalledWith('[media-probe] electronAPI.media.probeDuration não disponível — duração 0')
    })
    it('retorna 0 com warn EXATO quando media.probeDuration está ausente', async () => {
      setLouvorja({ media: {} })
      expect(await probeMediaDurationMs('/x.mp4')).toBe(0)
      expect(warnSpy).toHaveBeenCalledWith('[media-probe] electronAPI.media.probeDuration não disponível — duração 0')
    })
  it('delega para window.louvorja.media.probeDuration', async () => {
    const probeDuration = vi.fn().mockResolvedValue(42_000)
    setLouvorja({ media: { probeDuration } })
    expect(await probeMediaDurationMs('/video.mp4')).toBe(42_000)
    expect(probeDuration).toHaveBeenCalledWith('/video.mp4')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
