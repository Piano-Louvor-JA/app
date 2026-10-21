import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { setUserPreference } from './user-preferences'

/** A single application-level choice, presented only in Settings. */
export function saveApplicationLanguage(locale: string): void {
  if (!['pt-BR', 'fr', 'es', 'en'].includes(locale)) return
  const content = locale === 'pt-BR' || locale === 'en' ? 'pt' : locale
  setUserPreference(USER_PREFERENCE_KEYS.language, locale)
  setUserPreference(USER_PREFERENCE_KEYS.bibleLanguage, content)
  setUserPreference(USER_PREFERENCE_KEYS.musicLanguage, content)
}
