import { beforeEach, expect, it, vi } from 'vitest'
import { saveApplicationLanguage } from '../application-language'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

beforeEach(() => localStorage.clear())
it.each([['pt-BR', 'pt'], ['fr', 'fr'], ['es', 'es']])('restores menus and content together for %s after reload', async (locale, content) => {
  saveApplicationLanguage(locale)
  vi.resetModules()
  const { getUserPreference } = await import('../user-preferences')
  expect(getUserPreference(USER_PREFERENCE_KEYS.language)).toBe(locale)
  expect(getUserPreference(USER_PREFERENCE_KEYS.bibleLanguage)).toBe(content)
  expect(getUserPreference(USER_PREFERENCE_KEYS.musicLanguage)).toBe(content)
})
it('ignores invalid locales', async () => {
  saveApplicationLanguage('xyz')
  const { getUserPreference } = await import('../user-preferences')
  expect(getUserPreference(USER_PREFERENCE_KEYS.language)).toBeNull()
})
