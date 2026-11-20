import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { findFont } from '@modules/settings/data/font-catalog'
import { getUserPreference, setUserPreference } from './user-preferences'

export const FONT_PREFERENCES_KEY = USER_PREFERENCE_KEYS.fonts
export const FONT_CHANGE_EVENT = 'louvorja-fonts-changed'
export type FontPreferences = {
  version: 1
  systemFamilyId: string | null
  stageFamilyIds: Record<string, string | null>
}

export function loadFontPreferences(): FontPreferences {
  const raw = getUserPreference<Partial<FontPreferences>>(FONT_PREFERENCES_KEY)
  const stageFamilyIds: Record<string, string | null> = {}
  if (raw && typeof raw === 'object' && raw.stageFamilyIds && typeof raw.stageFamilyIds === 'object') {
    for (const [scope, id] of Object.entries(raw.stageFamilyIds)) {
      if (/^[a-z][a-zA-Z-]{0,60}$/.test(scope) && (id === null || typeof id === 'string')) stageFamilyIds[scope] = id
    }
  }
  return { version: 1, systemFamilyId: typeof raw?.systemFamilyId === 'string' ? raw.systemFamilyId : null, stageFamilyIds }
}

export function resolveFontId(scope: string, prefs = loadFontPreferences()): string | null {
  return scope === 'system' ? prefs.systemFamilyId : prefs.stageFamilyIds[scope] ?? prefs.stageFamilyIds.global ?? prefs.systemFamilyId
}

function persist(prefs: FontPreferences) {
  setUserPreference(FONT_PREFERENCES_KEY, prefs)
  window.dispatchEvent(new Event(FONT_CHANGE_EVENT))
  try {
    const channel = new BroadcastChannel(FONT_CHANGE_EVENT)
    channel.postMessage('changed')
    channel.close()
  } catch { /* storage event remains available between windows */ }
}

export function saveFontSelection(scope: string, id: string | null) {
  const font = findFont(id)
  if (id !== null && (!font || (scope === 'system' && !font.ui))) throw new Error('invalid-font')
  if (!/^[a-z][a-zA-Z-]{0,60}$/.test(scope)) throw new Error('invalid-scope')
  const prefs = loadFontPreferences()
  if (scope === 'system') prefs.systemFamilyId = id
  else prefs.stageFamilyIds[scope] = id
  persist(prefs)
}

export function restoreFonts(stages: boolean) {
  const prefs = loadFontPreferences()
  prefs.systemFamilyId = null
  if (stages) prefs.stageFamilyIds = {}
  persist(prefs)
}

export function referencedFonts(): string[] {
  const prefs = loadFontPreferences()
  return [...new Set([prefs.systemFamilyId, ...Object.values(prefs.stageFamilyIds)].filter((id): id is string => Boolean(id)))]
}

export function subscribeFontPreferences(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === 'user_data' || event.key === null) callback() }
  window.addEventListener(FONT_CHANGE_EVENT, callback)
  window.addEventListener('storage', onStorage)
  let channel: BroadcastChannel | undefined
  try {
    channel = new BroadcastChannel(FONT_CHANGE_EVENT)
    channel.addEventListener('message', callback)
  } catch { /* storage fallback */ }
  return () => {
    window.removeEventListener(FONT_CHANGE_EVENT, callback)
    window.removeEventListener('storage', onStorage)
    channel?.close()
  }
}
