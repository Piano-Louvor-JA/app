import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LITURGY_WEB_RUNTIME,
  LITURGY_WEB_RUNTIME_CHANNEL,
  LITURGY_WEB_RUNTIME_STORAGE_KEY,
  LITURGY_YT_SYNC_CHANNEL,
  clearLiturgyWebRuntime,
  normalizeLiturgyWebRuntime,
  parseLiturgyWebTarget,
  publishLiturgyWebRuntime,
  publishLiturgyYtSync,
  readLiturgyWebRuntimeFromStorage,
  toProjectionBrowseUrl,
  toProjectionEmbedUrl,
} from '../services/liturgy-web-runtime'

// Ambiente node: localStorage e BroadcastChannel mockados
const storage = new Map<string, string>()
const postedChannels: Array<{ name: string; message: unknown }> = []

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
})

class FakeBroadcastChannel {
  name: string
  constructor(name: string) {
    this.name = name
  }
  postMessage(message: unknown): void {
    postedChannels.push({ name: this.name, message })
  }
  close(): void {}
}
vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)

beforeEach(() => {
  storage.clear()
  postedChannels.length = 0
})

describe('parseLiturgyWebTarget', () => {
  it('string vazia → null', () => {
    expect(parseLiturgyWebTarget('   ')).toBeNull()
  })

  it('youtu.be: id do path; watch?v=; embed/shorts/live/v', () => {
    expect(parseLiturgyWebTarget('https://youtu.be/abc123')).toEqual({
      kind: 'youtube',
      videoId: 'abc123',
      url: 'https://www.youtube.com/watch?v=abc123',
    })
    expect(parseLiturgyWebTarget('youtube.com/watch?v=v1d&x=1')!.videoId).toBe('v1d')
    expect(parseLiturgyWebTarget('https://m.youtube.com/embed/e1')!.videoId).toBe('e1')
    expect(parseLiturgyWebTarget('https://music.youtube.com/shorts/s1')!.videoId).toBe('s1')
    expect(parseLiturgyWebTarget('https://youtube-nocookie.com/live/l1')!.videoId).toBe('l1')
    expect(parseLiturgyWebTarget('https://www.youtube.com/v/vv')!.videoId).toBe('vv')
  })

  it('youtube sem id resolvível → site', () => {
    const t = parseLiturgyWebTarget('https://youtube.com/channel/xyz')
    expect(t!.kind).toBe('site')
    expect(t!.videoId).toBe('')
  })

  it('vimeo numérico em domínios válidos; id não numérico → site', () => {
    expect(parseLiturgyWebTarget('https://vimeo.com/123456')).toEqual({
      kind: 'vimeo',
      videoId: '123456',
      url: 'https://vimeo.com/123456',
    })
    expect(parseLiturgyWebTarget('https://player.vimeo.com/video/99')!.kind).toBe('vimeo')
    expect(parseLiturgyWebTarget('https://vimeo.com/abc')!.kind).toBe('site')
  })

  it('site comum mantém URL (protocolo adicionado se faltar)', () => {
    expect(parseLiturgyWebTarget('exemplo.com/path')!.url).toBe('https://exemplo.com/path')
    expect(parseLiturgyWebTarget('http://inseguro.com')!.kind).toBe('site')
  })

  it('URL inválida → null', () => {
    expect(parseLiturgyWebTarget('http://')).toBeNull()
  })

  it('youtu.be sem id no path → sem youtubeId (cai em site)', () => {
    const t = parseLiturgyWebTarget('https://youtu.be/')
    expect(t).not.toBeNull()
    expect(t!.kind).toBe('site')
  })

  it('protocolo não-http (ex.: javascript:) → null', () => {
    // new URL não adiciona protocolo aqui pois já há scheme
    const t = parseLiturgyWebTarget('javascript:alert(1)')
    expect(t).toBeNull()
  })
})

describe('deprecated wrappers', () => {
  it('toProjectionBrowseUrl / toProjectionEmbedUrl', () => {
    expect(toProjectionBrowseUrl('https://youtu.be/z')).toBe(
      'https://www.youtube.com/watch?v=z',
    )
    expect(toProjectionBrowseUrl('http://')).toBeNull()
    expect(toProjectionEmbedUrl('exemplo.com')).toBe('https://exemplo.com')
    expect(toProjectionEmbedUrl('')).toBeNull()
  })
})

describe('normalizeLiturgyWebRuntime', () => {
  it('não-objeto → default', () => {
    expect(normalizeLiturgyWebRuntime(null)).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
    expect(normalizeLiturgyWebRuntime(42)).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
  })

  it('coage campos: kind inválido → site, active exige url, startedAt inválido → 0', () => {
    const r = normalizeLiturgyWebRuntime({
      active: true,
      url: '  ',
      kind: 'podcast',
      videoId: 42,
      title: null,
      startedAt: 'x',
    })
    expect(r.active).toBe(false) // url vazia
    expect(r.kind).toBe('site')
    expect(r.videoId).toBe('')
    expect(r.title).toBe('')
    expect(r.startedAt).toBe(0)
  })

  it('runtime válido é preservado; kind desconhecido cai em site', () => {
    const r = normalizeLiturgyWebRuntime({
      active: true,
      url: 'blob:x',
      kind: 'youtube',
      videoId: ' v ',
      title: ' T ',
      startedAt: 123,
    })
    expect(r).toEqual({
      active: true,
      url: 'blob:x',
      kind: 'youtube',
      videoId: 'v',
      title: 'T',
      startedAt: 123,
    })
  })
})

describe('publish/read/clear runtime', () => {
  it('publish grava storage + BroadcastChannel e limpa leader', () => {
    publishLiturgyWebRuntime({
      active: true,
      url: 'https://x',
      title: 'T',
      kind: 'site',
      videoId: '',
      startedAt: 1,
    })
    expect(storage.get(LITURGY_WEB_RUNTIME_STORAGE_KEY)).toContain('https://x')
    expect(postedChannels).toEqual([
      { name: LITURGY_WEB_RUNTIME_CHANNEL, message: expect.objectContaining({ url: 'https://x' }) },
    ])
    expect(storage.has('louvorja-liturgy-yt-leader')).toBe(false)
  })

  it('read: sem storage → default; payload inválido → default', () => {
    expect(readLiturgyWebRuntimeFromStorage()).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
    storage.set(LITURGY_WEB_RUNTIME_STORAGE_KEY, 'not-json')
    expect(readLiturgyWebRuntimeFromStorage()).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
    storage.set(LITURGY_WEB_RUNTIME_STORAGE_KEY, JSON.stringify({ url: 'u' }))
    expect(readLiturgyWebRuntimeFromStorage().url).toBe('u')
  })

  it('clear publica default', () => {
    clearLiturgyWebRuntime()
    const raw = JSON.parse(storage.get(LITURGY_WEB_RUNTIME_STORAGE_KEY)!)
    expect(raw.active).toBe(false)
  })

  it('publishYtSync posta no canal dedicado', () => {
    publishLiturgyYtSync({ videoId: 'v', currentTime: 1, isPaused: false, updatedAt: 2 })
    expect(postedChannels).toEqual([
      { name: LITURGY_YT_SYNC_CHANNEL, message: expect.objectContaining({ videoId: 'v' }) },
    ])
  })

  it('BroadcastChannel indisponível não quebra publish/read', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(() =>
      publishLiturgyWebRuntime({
        active: false,
        url: '',
        title: '',
        kind: 'site',
        videoId: '',
        startedAt: 0,
      }),
    ).not.toThrow()
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  })
})
