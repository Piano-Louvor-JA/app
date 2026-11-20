// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  OnlineVideoError,
  buildResolveArgs,
  classifyYtdlpError,
  formatSelector,
  isVideoId,
  parseResolveOutput,
  pickSubtitle,
  resolveTracks,
  warnOnly,
} from '../resolver.mjs'

const ID = 'RxEJ9J45lnA'
const cdn = (itag, clen) => `https://rr3---sn-abc.googlevideo.com/videoplayback?itag=${itag}&clen=${clen}&expire=1`

function info(overrides = {}) {
  return {
    id: ID,
    title: 'Arautos do Rei - Vaso de Alabastro',
    duration: 288,
    language: 'pt',
    live_status: 'not_live',
    requested_formats: [
      { format_id: '136', protocol: 'https', ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', height: 720, width: 1280, url: cdn(136, 59900000), available_at: 1793927027 },
      { format_id: '140', protocol: 'https', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', url: cdn(140, 8400000), available_at: 1793927027 },
    ],
    subtitles: {
      live_chat: [{ ext: 'json', url: 'https://www.youtube.com/live_chat' }],
      en: [{ ext: 'json3', url: 'https://www.youtube.com/api/timedtext?lang=en&fmt=json3' }, { ext: 'vtt', url: 'https://www.youtube.com/api/timedtext?lang=en&fmt=vtt' }],
      'pt-BR': [{ ext: 'vtt', url: 'https://www.youtube.com/api/timedtext?lang=pt-BR&fmt=vtt' }],
    },
    ...overrides,
  }
}

describe('isVideoId', () => {
  it('accepts only 11-character YouTube ids', () => {
    expect(isVideoId(ID)).toBe(true)
    expect(isVideoId('mWf0XSIbYz8')).toBe(true)
    expect(isVideoId('short')).toBe(false)
    expect(isVideoId('RxEJ9J45lnA&list=1')).toBe(false)
    expect(isVideoId('../../etc/x')).toBe(false)
    expect(isVideoId(null)).toBe(false)
  })
})

describe('formatSelector', () => {
  it('prefers H.264 video plus AAC audio over plain https, capped at the chosen height', () => {
    const selector = formatSelector(720)
    const [first, ...fallbacks] = selector.split('/')
    expect(first).toBe('bv*[height<=720][vcodec^=avc1][protocol=https]+ba[acodec^=mp4a][protocol=https]')
    expect(fallbacks.every(part => part.includes('[height<=720]') && part.includes('[protocol=https]'))).toBe(true)
  })

  it('falls back to 720p when the height is not one of the offered options', () => {
    expect(formatSelector(999)).toContain('[height<=720]')
    expect(formatSelector(1080)).toContain('[height<=1080]')
  })
})

describe('buildResolveArgs', () => {
  it('asks yt-dlp only for the JSON of the chosen tracks, with the Electron runtime', () => {
    const args = buildResolveArgs({ id: ID, maxHeight: 720, jsRuntime: 'node:/opt/piano/piano', cacheDir: '/tmp/c' })
    expect(args).toContain('-J')
    expect(args).toContain('--ignore-config')
    expect(args).toContain('--no-playlist')
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe('node:/opt/piano/piano')
    expect(args[args.indexOf('--cache-dir') + 1]).toBe('/tmp/c')
    expect(args[args.indexOf('-f') + 1]).toBe(formatSelector(720))
    expect(args.at(-1)).toBe(`https://www.youtube.com/watch?v=${ID}`)
  })

  it('refuses an invalid id before building any command', () => {
    expect(() => buildResolveArgs({ id: '--exec=rm', maxHeight: 720 })).toThrow(OnlineVideoError)
  })
})

describe('parseResolveOutput', () => {
  it('extracts both tracks with exact sizes, title, duration and availability time', () => {
    const result = parseResolveOutput(JSON.stringify(info()), { locale: 'pt-BR' })
    expect(result).toMatchObject({
      id: ID,
      title: 'Arautos do Rei - Vaso de Alabastro',
      duration: 288,
      height: 720,
      availableAt: 1793927027000,
      video: { size: 59900000, ext: 'mp4', codec: 'avc1.4d401f' },
      audio: { size: 8400000, ext: 'm4a', codec: 'mp4a.40.2' },
    })
    expect(result.video.url).toBe(cdn(136, 59900000))
  })

  it('accepts a single muxed format as video without a separate audio track', () => {
    const muxed = { format_id: '18', protocol: 'https', ext: 'mp4', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', height: 360, url: cdn(18, 1000), filesize: 1000 }
    const result = parseResolveOutput(JSON.stringify(info({ requested_formats: undefined, ...muxed })), {})
    expect(result.audio).toBeNull()
    expect(result.video.size).toBe(1000)
    expect(result.height).toBe(360)
  })

  it('rejects links outside the YouTube CDN or without https', () => {
    const bad = info()
    bad.requested_formats[0].url = 'https://evil.example.com/videoplayback?clen=10'
    expect(() => parseResolveOutput(JSON.stringify(bad), {})).toThrow(expect.objectContaining({ code: 'format' }))
    const http = info()
    http.requested_formats[1].url = 'http://rr3---sn-abc.googlevideo.com/videoplayback?clen=10'
    expect(() => parseResolveOutput(JSON.stringify(http), {})).toThrow(expect.objectContaining({ code: 'format' }))
  })

  it('rejects fragmented formats that cannot be fetched by byte range', () => {
    const fragmented = info()
    fragmented.requested_formats[0].protocol = 'm3u8_native'
    expect(() => parseResolveOutput(JSON.stringify(fragmented), {})).toThrow(expect.objectContaining({ code: 'format' }))
  })

  it('rejects tracks without a known size', () => {
    const unknown = info()
    unknown.requested_formats[1].url = 'https://rr3---sn-abc.googlevideo.com/videoplayback?itag=140'
    expect(() => parseResolveOutput(JSON.stringify(unknown), {})).toThrow(expect.objectContaining({ code: 'format' }))
  })

  it('sends live streams and premieres to the fallback', () => {
    for (const live_status of ['is_live', 'is_upcoming', 'post_live']) {
      expect(() => parseResolveOutput(JSON.stringify(info({ live_status })), {})).toThrow(expect.objectContaining({ code: 'live' }))
    }
  })

  it('reports unreadable output as an extractor failure', () => {
    expect(() => parseResolveOutput('not json', {})).toThrow(expect.objectContaining({ code: 'extractor' }))
  })

  it('treats a missing availability time as available now', () => {
    const now = info()
    for (const format of now.requested_formats) delete format.available_at
    expect(parseResolveOutput(JSON.stringify(now), {}).availableAt).toBe(0)
  })
})

describe('pickSubtitle', () => {
  it('prefers the app language and ignores the live chat', () => {
    expect(pickSubtitle(info(), 'pt-BR')).toEqual({ lang: 'pt-BR', url: 'https://www.youtube.com/api/timedtext?lang=pt-BR&fmt=vtt' })
  })

  it('falls back to the base language, then the original language, in WebVTT only', () => {
    const subtitles = {
      pt: [{ ext: 'vtt', url: 'https://www.youtube.com/api/timedtext?lang=pt' }],
      en: [{ ext: 'vtt', url: 'https://www.youtube.com/api/timedtext?lang=en' }],
    }
    expect(pickSubtitle({ subtitles, language: 'en' }, 'pt-BR')?.lang).toBe('pt')
    expect(pickSubtitle({ subtitles, language: 'en' }, 'es')?.lang).toBe('en')
    expect(pickSubtitle({ subtitles: { live_chat: [{ ext: 'vtt', url: 'x' }] }, language: 'live_chat' }, 'es')).toBeNull()
    expect(pickSubtitle({ subtitles: { es: [{ ext: 'json3', url: 'x' }] } }, 'es')).toBeNull()
  })

  it('accepts only subtitle links from YouTube over https', () => {
    expect(pickSubtitle({ subtitles: { es: [{ ext: 'vtt', url: 'https://evil.example.com/s.vtt' }] } }, 'es')).toBeNull()
  })
})

describe('classifyYtdlpError', () => {
  it.each([
    ['ERROR: [youtube] x: Private video. Sign in if you\'ve been granted access', 'unavailable'],
    ['ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader', 'unavailable'],
    ['ERROR: [youtube] x: Sign in to confirm your age. This video may be inappropriate for some users.', 'restricted'],
    ['ERROR: [youtube] x: The uploader has not made this video available in your country', 'restricted'],
    ['ERROR: [youtube] x: Sign in to confirm you\u2019re not a bot', 'blocked'],
    ['ERROR: [youtube] x: This live event will begin in 3 hours.', 'live'],
    ['ERROR: [youtube] x: Premieres in 2 days', 'live'],
    ['ERROR: Unable to download API page: <urlopen error [Errno -3] Temporary failure in name resolution>', 'network'],
    ['ERROR: [youtube] x: Unable to download webpage: timed out', 'network'],
    ['ERROR: [youtube] x: Requested format is not available', 'format'],
    ['ERROR: [youtube] x: Failed to extract any player response', 'extractor'],
  ])('classifies %s', (stderr, code) => {
    expect(classifyYtdlpError(stderr)).toBe(code)
  })

  it('only warns, without falling back to YouTube, for videos nobody can watch here', () => {
    expect(warnOnly('unavailable')).toBe(true)
    expect(warnOnly('restricted')).toBe(true)
    expect(warnOnly('extractor')).toBe(false)
    expect(warnOnly('live')).toBe(false)
  })
})

describe('resolveTracks', () => {
  it('runs yt-dlp and parses its output', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: JSON.stringify(info()), stderr: '' }))
    const result = await resolveTracks({ id: ID, maxHeight: 720, locale: 'pt-BR', jsRuntime: 'node:/e', run })
    expect(run).toHaveBeenCalledWith(buildResolveArgs({ id: ID, maxHeight: 720, jsRuntime: 'node:/e' }))
    expect(result.subtitle?.lang).toBe('pt-BR')
  })

  it('turns a failed run into a classified error', async () => {
    const run = vi.fn(async () => ({ code: 1, stdout: '', stderr: 'ERROR: [youtube] x: Private video' }))
    await expect(resolveTracks({ id: ID, maxHeight: 720, run })).rejects.toMatchObject({ code: 'unavailable' })
  })
})
