// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const auth = {
  session: ref<null | { token: string; user: { id_user: number; email: string; displayName: string } }>(null),
  accountProvider: vi.fn(),
  deleteAccount: vi.fn(),
}

vi.mock('@modules/auth/composables/useAuth', () => ({
  useAuth: () => ({
    session: auth.session,
    userName: { get value() { return auth.session.value?.user.displayName ?? '' } },
    userEmail: { get value() { return auth.session.value?.user.email ?? '' } },
    login: vi.fn(),
    register: vi.fn(),
    loginGoogle: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    accountProvider: auth.accountProvider,
    deleteAccount: auth.deleteAccount,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'pt-BR' }, t: (key: string) => key }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<section><slot /></section>' },
}))

import AuthAccountDialog from '../AuthAccountDialog.vue'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function mountDialog() {
  return mount(AuthAccountDialog, { attachTo: document.body, props: { modelValue: true } })
}

function q<T extends Element>(selector: string): T | null {
  return document.body.querySelector<T>(selector)
}

describe('AuthAccountDialog — excluir conta', () => {
  beforeEach(() => {
    auth.session.value = { token: 'token', user: { id_user: 1, email: 'ana@example.org', displayName: 'Ana' } }
    auth.accountProvider.mockReturnValue('password')
    auth.deleteAccount.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deslogado não oferece excluir conta', () => {
    auth.session.value = null
    const wrapper = mountDialog()
    expect(q('[data-test="auth-delete-start"]')).toBeNull()
    wrapper.unmount()
  })

  it('pede a senha e só habilita o botão com senha digitada', async () => {
    const wrapper = mountDialog()
    q<HTMLButtonElement>('[data-test="auth-delete-start"]')!.click()
    await wrapper.vm.$nextTick()

    expect(document.body.textContent).toContain('auth.deleteWarning')
    const confirm = q<HTMLButtonElement>('.auth-account__button--danger')!
    expect(confirm.disabled).toBe(true)

    const input = q<HTMLInputElement>('[data-test="auth-delete"] input[type="password"]')!
    input.value = 'secret'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    expect(confirm.disabled).toBe(false)

    q<HTMLFormElement>('[data-test="auth-delete"]')!.dispatchEvent(new Event('submit'))
    await flush()
    expect(auth.deleteAccount).toHaveBeenCalledWith('secret')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('conta Google confirma sem campo de senha', async () => {
    auth.accountProvider.mockReturnValue('google')
    const wrapper = mountDialog()
    q<HTMLButtonElement>('[data-test="auth-delete-start"]')!.click()
    await wrapper.vm.$nextTick()

    expect(q('[data-test="auth-delete"] input')).toBeNull()
    expect(document.body.textContent).toContain('auth.deleteGoogleHint')
    q<HTMLButtonElement>('.auth-account__button--danger')!.click()
    await flush()
    expect(auth.deleteAccount).toHaveBeenCalledWith('')
    wrapper.unmount()
  })

  it('falha mantém o modal aberto; cancelar volta para a conta', async () => {
    auth.deleteAccount.mockResolvedValue(false)
    const wrapper = mountDialog()
    q<HTMLButtonElement>('[data-test="auth-delete-start"]')!.click()
    await wrapper.vm.$nextTick()
    const input = q<HTMLInputElement>('[data-test="auth-delete"] input[type="password"]')!
    input.value = 'errada'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    q<HTMLFormElement>('[data-test="auth-delete"]')!.dispatchEvent(new Event('submit'))
    await flush()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    q<HTMLButtonElement>('[data-test="auth-delete"] .auth-account__button--secondary')!.click()
    await wrapper.vm.$nextTick()
    expect(q('[data-test="auth-delete"]')).toBeNull()
    expect(q('[data-test="auth-delete-start"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('submit sem senha não chama a exclusão', async () => {
    const wrapper = mountDialog()
    q<HTMLButtonElement>('[data-test="auth-delete-start"]')!.click()
    await wrapper.vm.$nextTick()
    q<HTMLFormElement>('[data-test="auth-delete"]')!.dispatchEvent(new Event('submit'))
    await flush()
    expect(auth.deleteAccount).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
