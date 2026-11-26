import { computed, ref } from 'vue'

import { useHomeLocation } from '@modules/home/composables/useHomeLocation'

import {
  loadOnboardingState,
  resolveOnboardingMode,
  saveOnboardingState,
  shouldShowHomeReminder,
  snoozedUntil,
} from '../services/onboarding-preferences'
import {
  ONBOARDING_STEPS,
  type OnboardingMode,
  type OnboardingState,
  type OnboardingStep,
} from '../types/onboarding'

function isAutomatedBrowser(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true
}

// Estado único por janela (o assistente e o lembrete da Home leem o mesmo).
const state = ref<OnboardingState>(loadOnboardingState())
const mode = ref<OnboardingMode>('none')
const stepIndex = ref(0)
const now = ref(Date.now())

/** Testes: volta ao estado lido do storage. */
export function resetOnboardingForTests(): void {
  state.value = loadOnboardingState()
  mode.value = 'none'
  stepIndex.value = 0
  now.value = Date.now()
}

export function useOnboarding() {
  const { profile } = useHomeLocation()

  const steps = computed<OnboardingStep[]>(() =>
    mode.value === 'none' ? [] : ONBOARDING_STEPS[mode.value],
  )
  const isOpen = computed(() => steps.value.length > 0)
  const currentStep = computed<OnboardingStep | null>(
    () => steps.value[stepIndex.value] ?? null,
  )
  const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1)
  const showHomeReminder = computed(
    () =>
      !isOpen.value &&
      shouldShowHomeReminder({ state: state.value, location: profile.value, now: now.value }),
  )

  function persist(next: OnboardingState) {
    state.value = next
    saveOnboardingState(next)
  }

  /** Chamado uma vez quando a janela principal fica pronta. */
  function start(options: { isFirstBoot: boolean }) {
    state.value = loadOnboardingState()
    now.value = Date.now()
    mode.value = resolveOnboardingMode({
      state: state.value,
      location: profile.value,
      isFirstBoot: options.isFirstBoot,
      isAutomated: isAutomatedBrowser(),
    })
    stepIndex.value = 0
  }

  /** Conclui: nas próximas aberturas fica só o lembrete da Home. */
  function finish() {
    persist({ ...state.value, completedAt: new Date().toISOString(), freshInstall: false })
    mode.value = 'none'
    stepIndex.value = 0
  }

  function next() {
    if (isLastStep.value) finish()
    else stepIndex.value += 1
  }

  function back() {
    if (stepIndex.value > 0) stepIndex.value -= 1
  }

  function snoozeReminder() {
    now.value = Date.now()
    persist({ ...state.value, reminderSnoozedUntil: snoozedUntil(now.value) })
  }

  function dismissReminder() {
    persist({ ...state.value, reminderDismissed: true })
  }

  return {
    state,
    mode,
    steps,
    stepIndex,
    currentStep,
    isOpen,
    isLastStep,
    showHomeReminder,
    start,
    next,
    back,
    finish,
    snoozeReminder,
    dismissReminder,
  }
}
