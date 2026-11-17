import {
  openLiturgyVideoControl,
  playLiturgyWebOnConfiguredScreens,
} from '@modules/liturgy/services/liturgy-web-projection'
import { parseLiturgyWebTarget } from '@modules/liturgy/services/liturgy-web-runtime'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { YoutubePlaylistResult, YoutubeSearchContinuation, YoutubeSearchResult } from '@shared/types/desktop-bridge'

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/** Id do vídeo quando o texto é um link do YouTube (watch, youtu.be, shorts, embed…). */
export function youtubeIdFromText(text: string): string | null {
  const target = parseLiturgyWebTarget(text.trim())
  return target?.kind === 'youtube' && target.videoId ? target.videoId : null
}

export function isYoutubeSearchAvailable(): boolean {
  return Boolean(getDesktopBridge()?.ytSearch?.query)
}

export async function searchYoutubeVideos(query: string): Promise<YoutubeSearchResult> {
  const api = getDesktopBridge()?.ytSearch
  if (!api) return { items: [], continuation: null, error: 'unavailable' }
  return api.query(query)
}

export async function searchYoutubeVideosMore(continuation: YoutubeSearchContinuation): Promise<YoutubeSearchResult> {
  const api = getDesktopBridge()?.ytSearch
  if (!api) return { items: [], continuation: null, error: 'unavailable' }
  // Cópia simples: o objeto reativo do Vue (Proxy) não atravessa o IPC ("could not be cloned").
  return api.more({
    token: String(continuation.token),
    apiKey: continuation.apiKey ? String(continuation.apiKey) : null,
    clientVersion: String(continuation.clientVersion),
  })
}

/** Vídeos de uma playlist colada (link com `list=`). */
export async function fetchYoutubePlaylist(text: string): Promise<YoutubePlaylistResult> {
  const api = getDesktopBridge()?.ytSearch
  if (!api?.playlist) return { title: '', items: [], error: 'unavailable' }
  try {
    return await api.playlist(text)
  } catch {
    return { title: '', items: [], error: 'network' }
  }
}

/** Título/canal de um vídeo colado por link (para o histórico). */
export async function fetchYoutubeVideoMeta(videoId: string): Promise<{ title: string; channel: string } | null> {
  try {
    const info = await getDesktopBridge()?.ytInfo?.get(videoId)
    return info ? { title: info.title, channel: info.channel } : null
  } catch {
    return null
  }
}

/**
 * Toca com o player de YouTube que o app já tem (o mesmo da liturgia).
 * `screens`: true projeta e toca nas telas configuradas; false abre só o player de controle.
 */
export function playYoutubeVideo(videoId: string, title: string, screens: boolean): Promise<boolean> {
  const url = youtubeWatchUrl(videoId)
  return screens ? playLiturgyWebOnConfiguredScreens(url, title) : openLiturgyVideoControl(url, title)
}
