import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import Dialog from '../AuthAccountDialog.vue'

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), loginGoogle: vi.fn(), logout: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), session: null as unknown, userName: 'Ana', userEmail: 'ana@example.org' }))
vi.mock('../../composables/useAuth', () => ({ useAuth: () => ({ ...auth, session: ref(auth.session), isLoggedIn: ref(!!auth.session), userName: ref(auth.userName), userEmail: ref(auth.userEmail) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vuetify/components', () => ({
  VDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
  VCard: { template: '<section><slot /></section>' },
  VBtn: { props: ['disabled', 'type'], template: '<button :type="type || \'button\'" :disabled="disabled"><slot /></button>' },
  VIcon: { template: '<i />' },
  VTextField: { props: ['modelValue', 'label', 'type', 'disabled', 'rules'], emits: ['update:modelValue'], template: '<input :aria-label="label" :type="type" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
}))
let wrapper: VueWrapper
const open = () => wrapper = mount(Dialog, { props: { modelValue: true } })
async function click(label: string) {
  const button = wrapper.findAll('button').find(button => button.text() === label)
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
async function fill(label: string, value: string) { await wrapper.get(`[aria-label="${label}"]`).setValue(value) }
beforeEach(() => {
  auth.session = null
  auth.userEmail = 'ana@example.org'
  auth.login.mockResolvedValue(true)
  auth.register.mockResolvedValue(true)
  auth.loginGoogle.mockResolvedValue(true)
  auth.logout.mockResolvedValue(undefined)
  auth.forgotPassword.mockResolvedValue(undefined)
})
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks() })

describe('conta — ações do usuário', () => {
  it('segue a abertura controlada pelo pai e fecha por evento', async () => {
    open()
    await wrapper.setProps({ modelValue: false })
    expect(wrapper.find('form').exists()).toBe(false)
    await wrapper.setProps({ modelValue: true })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })
  it('impede envio inválido e envia credenciais válidas', async () => {
    open()
    await wrapper.get('form').trigger('submit')
    expect(auth.login).not.toHaveBeenCalled()
    await fill('auth.email', 'ana@example.org')
    await fill('auth.password', 'secret123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.login).toHaveBeenCalledWith('ana@example.org', 'secret123')
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })
  it('login recusado mantém o formulário aberto e libera nova tentativa', async () => {
    auth.login.mockResolvedValue(false)
    open()
    await fill('auth.email', 'ana@example.org')
    await fill('auth.password', 'short')
    await wrapper.get('form').trigger('submit')
    expect(auth.login).not.toHaveBeenCalled()
    await fill('auth.password', 'secret123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeUndefined()
  })
  it('registro exige nome e retorna ao login pela ação existente', async () => {
    open()
    await click('auth.createAccount')
    await fill('auth.email', 'ana@example.org')
    await fill('auth.password', 'secret123')
    await fill('auth.displayName', 'A')
    await wrapper.get('form').trigger('submit')
    expect(auth.register).not.toHaveBeenCalled()
    await fill('auth.displayName', 'Ana')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.register).toHaveBeenCalledWith('ana@example.org', 'secret123', 'Ana')
    await click('auth.alreadyHaveAccount')
    expect(wrapper.find('[aria-label="auth.displayName"]').exists()).toBe(false)
  })
  it.each([true, false])('login Google com resultado %s', async (result) => {
    auth.loginGoogle.mockResolvedValue(result)
    open()
    await click('Entrar com Google')
    expect(auth.loginGoogle).toHaveBeenCalledOnce()
    expect(!!wrapper.emitted('update:modelValue')).toBe(result)
  })
  it('solicita recuperação pelo email e retorna ao login', async () => {
    open()
    await click('auth.forgotPassword')
    await wrapper.get('form').trigger('submit')
    expect(auth.forgotPassword).not.toHaveBeenCalled()
    await fill('auth.email', 'ana@example.org')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.forgotPassword).toHaveBeenCalledWith('ana@example.org')
    expect(wrapper.find('[aria-label="auth.password"]').exists()).toBe(true)
    await click('auth.forgotPassword')
    await click('auth.back')
    expect(wrapper.find('[aria-label="auth.password"]').exists()).toBe(true)
  })
  it('mostra a conta atual e sai sem enviar credenciais', async () => {
    auth.session = { id: '1' }
    open()
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('ana@example.org')
    await click('auth.logout')
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
    expect(auth.login).not.toHaveBeenCalled()
  })
})
