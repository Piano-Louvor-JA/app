import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'

import { parseHistoryState, type HistoryState } from './navigation-history'

export interface StoredNavigationHistory {
  state: HistoryState
  /** `history.state.position` do navegador que corresponde ao índice 0. */
  basePosition: number | null
}

/**
 * Histórico de navegação no sessionStorage: sobrevive a recarregar a
 * página, mas some ao fechar o app (cada janela tem o seu).
 * Storage indisponível ou dado inválido = sem histórico salvo.
 */
export function loadNavigationHistory(): StoredNavigationHistory | null {
  try {
    const raw = getBrowserItem<Record<string, unknown>>(BROWSER_STORAGE_KEYS.navigationHistory, null, 'session')
    const state = parseHistoryState(raw?.state)
    if (!state) return null
    const basePosition = Number.isInteger(raw?.basePosition) ? (raw?.basePosition as number) : null
    return { state, basePosition }
  } catch {
    return null
  }
}

export function saveNavigationHistory(state: HistoryState, basePosition: number | null): void {
  try {
    setBrowserItem(BROWSER_STORAGE_KEYS.navigationHistory, { state, basePosition }, 'session')
  } catch {
    // sem storage: o histórico continua funcionando em memória
  }
}
