// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de media-audio.ts — dual pool A/B, fades, resolve URLs, listeners,
 * formatMediaClock. Audio real do jsdom + fake timers pros fades.
 */

const isDesktopApp = vi.fn(() => false)
const getDesktopBridge = vi.fn(() => null)
vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: () => isDesktopApp(),
  getDesktopBridge: () => getDesktopBridge(),
})) as never

import {
  resolveRemoteFileUrl,
  resolveMusicAudioUrl,
  resolveSlideImageUrl,
  getMediaAudioElement,
  switchMediaAudioElement,
  fadeVolumeMediaAudio,
  fadeOutMediaAudio,
  fadeInMediaAudio,
  stopAllMediaAudio,
  playMediaAudio,
  pauseMediaAudio,
  stopMediaAudio,
  attachMediaAudioListeners,
  detachMediaAudioListeners,
  formatMediaClock,
} from '../media-audio'

beforeEach(() => {
  // jsdom não implementa pause/load do HTMLMediaElement
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.useFakeTimers()
  isDesktopApp.mockReturnValue(false)
  getDesktopBridge.mockReturnValue(null)
  stopAllMediaAudio()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('resolveRemoteFileUrl', () => {
  it('absoluta passa intacta; relativa ganha base; sem barra inicial', () => {
    expect(resolveRemoteFileUrl('https://x.com/a.mp3')).toBe('https://x.com/a.mp3')
    expect(resolveRemoteFileUrl('http://x.com/a.mp3')).toBe('http://x.com/a.mp3')
    expect(resolveRemoteFileUrl('/musics/1.mp3')).toContain('/musics/1.mp3')
    expect(resolveRemoteFileUrl('musics/1.mp3')).toContain('/musics/1.mp3')
  })
})

describe('resolveMusicAudioUrl', () => {
  it('path vazio/whitespace -> missing', async () => {
    expect(await resolveMusicAudioUrl(null)).toEqual({ ok: false, reason: 'missing' })
    expect(await resolveMusicAudioUrl('   ')).toEqual({ ok: false, reason: 'missing' })
  })

  it('web: remoto; desktop sem bridge: missing; com bridge: local ou remoto', async () => {
    const r = await resolveMusicAudioUrl('/musics/1.mp3')
    expect(r).toMatchObject({ ok: true, source: 'remote' })
    isDesktopApp.mockReturnValue(true)
    const r2 = await resolveMusicAudioUrl('/musics/1.mp3')
    expect(r2).toEqual({ ok: false, reason: 'missing' })
    const check = vi.fn().mockImplementation(async (kind: string) =>
      kind === 'music' ? 'file:///local/1.mp3' : null,
    )
    getDesktopBridge.mockReturnValue({ media: { check } } as never)
    const r3 = await resolveMusicAudioUrl('/musics/1.mp3')
    expect(r3).toMatchObject({ ok: true, source: 'local', url: 'file:///local/1.mp3' })
    check.mockResolvedValue(null)
    const r4 = await resolveMusicAudioUrl('/musics/1.mp3')
    expect(r4).toMatchObject({ ok: true, source: 'remote' })
  })
})

describe('resolveSlideImageUrl', () => {
  it('vazio -> null; web -> remoto; desktop: slides/covers/remoto', async () => {
    expect(await resolveSlideImageUrl(null)).toBeNull()
    expect(await resolveSlideImageUrl('  ')).toBeNull()
    expect(await resolveSlideImageUrl('/images/x.png')).toContain('/images/x.png')
    isDesktopApp.mockReturnValue(true)
    expect(await resolveSlideImageUrl('/images/x.png')).toBeNull() // sem bridge
    const check = vi.fn()
      .mockImplementation(async (kind: string) =>
        kind === 'slides' ? 'file:///s.png' : kind === 'covers' ? 'file:///c.png' : null,
      )
    getDesktopBridge.mockReturnValue({ media: { check } } as never)
    expect(await resolveSlideImageUrl('/images/x.png')).toBe('file:///s.png')
    check.mockImplementation(async (kind: string) =>
      kind === 'covers' ? 'file:///c.png' : null,
    )
    expect(await resolveSlideImageUrl('/images/x.png')).toBe('file:///c.png')
    check.mockResolvedValue(null)
    expect(await resolveSlideImageUrl('/images/x.png')).toContain('/images/x.png')
  })
})

describe('dual pool e fades', () => {
  it('get/switch alternam slots A/B', () => {
    const a = getMediaAudioElement()
    const b = switchMediaAudioElement()
    expect(b).not.toBe(a)
    const a2 = switchMediaAudioElement()
    expect(a2).toBe(a) // volta pro A (mesmo elemento reutilizado)
  })

  it('fadeVolume: mesmo volume resolve direto; fade interpola até o alvo', async () => {
    const audio = getMediaAudioElement()
    audio.volume = 0.5
    await fadeVolumeMediaAudio(audio, 0.5)
    expect(audio.volume).toBe(0.5)
    const p = fadeVolumeMediaAudio(audio, 1, 100)
    await vi.advanceTimersByTimeAsync(150)
    await p
    expect(audio.volume).toBe(1)
  })

  it('fadeVolume: novo fade cancela o anterior; clamp de alvo', async () => {
    vi.useRealTimers()
    const audio = getMediaAudioElement()
    audio.volume = 0
    const p1 = fadeVolumeMediaAudio(audio, 1, 120)
    await new Promise((r) => setTimeout(r, 20))
    const p2 = fadeVolumeMediaAudio(audio, 0, 60) // cancela p1
    await Promise.all([p1, p2])
    expect(audio.volume).toBe(0)
    audio.volume = 0.5
    await fadeVolumeMediaAudio(audio, 5, 50) // clamp 1
    expect(audio.volume).toBe(1)
    await fadeVolumeMediaAudio(audio, -1, 50) // clamp 0
    expect(audio.volume).toBe(0)
  })

  it('fadeOut: pausado/volume 0 resolve na hora; tocando faz fade e pausa', async () => {
    const audio = getMediaAudioElement()
    audio.volume = 0
    await fadeOutMediaAudio(audio)
    expect(audio.volume).toBe(0)
    audio.volume = 0.8
    Object.defineProperty(audio, 'paused', { value: false, configurable: true })
    const p = fadeOutMediaAudio(audio, 100)
    await vi.advanceTimersByTimeAsync(150)
    await p
    expect(audio.volume).toBe(0)
  })

  it('fadeIn: play falha -> false; goal 0 -> seta e retorna; normal faz fade', async () => {
    const audio = getMediaAudioElement()
    audio.volume = 0.5
    mediaAduitFallback: {
      audio.play = vi.fn().mockRejectedValue(new Error('no')) as never
      expect(await fadeInMediaAudio(audio, 1, 100)).toBe(false)
      audio.play = vi.fn().mockResolvedValue(true)
      expect(await fadeInMediaAudio(audio, 0, 100)).toBe(true)
      expect(audio.volume).toBe(0)
      const p = fadeInMediaAudio(audio, 0.8, 100)
      await vi.advanceTimersByTimeAsync(150)
      expect(await p).toBe(true)
      expect(audio.volume).toBe(0.8)
      break mediaAduitFallback
    }
  })

  it('stopAll: pausa ambos os slots e volta pro A', async () => {
    const a = getMediaAudioElement()
    a.volume = 0.5
    const b = switchMediaAudioElement()
    b.volume = 0.5
    stopAllMediaAudio()
    expect(a.volume).toBe(0.5) // stop só pausa/limpa src, não zera volume
    expect(getMediaAudioElement()).toBe(a) // activeSlot de volta pro A
  })
})

describe('play/pause/stop/listeners/clock', () => {
  it('playMediaAudio: true no sucesso, false em rejeição', async () => {
    const audio = getMediaAudioElement()
    expect(await playMediaAudio(audio)).toBe(true)
    audio.play = vi.fn().mockRejectedValue(new Error('no'))
    expect(await playMediaAudio(audio)).toBe(false)
  })

  it('pause/stop manipulam o elemento', () => {
    const audio = getMediaAudioElement()
    const pauseSpy = vi.spyOn(audio, 'pause')
    const removeSpy = vi.spyOn(audio, 'removeAttribute')
    const loadSpy = vi.spyOn(audio, 'load')
    pauseMediaAudio(audio)
    expect(pauseSpy).toHaveBeenCalled()
    stopMediaAudio(audio)
    expect(removeSpy).toHaveBeenCalledWith('src')
    expect(loadSpy).toHaveBeenCalled()
  })

  it('attach/detach registram e removem handlers presentes', () => {
    const audio = getMediaAudioElement()
    const add = vi.spyOn(audio, 'addEventListener')
    const remove = vi.spyOn(audio, 'removeEventListener')
    const handlers = {
      onTimeUpdate: () => {},
      onLoadedMetadata: () => {},
      onPlay: () => {},
      onPause: () => {},
      onEnded: () => {},
      onError: () => {},
    }
    attachMediaAudioListeners(audio, handlers)
    expect(add).toHaveBeenCalledTimes(6)
    detachMediaAudioListeners(audio, handlers)
    expect(remove).toHaveBeenCalledTimes(6)
    // handlers parciais
    attachMediaAudioListeners(audio, { onTimeUpdate: handlers.onTimeUpdate })
    expect(add).toHaveBeenCalledTimes(7)
    detachMediaAudioListeners(audio, {})
    expect(remove).toHaveBeenCalledTimes(6)
  })

  it('formatMediaClock: normal, clamp negativo e não-finito', () => {
    expect(formatMediaClock(0)).toBe('00:00')
    expect(formatMediaClock(65)).toBe('01:05')
    expect(formatMediaClock(600)).toBe('10:00')
    expect(formatMediaClock(-1)).toBe('00:00')
    expect(formatMediaClock(Number.NaN)).toBe('00:00')
    expect(formatMediaClock(Number.POSITIVE_INFINITY)).toBe('00:00')
  })
})

describe('media-audio — stmts 79/172', () => {
  it('ensureSlotAudio sem Audio global: throw "Audio API unavailable" (79)', async () => {
    vi.resetModules()
    const origAudio = globalThis.Audio
    Object.defineProperty(globalThis, 'Audio', { value: undefined, configurable: true, writable: true })
    try {
      const mod = await import('../media-audio')
      expect(() => mod.getMediaAudioElement()).toThrow('Audio API unavailable')
    } finally {
      ;(globalThis as { Audio?: unknown }).Audio = origAudio
    }
  })

  it('fadeOut concluído com volume <= 0.01: pausa o elemento (172)', async () => {
    const audio = getMediaAudioElement()
    audio.volume = 0.5
    const pauseSpy = vi.fn()
    audio.pause = pauseSpy as never
    Object.defineProperty(audio, 'paused', { value: false, configurable: true })
    const p = fadeOutMediaAudio(audio, 100)
    await vi.advanceTimersByTimeAsync(200)
    await p
    expect(audio.volume).toBeLessThanOrEqual(0.01)
    expect(pauseSpy).toHaveBeenCalled()
  })
})
