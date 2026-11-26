/**
 * Assistente de primeira execução (.planning/telemetria-dispositivos/SPEC.md §4).
 *
 * - `full`: instalação nova → cor de realce, animação e, por último, distrito/igreja.
 * - `location`: quem já usava o app e está sem distrito/igreja → só o passo 1.
 * - `none`: nada a mostrar.
 */
export type OnboardingMode = 'full' | 'location' | 'none'

export type OnboardingStep = 'location' | 'accent' | 'interaction'

export interface OnboardingState {
  /** ISO do momento em que o assistente foi concluído. */
  completedAt: string | null
  /**
   * Marcado no first boot. O first boot termina com `window.location.reload()`,
   * então a flag em memória do bootstrap se perde; esta sobrevive ao reload.
   */
  freshInstall: boolean
  /** Lembrete da Home escondido até este momento (ISO). */
  reminderSnoozedUntil: string | null
  /** "Não perguntar mais": o lembrete da Home não volta. */
  reminderDismissed: boolean
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completedAt: null,
  freshInstall: false,
  reminderSnoozedUntil: null,
  reminderDismissed: false,
}

export const ONBOARDING_STEPS: Record<Exclude<OnboardingMode, 'none'>, OnboardingStep[]> = {
  // Distrito/igreja por último: as escolhas leves primeiro, o obrigatório no fim.
  full: ['accent', 'interaction', 'location'],
  location: ['location'],
}

/** "Lembrar depois" esconde o lembrete da Home por 7 dias. */
export const REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
