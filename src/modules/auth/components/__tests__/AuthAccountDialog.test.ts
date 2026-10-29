// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const auth = {
  session: ref<null | { token: string; user: { id_user: number; email: string; displayName: string } }>(null),
  loginGoogle: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@modules/auth/composables/useAuth', () => ({
  useAuth: () => ({
    session: auth.session,
    userName: { get value() { return auth.session.value?.user.displayName ?? '' } },
    userEmail: { get value() { return auth.session.value?.user.email ?? '' } },
    login: vi.fn(),
    register: vi.fn(),
    loginGoogle: auth.loginGoogle,
    logout: auth.logout,
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'pt-BR' }, t: (key: string) => key }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<section><slot /></section>' },
}))

import AuthAccountDialog from '../AuthAccountDialog.vue'

function mountDialog() {
  return mount(AuthAccountDialog, { attachTo: document.body, props: { modelValue: true } })
}

describe('AuthAccountDialog', () => {
  beforeEach(() => {
    auth.session.value = null
    auth.loginGoogle.mockResolvedValue(true)
    auth.logout.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deslogado mostra formulário e botão Google', () => {
    const wrapper = mountDialog()
    expect(document.body.querySelector('input[type="email"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Entrar com Google')
    wrapper.unmount()
  })

  it('logado mostra nome e Sair', () => {
    auth.session.value = { token: 'token', user: { id_user: 1, email: 'ana@example.org', displayName: 'Ana' } }
    const wrapper = mountDialog()
    expect(document.body.textContent).toContain('Ana')
    expect(document.body.textContent).toContain('auth.logout')
    wrapper.unmount()
  })

  it('logout chama useAuth.logout e fecha modal', async () => {
    auth.session.value = { token: 'token', user: { id_user: 1, email: 'ana@example.org', displayName: 'Ana' } }
    const wrapper = mountDialog()
    document.body.querySelector<HTMLButtonElement>('.auth-account__button--secondary')!.click()
    await wrapper.vm.$nextTick()
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('login Google fecha o modal somente após sucesso', async () => {
    const wrapper = mountDialog()
    document.body.querySelector<HTMLButtonElement>('.auth-account__button--google')!.click()
    await wrapper.vm.$nextTick()
    expect(auth.loginGoogle).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })
})
