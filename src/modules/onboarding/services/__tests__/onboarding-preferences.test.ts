import { beforeEach, describe, expect, it } from 'vitest'

import {
  isLocationIncomplete,
  loadOnboardingState,
  markFreshInstall,
  normalizeOnboardingState,
  resolveOnboardingMode,
  saveOnboardingState,
  shouldShowHomeReminder,
  snoozedUntil,
} from '../onboarding-preferences'
import { DEFAULT_ONBOARDING_STATE, REMINDER_SNOOZE_MS } from '../../types/onboarding'

const EMPTY = { district: '', church: '' }
const FILLED = { district: 'Distrito Central', church: 'IASD Centro' }
const DONE = { ...DEFAULT_ONBOARDING_STATE, completedAt: '2026-11-26T10:00:00.000Z' }

describe('onboarding-preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('normaliza lixo para o estado padrão', () => {
    expect(normalizeOnboardingState(null)).toEqual(DEFAULT_ONBOARDING_STATE)
    expect(normalizeOnboardingState('x')).toEqual(DEFAULT_ONBOARDING_STATE)
    expect(
      normalizeOnboardingState({ completedAt: 'não é data', reminderSnoozedUntil: 3, reminderDismissed: 'sim' }),
    ).toEqual(DEFAULT_ONBOARDING_STATE)
  })

  it('save → reload devolve o mesmo estado (roundtrip em user_data)', () => {
    const state = {
      completedAt: '2026-11-26T10:00:00.000Z',
      freshInstall: true,
      reminderSnoozedUntil: '2026-12-03T10:00:00.000Z',
      reminderDismissed: true,
    }
    saveOnboardingState(state)
    expect(JSON.parse(localStorage.getItem('user_data') ?? '{}')['onboarding.state']).toEqual(state)
    expect(loadOnboardingState()).toEqual(state)
  })

  it('sem nada gravado, carrega o padrão', () => {
    expect(loadOnboardingState()).toEqual(DEFAULT_ONBOARDING_STATE)
  })

  it('distrito OU igreja vazio conta como incompleto', () => {
    expect(isLocationIncomplete(EMPTY)).toBe(true)
    expect(isLocationIncomplete({ district: 'D', church: '  ' })).toBe(true)
    expect(isLocationIncomplete({ district: '', church: 'I' })).toBe(true)
    expect(isLocationIncomplete(FILLED)).toBe(false)
  })

  describe('resolveOnboardingMode', () => {
    const base = { state: DEFAULT_ONBOARDING_STATE, location: EMPTY, isFirstBoot: false, isAutomated: false }

    it('instalação nova abre o assistente completo, mesmo com distrito vindo do sync', () => {
      expect(resolveOnboardingMode({ ...base, isFirstBoot: true })).toBe('full')
      expect(resolveOnboardingMode({ ...base, isFirstBoot: true, location: FILLED })).toBe('full')
    })

    it('quem já usava e está sem distrito/igreja vê só o passo de localização', () => {
      expect(resolveOnboardingMode(base)).toBe('location')
    })

    it('quem já usava e já preencheu não vê nada', () => {
      expect(resolveOnboardingMode({ ...base, location: FILLED })).toBe('none')
    })

    it('instalação nova continua completa depois do reload do first boot (flag gravada)', () => {
      const state = { ...DEFAULT_ONBOARDING_STATE, freshInstall: true }
      expect(resolveOnboardingMode({ ...base, state, isFirstBoot: false })).toBe('full')
    })

    it('concluído ou navegador automatizado nunca abre', () => {
      expect(resolveOnboardingMode({ ...base, isFirstBoot: true, state: DONE })).toBe('none')
      expect(resolveOnboardingMode({ ...base, isFirstBoot: true, isAutomated: true })).toBe('none')
    })
  })

  describe('shouldShowHomeReminder', () => {
    const now = Date.parse('2026-11-27T10:00:00.000Z')

    it('não aparece antes de o assistente ser concluído', () => {
      expect(shouldShowHomeReminder({ state: DEFAULT_ONBOARDING_STATE, location: EMPTY, now })).toBe(false)
    })

    it('aparece depois do assistente enquanto faltar distrito ou igreja', () => {
      expect(shouldShowHomeReminder({ state: DONE, location: EMPTY, now })).toBe(true)
      expect(shouldShowHomeReminder({ state: DONE, location: FILLED, now })).toBe(false)
    })

    it('"Lembrar depois" esconde até a data; depois volta', () => {
      const state = { ...DONE, reminderSnoozedUntil: snoozedUntil(now) }
      expect(shouldShowHomeReminder({ state, location: EMPTY, now })).toBe(false)
      expect(shouldShowHomeReminder({ state, location: EMPTY, now: now + REMINDER_SNOOZE_MS + 1 })).toBe(true)
    })

    it('"Não perguntar mais" esconde de vez', () => {
      expect(shouldShowHomeReminder({ state: { ...DONE, reminderDismissed: true }, location: EMPTY, now })).toBe(false)
    })
  })

  describe('markFreshInstall', () => {
    it('grava a flag de instalação nova e sobrevive a reload', () => {
      markFreshInstall()
      expect(loadOnboardingState().freshInstall).toBe(true)
    })

    it('não marca quem já concluiu (ex.: re-bootstrap ao trocar idioma)', () => {
      saveOnboardingState(DONE)
      markFreshInstall()
      expect(loadOnboardingState().freshInstall).toBe(false)
    })

    it('chamar de novo não muda nada', () => {
      markFreshInstall()
      markFreshInstall()
      expect(loadOnboardingState()).toEqual({ ...DEFAULT_ONBOARDING_STATE, freshInstall: true })
    })
  })
})
