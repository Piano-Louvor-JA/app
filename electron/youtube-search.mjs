/**
 * Busca de vídeos no YouTube para o módulo YouTube (Central de Mídia). Sem chave de API:
 * lê o `ytInitialData` da página de resultados e, para "carregar mais", chama o endpoint
 * interno `youtubei/v1/search` com o token de continuação. Erro de rede, verificação de robô
 * ou mudança de formato viram `{ items: [], continuation: null, error }` — nunca exceção.
 */
const TIMEOUT_MS = 10000
const MAX_QUERY = 200
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}
/** Filtro "Tipo: vídeo" da busca do YouTube. */
const ONLY_VIDEOS = 'EgIQAQ%253D%253D'
const DEFAULT_CLIENT_VERSION = '2.20251101.00.00'

/** Objeto JSON logo depois de `marker`, lido respeitando strings e escapes. */
export function extractJsonAfter(html, marker) {
  const text = String(html ?? '')
  const at = text.indexOf(marker)
  if (at < 0) return null
  const start = text.indexOf('{', at + marker.length)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function textOf(node) {
  if (!node || typeof node !== 'object') return ''
  if (typeof node.simpleText === 'string') return node.simpleText.trim()
  if (Array.isArray(node.runs)) return node.runs.map((run) => run?.text ?? '').join('').trim()
  return ''
}

/** Converte um `videoRenderer` do YouTube no item da busca; `null` se faltar id ou título. */
export function videoFromRenderer(renderer) {
  const videoId = typeof renderer?.videoId === 'string' ? renderer.videoId : ''
  const title = textOf(renderer?.title)
  if (!/^[\w-]{11}$/.test(videoId) || !title) return null
  const thumbs = Array.isArray(renderer?.thumbnail?.thumbnails) ? renderer.thumbnail.thumbnails : []
  const thumb = thumbs.length > 0 ? String(thumbs[thumbs.length - 1]?.url ?? '') : ''
  const badges = Array.isArray(renderer?.badges) ? renderer.badges : []
  const live = badges.some((b) => /LIVE/i.test(String(b?.metadataBadgeRenderer?.style ?? '')))
  return {
    videoId,
    title,
    channel: textOf(renderer.ownerText) || textOf(renderer.longBylineText) || textOf(renderer.shortBylineText),
    durationText: textOf(renderer.lengthText),
    viewsText: textOf(renderer.shortViewCountText) || textOf(renderer.viewCountText),
    publishedText: textOf(renderer.publishedTimeText),
    thumbnail: thumb.split('?')[0] || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    live,
  }
}

/**
 * Formato novo do YouTube (2025+): `lockupViewModel` com `contentType` de vídeo.
 * Título em `metadata.lockupMetadataViewModel.title.content`; canal na 1ª linha de metadados;
 * duração no selo da capa.
 */
export function videoFromLockup(lockup) {
  if (lockup?.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null
  const videoId = typeof lockup.contentId === 'string' ? lockup.contentId : ''
  const meta = lockup.metadata?.lockupMetadataViewModel
  const title = typeof meta?.title?.content === 'string' ? meta.title.content.trim() : ''
  if (!/^[\w-]{11}$/.test(videoId) || !title) return null
  const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows
  const parts = (Array.isArray(rows) ? rows : []).map((row) =>
    (Array.isArray(row?.metadataParts) ? row.metadataParts : []).map((part) => String(part?.text?.content ?? '').trim()).filter(Boolean),
  )
  const thumb = lockup.contentImage?.thumbnailViewModel
  const sources = Array.isArray(thumb?.image?.sources) ? thumb.image.sources : []
  let durationText = ''
  for (const overlay of Array.isArray(thumb?.overlays) ? thumb.overlays : []) {
    const badges = overlay?.thumbnailOverlayBadgeViewModel?.thumbnailBadges
    for (const badge of Array.isArray(badges) ? badges : []) {
      const text = badge?.thumbnailBadgeViewModel?.text
      if (typeof text === 'string' && /\d:\d/.test(text)) durationText = text.trim()
    }
  }
  const lastSource = sources.length > 0 ? String(sources[sources.length - 1]?.url ?? '') : ''
  return {
    videoId,
    title,
    channel: parts[0]?.[0] ?? '',
    durationText,
    viewsText: parts[1]?.[0] ?? '',
    publishedText: parts[1]?.[1] ?? '',
    thumbnail: lastSource.split('?')[0] || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    live: false,
  }
}

/** Percorre a árvore e junta os vídeos (em ordem) e o primeiro token de continuação. */
export function collectSearchResults(root, rendererKeys = ['videoRenderer', 'lockupViewModel']) {
  const items = []
  const seen = new Set()
  let token = null
  const stack = [root]
  // Busca em profundidade preservando a ordem dos filhos.
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i])
      continue
    }
    const rendererKey = rendererKeys.find((key) => node[key])
    if (rendererKey) {
      const video = rendererKey === 'lockupViewModel' ? videoFromLockup(node[rendererKey]) : videoFromRenderer(node[rendererKey])
      if (video && !seen.has(video.videoId)) {
        seen.add(video.videoId)
        items.push(video)
      }
      continue
    }
    const continuation = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
    if (!token && typeof continuation === 'string' && continuation) token = continuation
    const keys = Object.keys(node)
    for (let i = keys.length - 1; i >= 0; i--) stack.push(node[keys[i]])
  }
  return { items, token }
}

function readConfig(html, name) {
  const match = String(html ?? '').match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`))
  return match ? match[1] : null
}

/**
 * @param {string} query
 * @param {{ fetch: typeof fetch, timeoutMs?: number }} options
 */
export async function searchYoutube(query, { fetch, timeoutMs = TIMEOUT_MS }) {
  const q = String(query ?? '').trim().slice(0, MAX_QUERY)
  if (!q) return { items: [], continuation: null }
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=${ONLY_VIDEOS}&hl=pt-BR`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { items: [], continuation: null, error: `http-${res.status}` }
    const html = await res.text()
    const data = extractJsonAfter(html, 'ytInitialData = ') ?? extractJsonAfter(html, 'ytInitialData"] = ')
    if (!data) return { items: [], continuation: null, error: 'parse' }
    const { items, token } = collectSearchResults(data)
    return {
      items,
      continuation: token
        ? {
            token,
            apiKey: readConfig(html, 'INNERTUBE_API_KEY'),
            clientVersion: readConfig(html, 'INNERTUBE_CLIENT_VERSION') ?? DEFAULT_CLIENT_VERSION,
          }
        : null,
    }
  } catch {
    return { items: [], continuation: null, error: 'network' }
  }
}

/**
 * Próxima página da busca.
 * @param {{ token: string, apiKey?: string | null, clientVersion?: string }} continuation
 * @param {{ fetch: typeof fetch, timeoutMs?: number }} options
 */
export async function searchYoutubeMore(continuation, { fetch, timeoutMs = TIMEOUT_MS }) {
  const token = typeof continuation?.token === 'string' ? continuation.token : ''
  if (!token) return { items: [], continuation: null }
  const clientVersion = String(continuation.clientVersion || DEFAULT_CLIENT_VERSION)
  const apiKey = typeof continuation.apiKey === 'string' && continuation.apiKey ? continuation.apiKey : null
  try {
    const url = `https://www.youtube.com/youtubei/v1/search?prettyPrint=false${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion, hl: 'pt', gl: 'BR' } },
        continuation: token,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return { items: [], continuation: null, error: `http-${res.status}` }
    const { items, token: next } = collectSearchResults(await res.json())
    return { items, continuation: next ? { token: next, apiKey, clientVersion } : null }
  } catch {
    return { items: [], continuation: null, error: 'network' }
  }
}

/* ---------- Playlists ---------- */

export const PLAYLIST_MAX_VIDEOS = 500
const PLAYLIST_MAX_PAGES = 25

/** Id da playlist num link (`list=`) ou o próprio id colado. */
export function playlistIdFromText(text) {
  const value = String(text ?? '').trim()
  if (!value) return null
  if (/^(PL|UU|LL|FL|OL|RD)[\w-]{10,}$/.test(value)) return value
  // Qualquer texto com `list=<id>` (link de vídeo dentro da playlist, youtu.be, music, embed,
  // com outros parâmetros antes/depois ou texto em volta).
  const match = value.match(/[?&#]list=([\w-]{10,})/)
  return match ? match[1] : null
}

function playlistTitle(data) {
  return (
    textOf({ simpleText: data?.metadata?.playlistMetadataRenderer?.title }) ||
    textOf(data?.header?.playlistHeaderRenderer?.title) ||
    textOf({ simpleText: data?.microformat?.microformatDataRenderer?.title }) ||
    ''
  )
}

/**
 * Vídeos de uma playlist pública (ou não listada), em ordem, até `PLAYLIST_MAX_VIDEOS`.
 * @param {string} id
 * @param {{ fetch: typeof fetch, timeoutMs?: number }} options
 */
export async function fetchYoutubePlaylist(id, { fetch, timeoutMs = TIMEOUT_MS }) {
  const listId = playlistIdFromText(id)
  if (!listId) return { title: '', items: [], error: 'invalid' }
  try {
    const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=pt-BR`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return { title: '', items: [], error: `http-${res.status}` }
    const html = await res.text()
    const data = extractJsonAfter(html, 'ytInitialData = ') ?? extractJsonAfter(html, 'ytInitialData"] = ')
    if (!data) return { title: '', items: [], error: 'parse' }
    // Formato novo (lockupViewModel) e o antigo (playlistVideoRenderer), como o YouTube servir.
    const keys = ['lockupViewModel', 'playlistVideoRenderer', 'playlistPanelVideoRenderer', 'videoRenderer']
    const first = collectSearchResults(data, keys)
    const items = first.items.slice()
    const seen = new Set(items.map((item) => item.videoId))
    const apiKey = readConfig(html, 'INNERTUBE_API_KEY')
    const clientVersion = readConfig(html, 'INNERTUBE_CLIENT_VERSION') ?? DEFAULT_CLIENT_VERSION
    let token = first.token
    for (let page = 0; token && page < PLAYLIST_MAX_PAGES && items.length < PLAYLIST_MAX_VIDEOS; page++) {
      const more = await fetch(`https://www.youtube.com/youtubei/v1/browse?prettyPrint=false${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion, hl: 'pt', gl: 'BR' } }, continuation: token }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!more.ok) break
      const next = collectSearchResults(await more.json(), keys)
      let added = 0
      for (const item of next.items) {
        if (seen.has(item.videoId)) continue
        seen.add(item.videoId)
        items.push(item)
        added += 1
      }
      token = added > 0 ? next.token : null
    }
    if (items.length === 0) return { title: playlistTitle(data), items: [], error: 'empty' }
    return { title: playlistTitle(data), items: items.slice(0, PLAYLIST_MAX_VIDEOS) }
  } catch {
    return { title: '', items: [], error: 'network' }
  }
}

/** @param {{ handle: (channel: string, fn: (...args: any[]) => unknown) => void }} ipcMain @param {{ fetch: typeof fetch }} options */
export function registerYoutubeSearchIpc(ipcMain, { fetch }) {
  const logged = (kind) => (result) => {
    if (result?.error) console.warn(`[youtube-search] ${kind}: ${result.error}`)
    return result
  }
  ipcMain.handle('youtube-search:query', (_event, query) => searchYoutube(String(query ?? ''), { fetch }).then(logged('busca')))
  ipcMain.handle('youtube-search:more', (_event, continuation) => searchYoutubeMore(continuation, { fetch }).then(logged('mais')))
  ipcMain.handle('youtube-search:playlist', (_event, text) => fetchYoutubePlaylist(String(text ?? ''), { fetch }).then(logged('playlist')))
}
