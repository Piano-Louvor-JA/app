import type { MediaLyricSlide, MediaPlaybackMode, MediaTrackRecord } from '../types/media'

/** Converte `HH:MM:SS` / `MM:SS` / segundos em número de segundos. */
export function parseSlideTimeToSeconds(raw: string | null | undefined): number {
  if (raw == null) return 0
  const trimmed = raw.trim()
  if (!trimmed) return 0

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part))) return 0
    if (parts.length === 3) {
      return (parts[0] as number) * 3600 + (parts[1] as number) * 60 + (parts[2] as number)
    }
    if (parts.length === 2) {
      return (parts[0] as number) * 60 + (parts[1] as number)
    }
    return 0
  }

  const asNumber = Number(trimmed)
  return Number.isFinite(asNumber) && asNumber >= 0 ? asNumber : 0
}

export function buildMediaSlides(
  track: MediaTrackRecord,
  options?: { showTitleSlide?: boolean },
): MediaLyricSlide[] {
  const showTitle = options?.showTitleSlide !== false
  const cover: MediaLyricSlide = {
    order: -1,
    lyric: showTitle ? track.name : '',
    showSlide: true,
    time: '00:00:00',
    instrumentalTime: '00:00:00',
    imageUrl: track.coverUrl,
    imagePosition: track.coverPosition,
    isCover: true,
  }

  let prevImage = track.coverUrl
  let prevPosition = track.coverPosition

  const lyricSlides = track.lyrics
    .filter((slide) => slide.showSlide)
    // Slides sem texto (solfejo/pausa do upstream: lyric vazio + url_image de
    // partitura) viram slide vazio -> receiver mostra o TITULO no meio do hino
    // (showTitle fallback). Removidos para nao confundir quem nao conhece o hino.
    .filter((slide) => (slide.lyric ?? '').trim().length > 0)
    .map((slide) => {
      if (slide.imageUrl) {
        prevImage = slide.imageUrl
        prevPosition = slide.imagePosition
      }
      return {
        ...slide,
        imageUrl: prevImage,
        imagePosition: prevPosition,
        isCover: false,
      }
    })

  return [cover, ...lyricSlides]
}

export function buildSlideTimesSec(
  slides: MediaLyricSlide[],
  mode: MediaPlaybackMode,
): number[] {
  return slides.map((slide) =>
    parseSlideTimeToSeconds(
      mode === 'instrumental' ? slide.instrumentalTime : slide.time,
    ),
  )
}

export function resolveSlideIndexForTime(
  timesSec: number[],
  currentTimeSec: number,
): number {
  if (timesSec.length === 0) return 0

  let index = 0
  for (let i = 0; i < timesSec.length; i += 1) {
    if (currentTimeSec >= (timesSec[i] as number)) {
      index = i
    } else {
      break
    }
  }
  return index
}

export function stripHtmlBreaks(lyric: string): string {
  return lyric
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export function lyricPreviewSnippet(lyric: string, maxLength = 120): string {
  const plain = stripHtmlBreaks(lyric).replace(/\s+/g, ' ').trim()
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`
}
