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

function keyFor(scope: StageScope): string {
  return `${USER_PREFERENCE_KEYS.stageSettingsPrefix}${scope}`
}

/** Override do escopo; null = herda o global (igual loadOptional do APK). */
export function loadStageSettingsOptional(scope: StageScope): StageSettings | null {
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

/** Raw (não parseado) do override do escopo — uso do sync `.louvorja`. */
export function loadStageSettingsOptionalRaw(scope: StageScope): unknown {
	return getUserPreference<unknown>(keyFor(scope), null)
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
