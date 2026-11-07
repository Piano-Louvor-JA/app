/**
 * Descobre, com `yt-dlp -J`, os links diretos das trilhas de um vídeo do YouTube.
 * Nada é baixado aqui: o download em pedaços fica com `progressive.mjs`.
 */

export const QUALITY_HEIGHTS = [480, 720, 1080]
export const DEFAULT_HEIGHT = 720

const VIDEO_ID_RE = /^[\w-]{11}$/
const CDN_HOST_RE = /(^|\.)googlevideo\.com$/i
const SUBTITLE_HOST_RE = /(^|\.)youtube\.com$/i
const LIVE_STATUSES = new Set(['is_live', 'is_upcoming', 'post_live'])

export class OnlineVideoError extends Error {
  /**
   * @param {'unavailable'|'restricted'|'blocked'|'live'|'format'|'network'|'extractor'|'tools'|'disk'|'cancelled'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'OnlineVideoError'
    this.code = code
  }
}

/** @param {unknown} id */
export function isVideoId(id) {
  return typeof id === 'string' && VIDEO_ID_RE.test(id)
}

/** @param {number} maxHeight */
export function formatSelector(maxHeight) {
  const h = QUALITY_HEIGHTS.includes(maxHeight) ? maxHeight : DEFAULT_HEIGHT
  return [
    `bv*[height<=${h}][vcodec^=avc1][protocol=https]+ba[acodec^=mp4a][protocol=https]`,
    `b[height<=${h}][vcodec^=avc1][ext=mp4][protocol=https]`,
    `bv*[height<=${h}][protocol=https]+ba[protocol=https]`,
    `b[height<=${h}][protocol=https]`,
  ].join('/')
}

/**
 * @param {{ id: string, maxHeight: number, jsRuntime?: string, cacheDir?: string }} opts
 * @returns {string[]}
 */
export function buildResolveArgs({ id, maxHeight, jsRuntime, cacheDir }) {
  if (!isVideoId(id)) throw new OnlineVideoError('format', 'ID de vídeo inválido')
  const args = [
    '--ignore-config',
    '--no-playlist',
    '--no-colors',
    '--no-warnings',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '-f',
    formatSelector(maxHeight),
    '-J',
  ]
  if (cacheDir) args.push('--cache-dir', cacheDir)
  if (jsRuntime) args.push('--js-runtimes', jsRuntime)
  args.push(`https://www.youtube.com/watch?v=${id}`)
  return args
}

/** @param {string} raw @param {RegExp} hostRe */
function httpsUrlOn(raw, hostRe) {
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && hostRe.test(url.hostname) ? url : null
  } catch {
    return null
  }
}

function track(format) {
  if (format.protocol !== 'https') {
    throw new OnlineVideoError('format', `Formato ${format.format_id} não pode ser baixado por trechos`)
  }
  const url = httpsUrlOn(format.url, CDN_HOST_RE)
  if (!url) throw new OnlineVideoError('format', `Link do formato ${format.format_id} fora da CDN do YouTube`)
  const size = Number(url.searchParams.get('clen') ?? format.filesize)
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new OnlineVideoError('format', `Tamanho desconhecido no formato ${format.format_id}`)
  }
  const isVideo = format.vcodec && format.vcodec !== 'none'
  return { url: url.href, size, ext: format.ext, codec: isVideo ? format.vcodec : format.acodec }
}

/**
 * Legenda enviada pelo autor, em WebVTT: idioma do app, idioma base do app, idioma original.
 * @param {{ subtitles?: Record<string, Array<{ ext?: string, url?: string }>>, language?: string }} entry
 * @param {string} [locale]
 */
export function pickSubtitle(entry, locale) {
  const subtitles = entry?.subtitles ?? {}
  const base = (value) => (typeof value === 'string' ? value.split('-')[0] : undefined)
  const candidates = [locale, base(locale), entry?.language, base(entry?.language)]
  for (const lang of candidates) {
    if (!lang || lang === 'live_chat' || !Array.isArray(subtitles[lang])) continue
    const vtt = subtitles[lang].find((sub) => sub.ext === 'vtt' && httpsUrlOn(sub.url, SUBTITLE_HOST_RE))
    if (vtt) return { lang, url: vtt.url }
  }
  return null
}

/**
 * @param {string} stdout saída de `yt-dlp -J`
 * @param {{ locale?: string }} opts
 */
export function parseResolveOutput(stdout, { locale } = {}) {
  let data
  try {
    data = JSON.parse(stdout)
  } catch {
    throw new OnlineVideoError('extractor', 'Resposta do yt-dlp ilegível')
  }
  const entry = Array.isArray(data?.entries) ? data.entries[0] : data
  if (!entry || typeof entry !== 'object') throw new OnlineVideoError('extractor', 'Resposta do yt-dlp vazia')
  if (entry.is_live === true || LIVE_STATUSES.has(entry.live_status)) {
    throw new OnlineVideoError('live', 'Transmissões ao vivo tocam pelo YouTube')
  }

  const formats = Array.isArray(entry.requested_formats) ? entry.requested_formats : [entry]
  const videoFormat = formats.find((f) => f.vcodec && f.vcodec !== 'none')
  const audioFormat = formats.find((f) => f !== videoFormat && f.acodec && f.acodec !== 'none')
  const muxed = formats.length === 1 && videoFormat && videoFormat.acodec && videoFormat.acodec !== 'none'
  if (!videoFormat || (!audioFormat && !muxed)) {
    throw new OnlineVideoError('format', 'O vídeo não tem trilhas de imagem e som utilizáveis')
  }

  const availableAt = Math.max(0, ...formats.map((f) => Number(f.available_at) || 0)) * 1000
  return {
    id: entry.id,
    title: typeof entry.title === 'string' ? entry.title : '',
    duration: Number(entry.duration) || 0,
    height: Number(videoFormat.height) || 0,
    availableAt,
    video: track(videoFormat),
    audio: muxed ? null : track(audioFormat),
    subtitle: pickSubtitle(entry, locale),
  }
}

const ERROR_PATTERNS = [
  ['restricted', /confirm your age|inappropriate for some users|available in your country|geo.?restrict/i],
  ['blocked', /confirm you.?re not a bot/i],
  ['live', /live event will begin|Premieres in|is a live stream/i],
  ['format', /Requested format is not available/i],
  ['unavailable', /Private video|Video unavailable|has been removed|account associated with this video has been terminated|no longer available/i],
  ['network', /timed out|Temporary failure in name resolution|getaddrinfo|Connection (reset|refused)|Unable to connect|Network is unreachable|HTTP Error 5\d\d/i],
]

/** @param {string} stderr */
export function classifyYtdlpError(stderr) {
  const text = String(stderr ?? '')
  for (const [code, pattern] of ERROR_PATTERNS) if (pattern.test(text)) return code
  return 'extractor'
}

/** Vídeos que ninguém consegue ver por aqui: só avisar, sem abrir o YouTube no telão. */
export function warnOnly(code) {
  return code === 'unavailable' || code === 'restricted'
}

function lastErrorLine(stderr) {
  const lines = String(stderr ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.findLast((l) => l.startsWith('ERROR')) ?? lines.at(-1) ?? 'yt-dlp falhou'
}

/**
 * @param {{ id: string, maxHeight: number, locale?: string, jsRuntime?: string, cacheDir?: string,
 *   run: (args: string[]) => Promise<{ code: number, stdout: string, stderr: string }> }} opts
 */
export async function resolveTracks({ id, maxHeight, locale, jsRuntime, cacheDir, run }) {
  const args = buildResolveArgs({ id, maxHeight, jsRuntime, cacheDir })
  const result = await run(args)
  if (result.code !== 0) {
    throw new OnlineVideoError(classifyYtdlpError(result.stderr), lastErrorLine(result.stderr))
  }
  return parseResolveOutput(result.stdout, { locale })
}
