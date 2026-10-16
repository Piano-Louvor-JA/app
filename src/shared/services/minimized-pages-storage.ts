import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'

import { parseMinimizedPages, type MinimizedPage } from './minimized-pages'

/**
 * Páginas minimizadas no sessionStorage: sobrevivem a recarregar a página,
 * somem ao fechar o app. Storage indisponível ou dado inválido = lista vazia.
 */
export function loadMinimizedPages(): MinimizedPage[] {
  try {
    return parseMinimizedPages(getBrowserItem(BROWSER_STORAGE_KEYS.minimizedPages, null, 'session'))
  } catch {
    return []
  }
}

export function saveMinimizedPages(list: MinimizedPage[]): void {
  try {
    setBrowserItem(BROWSER_STORAGE_KEYS.minimizedPages, list, 'session')
  } catch {
    // Cota estourada (miniaturas pesam): guarda sem elas; a prévia vira cartão.
    try {
      setBrowserItem(
        BROWSER_STORAGE_KEYS.minimizedPages,
        list.map((page) => ({ ...page, preview: null })),
        'session',
      )
    } catch {
      // sem storage: a barra continua funcionando em memória
    }
  }
}
