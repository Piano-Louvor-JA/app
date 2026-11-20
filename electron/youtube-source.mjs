/** Resolve only official YouTube video URLs; never treat a watch page as media. */
export function youtubeSourceId(payload = {}) {
  if (/^[\w-]{11}$/.test(payload.videoId ?? '')) return payload.videoId
  try {
    const url = new URL(payload.url)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    let id = ''
    if (host === 'youtu.be') id = url.pathname.split('/')[1]
    else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      id = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
    }
    return /^[\w-]{11}$/.test(id ?? '') ? id : null
  } catch { return null }
}

const EMBED_PARAMS = {
  autoplay: '1',
  controls: '0',
  rel: '0',
  fs: '0',
  iv_load_policy: '3',
  disablekb: '1',
  modestbranding: '1',
  playsinline: '1',
}

/** Player oficial embutido, sem controles, anotações nem sugestões: a projeção é captura da janela. */
export function youtubeEmbedUrl(videoId) {
  const url = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`)
  for (const [key, value] of Object.entries(EMBED_PARAMS)) url.searchParams.set(key, value)
  return url.toString()
}

export function youtubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}

export function isYoutubeEmbedUrl(value) {
  try {
    const url = new URL(value)
    return /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname.startsWith('/embed/')
  } catch { return false }
}
