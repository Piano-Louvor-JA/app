// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import homeLocale from '@modules/home/locales/pt-BR'
import { loadHomeLocation } from '@modules/home/services/home-preferences'

const { resetAccentMock, setInteractionModeMock } = vi.hoisted(() => ({
  resetAccentMock: vi.fn(),
  setInteractionModeMock: vi.fn(),
}))
vi.mock('@modules/settings/composables/useAppearanceSettings', () => ({
  useAppearanceSettings: () => ({
    resetAccent: resetAccentMock,
    setInteractionMode: setInteractionModeMock,
  }),
}))

import { resetOnboardingForTests, useOnboarding } from '../../composables/useOnboarding'
import { loadOnboardingState } from '../../services/onboarding-preferences'
import onboardingLocale from '../../locales/pt-BR'
import HomeLocationReminder from '../HomeLocationReminder.vue'
import OnboardingDialog from '../OnboardingDialog.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  missingWarn: false,
  fallbackWarn: false,
  messages: { 'pt-BR': { ...homeLocale, ...onboardingLocale } },
})

// Os cards de Configurações têm testes próprios; aqui só importa o fluxo.
const stubs = { AccentColorCard: true, InteractionModeCard: true }

function mountDialog() {
  return mount(OnboardingDialog, { global: { plugins: [i18n], stubs }, attachTo: document.body })
}

const q = (sel: string) => document.body.querySelector<HTMLElement>(`[data-test="${sel}"]`)
const primary = () => q('onboarding-primary') as HTMLButtonElement

async function type(sel: string, value: string) {
  const input = q(sel) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

describe('OnboardingDialog', () => {
  let wrapper: ReturnType<typeof mountDialog> | null = null

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    resetOnboardingForTests()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('fechado quando não há nada a mostrar', () => {
    wrapper = mountDialog()
    expect(q('onboarding-dialog')).toBeNull()
  })

  async function goToLocation() {
    primary().click()
    await nextTick()
    primary().click()
    await nextTick()
  }

  it('abre com o título do assistente, começando pela cor de realce', async () => {
    useOnboarding().start({ isFirstBoot: true })
    wrapper = mountDialog()
    await nextTick()
    expect(q('onboarding-wizard-title')?.textContent).toContain('Assistente de primeira inicialização')
    expect(q('onboarding-wizard-title')?.textContent).toContain('Passo 1 de 3')
    expect(q('onboarding-step-accent')).not.toBeNull()
    expect(q('onboarding-back')).toBeNull()
    expect(q('onboarding-default')).not.toBeNull()
    expect(primary().disabled).toBe(false)
  })

  it('distrito e igreja ficam por último e são obrigatórios para concluir', async () => {
    useOnboarding().start({ isFirstBoot: true })
    wrapper = mountDialog()
    await nextTick()
    await goToLocation()
    expect(q('onboarding-step-location')).not.toBeNull()
    expect(q('onboarding-wizard-title')?.textContent).toContain('Passo 3 de 3')
    expect(q('onboarding-default')).toBeNull()
    expect(q('onboarding-skip')).toBeNull()
    expect(primary().textContent).toContain('Concluir')
    expect(primary().disabled).toBe(true)
    expect(q('onboarding-required')).not.toBeNull()

    await type('onboarding-district', 'Distrito Central')
    await type('onboarding-church', '   ')
    expect(primary().disabled).toBe(true)
    // Enter com a igreja vazia não conclui.
    q('onboarding-church')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()
    expect(q('onboarding-step-location')).not.toBeNull()

    await type('onboarding-church', 'IASD Jardim')
    expect(primary().disabled).toBe(false)
    expect(q('onboarding-required')).toBeNull()
  })

  it('instalação nova: escolhe cor e animação, volta, e conclui gravando distrito/igreja', async () => {
    useOnboarding().start({ isFirstBoot: true })
    wrapper = mountDialog()
    await nextTick()

    primary().click()
    await nextTick()
    expect(q('onboarding-step-interaction')).not.toBeNull()
    q('onboarding-back')?.click()
    await nextTick()
    expect(q('onboarding-step-accent')).not.toBeNull()

    await goToLocation()
    await type('onboarding-district', '  Distrito Central ')
    await type('onboarding-church', 'IASD Jardim')
    primary().click()
    await nextTick()

    expect(q('onboarding-dialog')).toBeNull()
    expect(loadHomeLocation()).toEqual({ district: 'Distrito Central', church: 'IASD Jardim' })
    expect(loadOnboardingState().completedAt).not.toBeNull()
    // Escolheu em vez de usar o padrão: nada foi resetado.
    expect(resetAccentMock).not.toHaveBeenCalled()
    expect(setInteractionModeMock).not.toHaveBeenCalled()
  })

  it('"Usar padrão" volta cor para o padrão e animação para "suave", e segue para distrito/igreja', async () => {
    useOnboarding().start({ isFirstBoot: true })
    wrapper = mountDialog()
    await nextTick()

    q('onboarding-default')?.click()
    await nextTick()
    expect(resetAccentMock).toHaveBeenCalledTimes(1)
    expect(q('onboarding-step-interaction')).not.toBeNull()

    q('onboarding-default')?.click()
    await nextTick()
    expect(setInteractionModeMock).toHaveBeenCalledWith('soft')
    expect(q('onboarding-step-location')).not.toBeNull()
    expect(loadOnboardingState().completedAt).toBeNull()
  })

  it('quem já usava vê só distrito/igreja, também obrigatório, e salva', async () => {
    useOnboarding().start({ isFirstBoot: false })
    wrapper = mountDialog()
    await nextTick()
    expect(q('onboarding-default')).toBeNull()
    // Atualização: título e frase próprios, sem "primeira inicialização" nem "bem-vindo".
    expect(q('onboarding-wizard-title')?.textContent).toContain('Atualização do Piano LouvorJA')
    expect(q('onboarding-wizard-title')?.textContent).not.toContain('Passo')
    expect(q('onboarding-welcome')?.textContent).toContain('Seu Piano LouvorJA foi atualizado')
    expect(q('onboarding-welcome')?.textContent).not.toContain('bem-vindo')
    expect(primary().textContent).toContain('Salvar')
    expect(primary().disabled).toBe(true)

    await type('onboarding-district', 'Bertioga')
    await type('onboarding-church', 'Rio da Praia')
    q('onboarding-church')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()
    expect(q('onboarding-dialog')).toBeNull()
    expect(loadHomeLocation()).toEqual({ district: 'Bertioga', church: 'Rio da Praia' })
  })
})

describe('HomeLocationReminder', () => {
  beforeEach(() => {
    localStorage.clear()
    resetOnboardingForTests()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('aparece depois do assistente e some com "Lembrar depois"', async () => {
    const o = useOnboarding()
    o.start({ isFirstBoot: true })
    o.finish()
    const wrapper = mount(HomeLocationReminder, { global: { plugins: [i18n] } })
    expect(wrapper.find('[data-test="home-location-reminder"]').exists()).toBe(true)
    await wrapper.find('[data-test="home-reminder-snooze"]').trigger('click')
    expect(wrapper.find('[data-test="home-location-reminder"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('"Não perguntar mais" grava a dispensa', async () => {
    const o = useOnboarding()
    o.start({ isFirstBoot: true })
    o.finish()
    const wrapper = mount(HomeLocationReminder, { global: { plugins: [i18n] } })
    await wrapper.find('[data-test="home-reminder-dismiss"]').trigger('click')
    expect(loadOnboardingState().reminderDismissed).toBe(true)
    wrapper.unmount()
  })
})
