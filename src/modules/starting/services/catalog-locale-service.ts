import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'

import {
  essentialFilesForPrefix,
  syncEssentialCatalogFromApi,
} from './bootstrap-service'

/**
 * app#339: garante que o catálogo essencial do idioma alvo esteja em disco
 * ANTES de a UI trocar de idioma. Trocar o idioma nas configurações não
 * baixava os índices do novo idioma — hinário/bíblia/coletâneas ficavam no
 * idioma antigo até reinstalar.
 *
 * Estratégia: syncEssentialCatalogFromApi com apiPrefix OVERRIDE (sem
 * tocar no locale da UI). Idempotente: essenciais já em disco = zero
 * downloads (retomada por arquivo do bootstrap).
 */

/** Locale ("pt-BR") → prefixo de API ("pt"). Mesma tabela do i18n plugin. */
export function localeToApiPrefix(locale: string): string {
  const map: Record<string, string> = {
    'pt-BR': 'pt',
    en: 'en',
    es: 'es',
  }
  return map[locale] ?? 'pt'
}

export function essentialFilesForPrefix(prefix: string): string[] {
  return [
    `${prefix}_categories`,
    `${prefix}_hymnal`,
    `${prefix}_hymnal_1996`,
    `${prefix}_musics`,
    `${prefix}_bible_book`,
    `${prefix}_bible_version`,
  ]
}

/**
 * Garante os essenciais do idioma alvo. Idempotente; relança erros pra o
 * caller decidir (a UI mostra progresso pela fila #338).
 */
export async function ensureCatalogForLocale(
  locale: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const targetPrefix = localeToApiPrefix(locale)
  const currentPrefix = getCurrentApiPrefix()
  if (targetPrefix === currentPrefix) {
    // mesmo idioma corrente: o bootstrap normal já cuidou
    return
  }
  await syncEssentialCatalogFromApi(onProgress ?? (() => {}), {
    apiPrefix: targetPrefix,
  })
}
