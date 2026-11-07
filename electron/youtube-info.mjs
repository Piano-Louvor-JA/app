/**
 * Dados de um vídeo do YouTube (título, canal, duração e descrição) para preencher o item da
 * liturgia ao colar o link. Lê o `ytInitialPlayerResponse` da página do vídeo; `null` quando a
 * página não traz os dados (verificação de robô, vídeo removido, sem rede) e o renderer usa o oEmbed.
 */
const VIDEO_ID = /^[\w-]{11}$/
const MARKER = 'ytInitialPlayerResponse = '
const TIMEOUT_MS = 8000
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

/** Objeto JSON que começa logo depois do marcador, lido respeitando strings e escapes. */
export function extractPlayerResponse(html) {
  const text = String(html ?? '')
  const marker = text.indexOf(MARKER)
  if (marker < 0) return null
  const start = text.indexOf('{', marker)
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

/** @returns {{ title: string, channel: string, description: string, durationMs: number } | null} */
export function youtubeInfoFromPlayerResponse(response) {
  const details = response?.videoDetails
  const title = typeof details?.title === 'string' ? details.title.trim() : ''
  if (!title) return null
  const seconds = Number(details.lengthSeconds)
  return {
    title,
    channel: typeof details.author === 'string' ? details.author.trim() : '',
    description: typeof details.shortDescription === 'string' ? details.shortDescription : '',
    durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0,
  }
}

/** @param {string} id @param {{ fetch: typeof fetch, timeoutMs?: number }} options */
export async function fetchYoutubeInfo(id, { fetch, timeoutMs = TIMEOUT_MS }) {
  if (!VIDEO_ID.test(String(id ?? ''))) return null
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=pt-BR`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return youtubeInfoFromPlayerResponse(extractPlayerResponse(await res.text()))
  } catch {
    return null
  }
}

/** @param {{ handle: (channel: string, fn: (...args: any[]) => unknown) => void }} ipcMain @param {{ fetch: typeof fetch }} options */
export function registerYoutubeInfoIpc(ipcMain, { fetch }) {
  ipcMain.handle('youtube-info:get', (_event, id) => fetchYoutubeInfo(String(id ?? ''), { fetch }))
}
