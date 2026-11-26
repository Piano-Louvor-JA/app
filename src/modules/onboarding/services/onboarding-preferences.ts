import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import type { HomeLocationProfile } from '@modules/home/types/home'

import {
  DEFAULT_ONBOARDING_STATE,
  REMINDER_SNOOZE_MS,
  type OnboardingMode,
  type OnboardingState,
} from '../types/onboarding'

function asIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

export function normalizeOnboardingState(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ONBOARDING_STATE }
  const source = raw as Record<string, unknown>
  return {
    completedAt: asIsoOrNull(source.completedAt),
    freshInstall: source.freshInstall === true,
    reminderSnoozedUntil: asIsoOrNull(source.reminderSnoozedUntil),
    reminderDismissed: source.reminderDismissed === true,
  }
}

export function loadOnboardingState(): OnboardingState {
  return normalizeOnboardingState(
    getUserPreference<unknown>(USER_PREFERENCE_KEYS.onboarding, null),
  )
}

export function saveOnboardingState(state: OnboardingState): void {
  setUserPreference(USER_PREFERENCE_KEYS.onboarding, normalizeOnboardingState(state))
}

/**
 * Chamado pelo bootstrap no início do first boot (instalação nova). Não faz
 * nada se o assistente já foi concluído (ex.: re-bootstrap por troca de idioma).
 */
export function markFreshInstall(): void {
  const state = loadOnboardingState()
  if (state.completedAt || state.freshInstall) return
  saveOnboardingState({ ...state, freshInstall: true })
}

export function isLocationIncomplete(location: HomeLocationProfile): boolean {
  return location.district.trim().length === 0 || location.church.trim().length === 0
}

export interface ResolveModeInput {
  state: OnboardingState
  location: HomeLocationProfile
  /** Bootstrap rodou o first boot nesta execução (antes do reload). */
  isFirstBoot: boolean
  /** Navegador automatizado (Playwright): o assistente nunca bloqueia o E2E. */
  isAutomated: boolean
}

/**
 * Decide o que abrir na inicialização:
 * - já concluído ou E2E → nada;
 * - instalação nova → assistente completo (mesmo com distrito preenchido por
 *   sync, as telas de cor e animação ainda valem);
 * - quem já usava o app → só o passo de distrito/igreja, se faltar algo.
 */
export function resolveOnboardingMode(input: ResolveModeInput): OnboardingMode {
  if (input.isAutomated || input.state.completedAt) return 'none'
  if (input.isFirstBoot || input.state.freshInstall) return 'full'
  return isLocationIncomplete(input.location) ? 'location' : 'none'
}

export interface ReminderInput {
  state: OnboardingState
  location: HomeLocationProfile
  now: number
}

/** Lembrete leve da Home: só depois do assistente, e enquanto faltar distrito ou igreja. */
export function shouldShowHomeReminder(input: ReminderInput): boolean {
  const { state } = input
  if (!state.completedAt || state.reminderDismissed) return false
  if (!isLocationIncomplete(input.location)) return false
  if (state.reminderSnoozedUntil && Date.parse(state.reminderSnoozedUntil) > input.now) {
    return false
  }
  return true
}

export function snoozedUntil(now: number): string {
  return new Date(now + REMINDER_SNOOZE_MS).toISOString()
}
