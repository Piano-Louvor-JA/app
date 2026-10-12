import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  loadUserPreferences,
  saveUserPreferences,
  setUserPreference,
} from '@shared/services/user-preferences'

import {
  DEFAULT_STAGE_SETTINGS,
  parseStageSettings,
  serializeStageSettings,
  type StageModuleScope,
  type StageSettings,
} from '../types/stage-settings'

/**
 * Persistência da personalização do Palco por escopo — paridade com o
 * StageSettingsRepository do APK:
 * - escopo `global` é o padrão herdado
 * - módulo SEM override (loadOptional → null) herda o global
 * - serialização nas MESMAS chaves do APK (sync .louvorja sem conversão)
 */

type StageScope = StageModuleScope | 'global'

/**
 * Migração one-shot (05/10): o default ANTIGO (#0A0E1A) foi persistido pelo
 * código velho — default gravado não é escolha. Na 1ª leitura pós-update,
 * bg de fábrica sai de TODOS os escopos (vira null = imagem vence).
 */
const LEGACY_FACTORY_BG = '#0A0E1A'
const STAGE_BG_MIGRATED_KEY = 'stage.bg-migrated-0510'

function migrateFactoryBg(): void {
  try {
    if (getUserPreference<string>(STAGE_BG_MIGRATED_KEY, '') === '1') return
    const prefs = loadUserPreferences()
    let changed = false
    for (const key of Object.keys(prefs)) {
      if (!key.startsWith(USER_PREFERENCE_KEYS.stageSettingsPrefix)) continue
      const stored = prefs[key]
      if (!stored || typeof stored !== 'object') continue
      const rec = stored as Record<string, unknown>
      if (rec['bg'] === LEGACY_FACTORY_BG) {
        delete rec['bg']
        setUserPreference(key, rec)
        changed = true
      }
    }
    setUserPreference(STAGE_BG_MIGRATED_KEY, '1')
  } catch {
    // storage indisponível: tenta de novo na próxima leitura
  }
}

function keyFor(scope: StageScope): string {
  return `${USER_PREFERENCE_KEYS.stageSettingsPrefix}${scope}`
}

/** Override do escopo; null = herda o global (igual loadOptional do APK). */
export function loadStageSettingsOptional(scope: StageScope): StageSettings | null {
  migrateFactoryBg()
  const stored = getUserPreference<unknown>(keyFor(scope), null)
  if (!stored || typeof stored !== 'object') return null
  return parseStageSettings(stored)
}

/** Settings efetivas: override do módulo > global > defaults. */
export function resolveStageSettings(scope: StageModuleScope): StageSettings {
  return (
    loadStageSettingsOptional(scope) ??
    loadStageSettingsOptional('global') ?? { ...DEFAULT_STAGE_SETTINGS }
  )
}

export function saveStageSettings(scope: StageScope, settings: StageSettings): void {
  setUserPreference(keyFor(scope), serializeStageSettings(settings))
}

/** Remove o override do escopo (volta a herdar o global). */
export function clearStageSettings(scope: StageScope): void {
  const prefs = loadUserPreferences()
  const key = keyFor(scope)
  if (!(key in prefs)) return
  delete prefs[key]
  saveUserPreferences(prefs)
}
