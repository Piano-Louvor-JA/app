import {
  normalizeBibleRuntime,
  selectionToRuntime,
  type BibleProjectionRuntime,
} from './bible-runtime'
import { emptySelection } from './scripture-format'
import type { BibleSelection } from '../types/bible'

/**
 * Canal próprio da projeção independente da Bíblia. O runtime principal é
 * desligado pelo takeover do Palco quando outro módulo assume a projeção; a
 * independente segue a seleção do operador sem esse acoplamento (e sem ir
 * para as TVs). Só existe no app: arquivo fora da paridade com o web.
 */
export const BIBLE_INDEPENDENT_CHANNEL = 'louvorja-bible-independent'
export const BIBLE_INDEPENDENT_STORAGE_KEY = 'louvorja-bible-independent-state'

export function readBibleIndependentFromStorage(): BibleProjectionRuntime {
  try {
    const raw = localStorage.getItem(BIBLE_INDEPENDENT_STORAGE_KEY)
    return normalizeBibleRuntime(raw ? (JSON.parse(raw) as unknown) : null)
  } catch {
    return normalizeBibleRuntime(null)
  }
}

export function publishBibleIndependentSelection(
  selection: BibleSelection = emptySelection(),
): void {
  const state = selectionToRuntime(selection)
  try {
    localStorage.setItem(BIBLE_INDEPENDENT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage pode falhar em contextos restritos
  }
  try {
    const channel = new BroadcastChannel(BIBLE_INDEPENDENT_CHANNEL)
    channel.postMessage(state)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}
