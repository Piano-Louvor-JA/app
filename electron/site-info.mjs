/**
 * Dados de uma página (título, nome do site e descrição) para preencher o item de site da liturgia
 * ao colar o link. Lê as meta tags Open Graph / description do `<head>`; o renderer não consegue
 * (CORS). Identifica-se como leitor de prévia de link: redes sociais só entregam as meta tags assim.
 */
const TIMEOUT_MS = 8000
const MAX_BYTES = 2 * 1024 * 1024
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LouvorJA-Piano/1.0; link preview bot)',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeHtmlEntities(text) {
  return String(text ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match
  })
}

function clean(text) {
  return decodeHtmlEntities(text).replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

function metaTags(html) {
  const tags = new Map()
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {}
    for (const [, name, , dq, sq, bare] of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[name.toLowerCase()] = dq ?? sq ?? bare
    }
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase()
    if (key && attrs.content != null && !tags.has(key)) tags.set(key, attrs.content)
  }
  return tags
}

/** @returns {{ title: string, siteName: string, description: string } | null} */
export function parseSiteInfo(html) {
  const text = String(html ?? '')
  const tags = metaTags(text)
  const pick = (...keys) => keys.map((key) => clean(tags.get(key) ?? '')).find(Boolean) ?? ''
  const titleTag = clean(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ')
  const title = pick('og:title', 'twitter:title') || titleTag
  if (!title) return null
  return {
    title: title.replace(/\s+/g, ' '),
    siteName: pick('og:site_name', 'application-name'),
    description: pick('og:description', 'description', 'twitter:description'),
  }
}

function charsetOf(contentType, head) {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1]
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1]
  return fromHeader ?? fromMeta ?? 'utf-8'
}

function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/**
 * Bytes da página até passar do `<head>` e do `<title>` (mais um pedaço, para as meta tags ao lado),
 * ou até o limite. Há páginas (YouTube) com o título e as meta tags depois do `</head>`.
 */
async function readHead(res) {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks = []
  let size = 0
  let tail = ''
  let seenHead = false
  let seenTitle = false
  try {
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.byteLength
      if (seenHead && seenTitle) break
      tail = (tail + Buffer.from(value).toString('latin1')).slice(-value.byteLength - 16)
      seenHead ||= /<\/head>/i.test(tail)
      seenTitle ||= /<\/title>/i.test(tail)
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
}

/** @param {string} url @param {{ fetch: typeof fetch, timeoutMs?: number }} options */
export async function fetchSiteInfo(url, { fetch, timeoutMs = TIMEOUT_MS }) {
  let target
  try {
    target = new URL(String(url ?? ''))
  } catch {
    return null
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return null
  try {
    const res = await fetch(target.href, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !/html/i.test(contentType)) return null
    const bytes = await readHead(res)
    const head = Buffer.from(bytes).toString('latin1')
    const info = parseSiteInfo(decodeBytes(bytes, charsetOf(contentType, head)))
    if (!info) return null
    return { ...info, siteName: info.siteName || target.hostname.replace(/^www\./, '') }
  } catch {
    return null
  }
}

/** @param {{ handle: (channel: string, fn: (...args: any[]) => unknown) => void }} ipcMain @param {{ fetch: typeof fetch }} options */
export function registerSiteInfoIpc(ipcMain, { fetch }) {
  ipcMain.handle('site-info:get', (_event, url) => fetchSiteInfo(String(url ?? ''), { fetch }))
}
