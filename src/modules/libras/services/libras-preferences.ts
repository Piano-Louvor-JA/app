import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

export const LIBRAS_PREFERENCE_KEYS = {
  enabled: 'libras.enabled',
} as const

export function isLibrasEnabled(): boolean {
  return !!getUserPreference<boolean>(LIBRAS_PREFERENCE_KEYS.enabled, false)
}

export function setLibrasEnabled(enabled: boolean): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.enabled, enabled)
}