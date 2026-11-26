/**
 * Prefixo de idioma do catálogo ativo — usado para montar os nomes dos
 * records da API (`pt_hymnal`, `en_hymnal`, `es_hymnal`, `pt_bible_book`,
 * `liturgy.state.pt`, etc.).
 *
 * app#convite-catalogo: idiomas da UI SEM catálogo upstream (fr, ru, uk, ...)
 * agora usam o prefixo NATIVO (não caem mais para `pt`). O catálogo nesse
 * idioma simplesmente não existe — os pontos de leitura tratam record
 * ausente como lista vazia e a Central de Mídia exibe o convite à
 * comunidade para formar o catálogo no idioma.
 *
 * Módulo LEVE: sem imports de assets nem serviços — pode ser consumido por
 * qualquer camada (preferences, sync, catálogo) sem ciclo ou peso de bundle.
 *
 * @param customLocale - Override para testes. Se omitido, lê a preferência
 * `language` do `user_data` (localStorage), com fallback `pt`.
 */

/** Prefixos com catálogo real publicado no upstream (api.louvorja.com.br). */
export const CATALOG_PREFIXES = ['pt', 'en', 'es'] as const

/** O upstream publica catálogo essencial para este prefixo de idioma? */
export function hasCatalogForPrefix(prefix: string): boolean {
  return (CATALOG_PREFIXES as readonly string[]).includes(prefix)
}

export function localeToApiPrefix(locale: string): string {
  const prefix = locale.slice(0, 2).toLowerCase()
  return ['pt', 'en', 'es', 'fr', 'ru', 'uk', 'ja', 'ko', 'zh', 'tr', 'ar', 'hi'].includes(prefix) ? prefix : 'pt'
}

export function getCurrentApiPrefix(customLocale?: string): string {
  if (customLocale) return localeToApiPrefix(customLocale)
  try {
    const stored = localStorage.getItem('user_data')
    if (stored) {
      const prefs = JSON.parse(stored)
      if (typeof prefs.language === 'string') {
        return localeToApiPrefix(prefs.language)
      }
    }
  } catch {
    // localStorage indisponível (SSR/test) — fallback pt
  }
  return 'pt'
}
