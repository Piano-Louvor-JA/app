// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  getLiturgyVideoObjectUrl,
  readAudioDuration,
  readVideoDuration,
  revokeAllLiturgyVideos,
  revokeLiturgyVideo,
  setLiturgyVideoFile,
} from '../services/liturgy-local-video'

const createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
const revokeObjectURL = vi.fn()

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURL,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURL,
    configurable: true,
    writable: true,
  })
})

const mkFile = () => new File(['x'], 'v.mp4', { type: 'video/mp4' })

describe('setLiturgyVideoFile / getLiturgyVideoObjectUrl', () => {
  it('registra blob URL por id e substitui registro anterior revogando', () => {
    const f1 = mkFile()
    const f2 = mkFile()
    const u1 = setLiturgyVideoFile('a', f1)
    const u2 = setLiturgyVideoFile('a', f2)
    expect(u1).not.toBe(u2)
    expect(getLiturgyVideoObjectUrl('a')).toBe(u2)
    expect(revokeObjectURL).toHaveBeenCalledWith(u1)
    revokeLiturgyVideo('a')
  })
  it('retorna undefined para id não registrado', () => {
    expect(getLiturgyVideoObjectUrl('inexistente')).toBeUndefined()
  })
})

describe('revokeLiturgyVideo', () => {
  it('revoga e remove registro existente', () => {
    const u = setLiturgyVideoFile('b', mkFile())
    revokeLiturgyVideo('b')
    expect(getLiturgyVideoObjectUrl('b')).toBeUndefined()
    expect(revokeObjectURL).toHaveBeenCalledWith(u)
  })
  it('não faz nada para id inexistente (NÃO chama revokeObjectURL)', () => {
        revokeObjectURL.mockClear()
        expect(() => revokeLiturgyVideo('nada')).not.toThrow()
        expect(revokeObjectURL).not.toHaveBeenCalled()
      })
  it('ignora erro de revokeObjectURL (já revogada)', () => {
    const u = setLiturgyVideoFile('c', mkFile())
    revokeObjectURL.mockImplementationOnce(() => {
      throw new Error('already revoked')
    })
    expect(() => revokeLiturgyVideo('c')).not.toThrow()
    expect(getLiturgyVideoObjectUrl('c')).toBeUndefined()
    expect(u).toBeTruthy()
  })
})

describe('revokeAllLiturgyVideos', () => {
  it('revoga todos os registros', () => {
    setLiturgyVideoFile('d1', mkFile())
    setLiturgyVideoFile('d2', mkFile())
    revokeAllLiturgyVideos()
    expect(getLiturgyVideoObjectUrl('d1')).toBeUndefined()
    expect(getLiturgyVideoObjectUrl('d2')).toBeUndefined()
  })
})

describe('readVideoDuration', () => {
  it('resolve com duração em loadedmetadata', async () => {
      const created: Record<string, HTMLElement[]> = { video: [] }
      const orig = document.createElement.bind(document)
      const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = orig(tag)
        ;(created[tag] ??= []).push(el)
        return el
      }) as typeof document.createElement)
      const p = readVideoDuration(mkFile())
      await Promise.resolve()
      spy.mockRestore()
      const video = created.video.at(-1) as HTMLVideoElement | undefined
      expect(video).not.toBeNull()
      if (video) {
        Object.defineProperty(video, 'duration', { value: 12.5, configurable: true })
        // mutante L43: preload='' → valida que é 'metadata'
        expect(video.preload).toBe('metadata')
        video.onloadedmetadata?.(new Event('loadedmetadata'))
      }
      await expect(p).resolves.toBe(12.5)
    })
  it('resolve 0 em onerror', async () => {
    const created: Record<string, HTMLElement[]> = { video: [] }
    const orig = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = orig(tag)
      ;(created[tag] ??= []).push(el)
      return el
    }) as typeof document.createElement)
    const p = readVideoDuration(mkFile())
    await Promise.resolve()
    spy.mockRestore()
    const video = created.video.at(-1) as HTMLVideoElement | undefined
    if (video) video.onerror?.(new Event('error'))
    await expect(p).resolves.toBe(0)
  })
  it('onerror resolve imediatamente — NÃO depende do timeout de segurança de 5s (mutante L49)', async () => {
    vi.useFakeTimers()
    try {
      const created: Record<string, HTMLElement[]> = { video: [] }
      const orig = document.createElement.bind(document)
      const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = orig(tag)
        ;(created[tag] ??= []).push(el)
        return el
      }) as typeof document.createElement)
      const p = readVideoDuration(mkFile())
      await Promise.resolve()
      spy.mockRestore()
      const video = created.video.at(-1) as HTMLVideoElement | undefined
      if (video) video.onerror?.(new Event('error'))
      // avança MENOS que 5000ms: se o handler de onerror estiver quebrado,
      // a promise só resolveria via timeout de 5s → teste pendura → mutante morre por timeout
      await vi.advanceTimersByTimeAsync(4999)
      await expect(p).resolves.toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
  it('resolve 0 quando duração não é finita', async () => {
    const created: Record<string, HTMLElement[]> = { video: [] }
    const orig = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = orig(tag)
      ;(created[tag] ??= []).push(el)
      return el
    }) as typeof document.createElement)
    const p = readVideoDuration(mkFile())
    await Promise.resolve()
    spy.mockRestore()
    const video = created.video.at(-1) as HTMLVideoElement | undefined
    if (video) {
      Object.defineProperty(video, 'duration', { value: Infinity, configurable: true })
      video.onloadedmetadata?.(new Event('loadedmetadata'))
    }
    await expect(p).resolves.toBe(0)
  })
  it('resolve 0 no timeout de segurança', async () => {
    vi.useFakeTimers()
    try {
      const p = readVideoDuration(mkFile())
      await vi.advanceTimersByTimeAsync(5100)
      await expect(p).resolves.toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('readAudioDuration', () => {
  it('resolve com duração em loadedmetadata', async () => {
      const created: Record<string, HTMLElement[]> = { audio: [] }
      const orig = document.createElement.bind(document)
      const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = orig(tag)
        ;(created[tag] ??= []).push(el)
        return el
      }) as typeof document.createElement)
      const p = readAudioDuration(new File(['x'], 'a.mp3', { type: 'audio/mpeg' }))
      await Promise.resolve()
      spy.mockRestore()
      const audio = created.audio.at(-1) as HTMLAudioElement | undefined
      expect(audio).not.toBeNull()
      if (audio) {
        Object.defineProperty(audio, 'duration', { value: 33, configurable: true })
        // mutante L61: preload='' → valida que é 'metadata'
        expect(audio.preload).toBe('metadata')
        audio.onloadedmetadata?.(new Event('loadedmetadata'))
      }
      await expect(p).resolves.toBe(33)
    })
  it('resolve 0 em onerror', async () => {
    const created: Record<string, HTMLElement[]> = { audio: [] }
    const orig = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = orig(tag)
      ;(created[tag] ??= []).push(el)
      return el
    }) as typeof document.createElement)
    const p = readAudioDuration(new File(['x'], 'a.mp3'))
    await Promise.resolve()
    spy.mockRestore()
    const audio = created.audio.at(-1) as HTMLAudioElement | undefined
    if (audio) audio.onerror?.(new Event('error'))
    await expect(p).resolves.toBe(0)
  })
  it('onerror resolve imediatamente — NÃO depende do timeout de segurança de 5s (mutante L67)', async () => {
    vi.useFakeTimers()
    try {
      const created: Record<string, HTMLElement[]> = { audio: [] }
      const orig = document.createElement.bind(document)
      const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = orig(tag)
        ;(created[tag] ??= []).push(el)
        return el
      }) as typeof document.createElement)
      const p = readAudioDuration(new File(['x'], 'a.mp3'))
      await Promise.resolve()
      spy.mockRestore()
      const audio = created.audio.at(-1) as HTMLAudioElement | undefined
      if (audio) audio.onerror?.(new Event('error'))
      // avança MENOS que 5000ms: se o handler de onerror estiver quebrado,
      // a promise só resolveria via timeout de 5s → teste pendura → mutante morre por timeout
      await vi.advanceTimersByTimeAsync(4999)
      await expect(p).resolves.toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
  it('resolve 0 quando duração não é finita', async () => {
    const created: Record<string, HTMLElement[]> = { audio: [] }
    const orig = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = orig(tag)
      ;(created[tag] ??= []).push(el)
      return el
    }) as typeof document.createElement)
    const p = readAudioDuration(new File(['x'], 'a.mp3'))
    await Promise.resolve()
    spy.mockRestore()
    const audio = created.audio.at(-1) as HTMLAudioElement | undefined
    if (audio) {
      Object.defineProperty(audio, 'duration', { value: NaN, configurable: true })
      audio.onloadedmetadata?.(new Event('loadedmetadata'))
    }
    await expect(p).resolves.toBe(0)
  })
  it('resolve 0 no timeout de segurança', async () => {
    vi.useFakeTimers()
    try {
      const p = readAudioDuration(new File(['x'], 'a.mp3'))
      await vi.advanceTimersByTimeAsync(5100)
      await expect(p).resolves.toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
