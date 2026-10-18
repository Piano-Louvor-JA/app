import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
beforeEach(() => { localStorage.clear(); vi.resetModules() })
it('restores the chosen light palette with readable colors after reopening', async () => {
  const first = (await import('../useThemeManager')).useThemeManager()
  first.setTheme('luminousClarity')
  first.setAccent('violet')
  await nextTick()
  const { getUserPreference } = await import('@shared/services/user-preferences')
  expect(getUserPreference(USER_PREFERENCE_KEYS.accent)).toBe('violet')
  expect(getUserPreference(USER_PREFERENCE_KEYS.theme)).toBe('luminousClarity')
  vi.resetModules()
  const reopened = (await import('../useThemeManager')).useThemeManager()
  expect(reopened.accentKey.value).toBe('violet')
  expect(document.documentElement.dataset.accent).toBe('violet')
  expect(reopened.currentTheme.value.mode).toBe('light')
  expect(document.documentElement.style.getPropertyValue('--ds-color-primary')).toBe('#7043C2')
  expect(document.documentElement.style.getPropertyValue('--ds-color-on-primary')).toBe('#FFFFFF')
  reopened.setTheme('etherealLumens')
  await nextTick()
  expect(reopened.accentKey.value).toBe('violet')
  expect(document.documentElement.style.getPropertyValue('--ds-color-primary')).toBe('#BBA6FF')
})
