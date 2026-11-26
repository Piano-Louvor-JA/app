import {
  clearYoutubeHistory,
  isYoutubeFavorite,
  listYoutubeFavorites,
  listYoutubeHistory,
  recordYoutubePlay,
  removeYoutubeHistoryEntry,
  reorderYoutubeFavorites,
  reorderYoutubeHistory,
  toggleYoutubeFavorite,
  type YoutubeFavoriteEntry,
  type YoutubeHistoryEntry,
} from '@modules/youtube/services/youtube-history'
import { playYoutubeVideo, youtubeIdFromText } from '@modules/youtube/services/youtube-player'

/**
 * `youtube.play` do controle remoto: toca no MESMO player do vídeo do YouTube
 * da liturgia (barra de vídeo, sem projetar — a seta da barra do celular
 * projeta) e guarda no histórico do módulo YouTube do desktop.
 */
export async function playYoutubeFromRemote(url: string, title = '', channel = ''): Promise<boolean> {
  const videoId = youtubeIdFromText(url)
  if (!videoId) return false
  const name = title.trim() || videoId
  recordYoutubePlay({ videoId, title: name, channel: channel.trim() })
  return playYoutubeVideo(videoId, name, false)
}


/**
 * `youtube.favorite` do controle remoto: marca/desmarca nos favoritos do
 * módulo YouTube do DESKTOP (a origem). Idempotente: manda o estado desejado,
 * não um "inverter", para cliques repetidos não desfazerem.
 */
export function favoriteYoutubeFromRemote(url: string, favorite: boolean, title = '', channel = ''): boolean {
  const videoId = youtubeIdFromText(url)
  if (!videoId) return false
  if (isYoutubeFavorite(listYoutubeFavorites(), videoId) !== favorite) {
    toggleYoutubeFavorite({ videoId, title: title.trim() || videoId, channel: channel.trim() })
  }
  return true
}

const VIDEO_ID = /^[\w-]{11}$/

/** Id do vídeo a partir do id puro ou de um link do YouTube. */
function videoIdOf(text: string): string | null {
  const value = text.trim()
  return VIDEO_ID.test(value) ? value : youtubeIdFromText(value)
}

/**
 * Histórico e favoritos pelo controle remoto: o celular mexe nas listas do
 * DESKTOP (a origem). `from` é o vídeo (id ou link); `to`, o destino ao reordenar.
 */
export function youtubeLibraryFromRemote(action: string, from = '', to = ''): boolean {
  if (action === 'youtube.historyClear') {
    clearYoutubeHistory()
    return true
  }
  const fromId = videoIdOf(from)
  if (!fromId) return false
  if (action === 'youtube.historyRemove') {
    removeYoutubeHistoryEntry(fromId)
  } else if (action === 'youtube.historyReorder' || action === 'youtube.favoritesReorder') {
    const toId = videoIdOf(to)
    if (!toId) return false
    if (action === 'youtube.historyReorder') reorderYoutubeHistory(fromId, toId)
    else reorderYoutubeFavorites(fromId, toId)
  } else {
    return false
  }
  return true
}

export type YoutubeLibrarySnapshot = {
  libraryKey: string
  history?: YoutubeHistoryEntry[]
  favorites?: YoutubeFavoriteEntry[]
}

/** Hash curto (djb2) para saber se as listas mudaram desde o último envio. */
function hashOf(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

/**
 * Histórico e favoritos do desktop para o celular. As listas são grandes:
 * vão só quando mudam ou quando um celular pede o estado completo (`force`);
 * nos outros envios vai só a chave.
 */
export function createYoutubeLibraryFeed() {
  let sentKey = ''
  return (force: boolean): YoutubeLibrarySnapshot => {
    const history = listYoutubeHistory()
    const favorites = listYoutubeFavorites()
    const libraryKey = hashOf(JSON.stringify([history, favorites]))
    if (libraryKey === sentKey && !force) return { libraryKey }
    sentKey = libraryKey
    return { libraryKey, history, favorites }
  }
}
