import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useHomeLocation } from '@modules/home/composables/useHomeLocation'

import { resetOnboardingForTests, useOnboarding } from '../useOnboarding'
import { loadOnboardingState, markFreshInstall } from '../../services/onboarding-preferences'

function setWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => value })
}

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
    setWebdriver(false)
    resetOnboardingForTests()
  })

  afterEach(() => {
    setWebdriver(false)
  })

  it('instalação nova percorre os 3 passos e grava a conclusão', () => {
    const o = useOnboarding()
    o.start({ isFirstBoot: true })
    expect(o.isOpen.value).toBe(true)
    // Distrito/igreja por último.
    expect(o.steps.value).toEqual(['accent', 'interaction', 'location'])
    expect(o.currentStep.value).toBe('accent')

    o.next()
    expect(o.currentStep.value).toBe('interaction')
    o.back()
    expect(o.currentStep.value).toBe('accent')
    o.back()
    expect(o.currentStep.value).toBe('accent')

    o.next()
    o.next()
    expect(o.isLastStep.value).toBe(true)
    o.next()
    expect(o.isOpen.value).toBe(false)
    expect(loadOnboardingState().completedAt).not.toBeNull()
  })

  it('concluir não abre de novo e limpa a flag de instalação nova', () => {
    markFreshInstall()
    const o = useOnboarding()
    o.start({ isFirstBoot: false })
    expect(o.steps.value).toEqual(['accent', 'interaction', 'location'])
    o.finish()
    expect(loadOnboardingState().freshInstall).toBe(false)
    o.start({ isFirstBoot: true })
    expect(o.isOpen.value).toBe(false)
  })

  it('quem já usava sem igreja vê só o passo de localização', () => {
    useHomeLocation().setLocation({ district: 'Distrito Sul', church: '' })
    const o = useOnboarding()
    o.start({ isFirstBoot: false })
    expect(o.steps.value).toEqual(['location'])
    expect(o.isLastStep.value).toBe(true)
  })

  it('não abre em navegador automatizado (E2E)', () => {
    setWebdriver(true)
    const o = useOnboarding()
    o.start({ isFirstBoot: true })
    expect(o.isOpen.value).toBe(false)
  })

  it('lembrete da Home: aparece depois do assistente e some ao preencher, adiar ou dispensar', () => {
    const o = useOnboarding()
    o.start({ isFirstBoot: true })
    expect(o.showHomeReminder.value).toBe(false)
    o.finish()
    expect(o.showHomeReminder.value).toBe(true)

    o.snoozeReminder()
    expect(o.showHomeReminder.value).toBe(false)
    expect(loadOnboardingState().reminderSnoozedUntil).not.toBeNull()

    o.state.value = { ...o.state.value, reminderSnoozedUntil: null }
    expect(o.showHomeReminder.value).toBe(true)
    useHomeLocation().setLocation({ district: 'D', church: 'I' })
    expect(o.showHomeReminder.value).toBe(false)

    useHomeLocation().setLocation({ district: '', church: '' })
    o.dismissReminder()
    expect(o.showHomeReminder.value).toBe(false)
    expect(loadOnboardingState().reminderDismissed).toBe(true)
  })
})
