import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

export const LIBRAS_PREFERENCE_KEYS = {
  enabled: 'libras.enabled',
  avatar: 'libras.avatar',
} as const

export type LibrasAvatar = 'icaro' | 'hozana'
const AVATARS: readonly LibrasAvatar[] = ['icaro', 'hozana']

export function isLibrasEnabled(): boolean {
  return !!getUserPreference<boolean>(LIBRAS_PREFERENCE_KEYS.enabled, false)
}

export function setLibrasEnabled(enabled: boolean): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.enabled, enabled)
}

export function getLibrasAvatar(): LibrasAvatar {
  const v = getUserPreference<string>(LIBRAS_PREFERENCE_KEYS.avatar, 'icaro')
  return AVATARS.includes(v as LibrasAvatar) ? (v as LibrasAvatar) : 'icaro'
}

export function setLibrasAvatar(avatar: LibrasAvatar): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.avatar, avatar)
}