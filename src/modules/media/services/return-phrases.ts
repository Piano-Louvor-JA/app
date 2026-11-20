import type { MediaProjectionRuntime } from '../types/media'
import { stripHtmlBreaks } from './media-slides'

/** Regras de texto da tela de retorno (app e retorno de palco no navegador). */
export function isReturnCover(state: MediaProjectionRuntime): boolean {
  return state.isCover || (!stripHtmlBreaks(state.lyric) && Boolean(state.title))
}

export function returnPhrase(state: MediaProjectionRuntime): string {
  if (isReturnCover(state)) return state.title
  return stripHtmlBreaks(state.lyric)
}

export function returnNextPhrase(state: MediaProjectionRuntime): string {
  const lyric = stripHtmlBreaks(state.nextLyric)
  if (state.nextIsCover && !lyric) return state.title
  return lyric
}
