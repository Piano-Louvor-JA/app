export const LITURGY_WEB_RUNTIME_CHANNEL = 'louvorja-liturgy-web-runtime'
export const LITURGY_WEB_RUNTIME_STORAGE_KEY = 'louvorja-liturgy-web-runtime-state'
export const LITURGY_YT_SYNC_CHANNEL = 'louvorja-liturgy-yt-sync'

export type LiturgyWebKind = 'youtube' | 'vimeo' | 'site' | 'local-video'

export type LiturgyWebProjectionRuntime = {
  active: boolean
  url: string
  title: string
  kind: LiturgyWebKind
  videoId: string
  /** Epoch ms — todas as telas alinham o início do vídeo a este instante. */
  startedAt: number
}

export type LiturgyYtSyncPayload = {
  videoId: string
  currentTime: number
  isPaused: boolean
  updatedAt: number
}

export const DEFAULT_LITURGY_WEB_RUNTIME: LiturgyWebProjectionRuntime = {
  active: false,
  url: '',
  title: '',
  kind: 'site',
  videoId: '',
  startedAt: 0,
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function extractYoutubeId(parsed: URL, host: string): string | null {
  if (host === 'youtu.be') {
    return parsed.pathname.split('/').filter(Boolean)[0] ?? null
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    return (
      parsed.searchParams.get('v') ||
      parsed.pathname.match(/\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ||
      null
    )
  }

  return null
}

export type LiturgyWebTarget = {
  kind: LiturgyWebKind
  url: string
  videoId: string
}

/** Normaliza link para projeção (YouTube/Vimeo/site). */
export function parseLiturgyWebTarget(raw: string): LiturgyWebTarget | null {
  const value = raw.trim()
  if (!value) return null

  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
    const parsed = new URL(withProtocol)
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()

    const youtubeId = extractYoutubeId(parsed, host)
    if (youtubeId) {
      return {
        kind: 'youtube',
        videoId: youtubeId,
        // Página completa do YouTube (controles e UI nativos) no popup
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`,
      }
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean).pop()
      if (id && /^\d+$/.test(id)) {
        return {
          kind: 'vimeo',
          videoId: id,
          url: `https://vimeo.com/${id}`,
        }
      }
    }

    // Prefixo https?:// garantido acima — protocolo parseado é sempre http(s).
    return { kind: 'site', videoId: '', url: withProtocol }
  } catch {
    return null
  }
}

/** @deprecated Prefer parseLiturgyWebTarget */
export function toProjectionBrowseUrl(raw: string): string | null {
  return parseLiturgyWebTarget(raw)?.url ?? null
}

/** @deprecated Prefer parseLiturgyWebTarget */
export function toProjectionEmbedUrl(raw: string): string | null {
  return parseLiturgyWebTarget(raw)?.url ?? null
}

export function normalizeLiturgyWebRuntime(
  raw: unknown,
): LiturgyWebProjectionRuntime {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LITURGY_WEB_RUNTIME }
  }

  const source = raw as Record<string, unknown>
  const url = asString(source.url).trim()
  const kindRaw = asString(source.kind)
  const kind: LiturgyWebKind =
    kindRaw === 'youtube' || kindRaw === 'vimeo' || kindRaw === 'site'
      ? kindRaw
      : 'site'

  return {
    active: source.active === true && url.length > 0,
    url,
    title: asString(source.title).trim(),
    kind,
    videoId: asString(source.videoId).trim(),
    startedAt: asNumber(source.startedAt),
  }
}

export function readLiturgyWebRuntimeFromStorage(): LiturgyWebProjectionRuntime {
  try {
    const raw = localStorage.getItem(LITURGY_WEB_RUNTIME_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LITURGY_WEB_RUNTIME }
    return normalizeLiturgyWebRuntime(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_LITURGY_WEB_RUNTIME }
  }
}

export function publishLiturgyWebRuntime(
  runtime: LiturgyWebProjectionRuntime,
): void {
  try {
    localStorage.removeItem('louvorja-liturgy-yt-leader')
  } catch {
    // ignore
  }

  try {
    localStorage.setItem(LITURGY_WEB_RUNTIME_STORAGE_KEY, JSON.stringify(runtime))
  } catch {
    // storage indisponível
  }

  try {
    const channel = new BroadcastChannel(LITURGY_WEB_RUNTIME_CHANNEL)
    channel.postMessage(runtime)
    channel.close()
  } catch {
    // BroadcastChannel indisponível
  }
}

export function clearLiturgyWebRuntime(): void {
  publishLiturgyWebRuntime({ ...DEFAULT_LITURGY_WEB_RUNTIME })
}

export function publishLiturgyYtSync(payload: LiturgyYtSyncPayload): void {
  try {
    const channel = new BroadcastChannel(LITURGY_YT_SYNC_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch {
    // BroadcastChannel indisponível
  }
}
