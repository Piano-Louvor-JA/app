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
