// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gap-fill de media-runtime.ts — normalizeMediaRuntime com tipos errados,
 * clamps, storage read/write falhos e publish com/sem BroadcastChannel.
 */
import {
  MEDIA_RUNTIME_CHANNEL,
  MEDIA_RUNTIME_STORAGE_KEY,
  normalizeMediaRuntime,
  readMediaRuntimeFromStorage,
  writeMediaRuntimeToStorage,
  publishMediaRuntime,
  clearMediaRuntime,
} from '../media-runtime'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('normalizeMediaRuntime', () => {
  it('não-objeto -> default', () => {
    expect(normalizeMediaRuntime(null)).toMatchObject({ active: false })
    expect(normalizeMediaRuntime('x')).toMatchObject({ active: false })
    expect(normalizeMediaRuntime(42)).toMatchObject({ title: '' })
  })

  it('campos com tipos errados caem nos fallbacks', () => {
    const r = normalizeMediaRuntime({
      active: 'sim',
      title: 123,
      subtitle: {},
      lyric: null,
      imageUrl: '   ',
      imagePosition: 9,
      isCover: 1,
      slideIndex: 'x',
      slideCount: '7',
      nextLyric: false,
      nextIsCover: 'true',
      progressRatio: 5,
      slideProgressRatio: -3,
    })
    expect(r).toEqual({
      active: false,
      title: '',
      subtitle: '',
      lyric: '',
      imageUrl: null,
      imagePosition: null,
      isCover: false,
      slideIndex: 0,
      slideCount: 7,
      nextLyric: '',
      nextIsCover: false,
      progressRatio: 1,
      slideProgressRatio: 0,
    })
  })

  it('strings com whitespace viram null (imageUrl/imagePosition)', () => {
    const r = normalizeMediaRuntime({ imageUrl: '  ', imagePosition: ' ok ' })
    expect(r.imageUrl).toBeNull()
    expect(r.imagePosition).toBe('ok')
  })

  it('campos válidos preservados', () => {
    const r = normalizeMediaRuntime({
      active: true,
      title: 'T',
      subtitle: 'S',
      lyric: 'L',
      imageUrl: 'i.png',
      imagePosition: 'top',
      isCover: true,
      slideIndex: 2,
      slideCount: 5,
      nextLyric: 'N',
      nextIsCover: true,
      progressRatio: 0.5,
      slideProgressRatio: 0.25,
    })
    expect(r.active).toBe(true)
    expect(r.title).toBe('T')
    expect(r.imageUrl).toBe('i.png')
    expect(r.isCover).toBe(true)
    expect(r.slideIndex).toBe(2)
    expect(r.nextIsCover).toBe(true)
    expect(r.progressRatio).toBe(0.5)
  })
})

describe('storage read/write', () => {
  it('read sem chave -> default; JSON inválido -> default', () => {
    const d = readMediaRuntimeFromStorage()
    expect(d.active).toBe(false)
    localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, 'lixo')
    expect(readMediaRuntimeFromStorage().active).toBe(false)
  })

  it('write + read roundtrip; write com storage indisponível não lança', () => {
    writeMediaRuntimeToStorage({
      active: true,
      title: 'T',
      subtitle: '',
      lyric: 'L',
      imageUrl: null,
      imagePosition: null,
      isCover: false,
      slideIndex: 1,
      slideCount: 2,
      nextLyric: '',
      nextIsCover: false,
      progressRatio: 0,
      slideProgressRatio: 0,
    })
    expect(readMediaRuntimeFromStorage().title).toBe('T')
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() =>
      writeMediaRuntimeToStorage({
        active: true,
        title: 'X',
        subtitle: '',
        lyric: '',
        imageUrl: null,
        imagePosition: null,
        isCover: false,
        slideIndex: 0,
        slideCount: 0,
        nextLyric: '',
        nextIsCover: false,
        progressRatio: 0,
        slideProgressRatio: 0,
      }),
    ).not.toThrow()
    Storage.prototype.setItem = original
  })
})

describe('publish/clear', () => {
  it('publish grava e posta no canal', () => {
    let posted: unknown = null
    const OriginalBC = globalThis.BroadcastChannel
    class FakeBC {
      static instances: FakeBC[] = []
      name: string
      constructor(name: string) {
        this.name = name
        FakeBC.instances.push(this)
      }
      postMessage(msg: unknown) {
        posted = msg
      }
      close() {}
      addEventListener() {}
    }
    ;(globalThis as never as { BroadcastChannel: unknown }).BroadcastChannel =
      FakeBC
    publishMediaRuntime({
      active: true,
      title: 'P',
      subtitle: '',
      lyric: '',
      imageUrl: null,
      imagePosition: null,
      isCover: false,
      slideIndex: 0,
      slideCount: 0,
      nextLyric: '',
      nextIsCover: false,
      progressRatio: 0,
      slideProgressRatio: 0,
    })
    expect(FakeBC.instances[0]?.name).toBe(MEDIA_RUNTIME_CHANNEL)
    expect((posted as { title: string }).title).toBe('P')
    ;(globalThis as never as { BroadcastChannel: unknown }).BroadcastChannel =
      OriginalBC
  })

  it('clearMediaRuntime publica default', () => {
    localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, 'x')
    clearMediaRuntime()
    expect(readMediaRuntimeFromStorage().active).toBe(false)
  })
})
