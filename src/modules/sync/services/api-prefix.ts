/**
 * Prefixo de idioma do catálogo ativo (`pt`/`en`/`es`) — usado para montar
 * os nomes dos records da API (`pt_hymnal`, `en_hymnal`, `es_hymnal`,
 * `pt_bible_book`, `liturgy.state.pt`, etc.).
 *
 * Módulo LEVE: sem imports de assets nem serviços — pode ser consumido por
 * qualquer camada (preferences, sync, catálogo) sem ciclo ou peso de bundle.
 *
 * @param customLocale - Override para testes. Se omitido, lê a preferência
 * `language` do `user_data` (localStorage), com fallback `pt`.
 */
function localeToApiPrefix(locale: string): string {
  const prefix = locale.slice(0, 2).toLowerCase()
  return prefix === 'en' || prefix === 'es' ? prefix : 'pt'
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
