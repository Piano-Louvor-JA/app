import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  provider: vi.fn(),
  reauth: vi.fn(),
  fbLogout: vi.fn(),
  fbRevalidate: vi.fn().mockResolvedValue(null),
}))

import { createI18n } from 'vue-i18n'
import i18nPlugin from '@plugins/i18n'
import MediaPt from '../../../media/locales/pt-BR'

// i18n real do app (catálogos core + módulo media) para as mensagens chaveadas do useAuth
const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': { ...i18nPlugin.global.messages.value['pt-BR'], media: MediaPt } } })

vi.mock('@plugins/i18n', async () => {
  const { createI18n } = await import('vue-i18n')
  const core = (await import('@locales/pt-BR')).default
  const media = (await import('../../../media/locales/pt-BR')).default
  const inst = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': { ...core, media } } })
  return { default: inst, global: inst.global }
})
vi.mock('../../../media/services/auth-client', () => ({
  getAuthSession: () => null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  resetPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  deleteAccount: mocks.deleteAccount,
}))
vi.mock('../../services/firebase-client', () => ({
  currentAccountProvider: mocks.provider,
  firebaseReauthenticate: mocks.reauth,
  firebaseLogin: vi.fn(),
  firebaseRegister: vi.fn(),
  firebaseLoginGoogle: vi.fn(),
  firebaseLogout: mocks.fbLogout,
  revalidateFirebaseSessionOnBoot: mocks.fbRevalidate,
  subscribeFirebaseSession: vi.fn(() => null),
}))

import { authSession, setNotify, useAuth } from '../useAuth'

const session = { token: 't', user: { id_user: 1, displayName: 'Ana', email: 'ana@example.org' } }
const notify = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  // a revalidação do boot devolve a mesma sessão (não interfere no resultado)
  mocks.fbRevalidate.mockResolvedValue(session)
  authSession.value = session
  setNotify(notify)
})

describe('useAuth.deleteAccount', () => {
  it('conta com senha no Firebase: reautentica com a senha e não manda a senha à API', async () => {
    mocks.provider.mockReturnValue('password')
    mocks.reauth.mockResolvedValue('ok')
    mocks.deleteAccount.mockResolvedValue('ok')

    expect(await useAuth().deleteAccount('secret')).toBe(true)

    expect(mocks.reauth).toHaveBeenCalledWith('secret')
    expect(mocks.deleteAccount).toHaveBeenCalledWith(undefined)
    expect(mocks.fbLogout).toHaveBeenCalledOnce()
    expect(authSession.value).toBeNull()
    expect(notify).toHaveBeenCalledWith('Conta excluída', undefined)
  })

  it('conta Google: reautentica pelo popup (sem senha)', async () => {
    mocks.provider.mockReturnValue('google')
    mocks.reauth.mockResolvedValue('ok')
    mocks.deleteAccount.mockResolvedValue('ok')

    expect(await useAuth().deleteAccount('')).toBe(true)
    expect(mocks.reauth).toHaveBeenCalledWith(undefined)
  })

  it('sessão legado: a senha vai para a API conferir', async () => {
    mocks.provider.mockReturnValue('legacy')
    mocks.deleteAccount.mockResolvedValue('ok')

    expect(await useAuth().deleteAccount('secret')).toBe(true)
    expect(mocks.reauth).not.toHaveBeenCalled()
    expect(mocks.deleteAccount).toHaveBeenCalledWith('secret')
  })

  it.each([
    ['wrong-password', 'Senha incorreta'],
    ['failed', 'Não foi possível confirmar sua identidade'],
  ])('reautenticação %s não chama a API e mantém a sessão', async (reauth, message) => {
    mocks.provider.mockReturnValue('password')
    mocks.reauth.mockResolvedValue(reauth)

    expect(await useAuth().deleteAccount('x')).toBe(false)
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
    expect(authSession.value).toEqual(session)
    expect(notify).toHaveBeenCalledWith(message, true)
  })

  it.each([
    ['wrong-password', 'Senha incorreta'],
    ['password-required', 'Digite sua senha para confirmar'],
    ['unauthorized', 'Sessão expirada — entre de novo para excluir a conta'],
    ['failed', 'Não foi possível excluir a conta'],
  ])('API respondeu %s: mantém a sessão e avisa', async (result, message) => {
    mocks.provider.mockReturnValue('legacy')
    mocks.deleteAccount.mockResolvedValue(result)

    expect(await useAuth().deleteAccount('x')).toBe(false)
    expect(mocks.fbLogout).not.toHaveBeenCalled()
    expect(authSession.value).toEqual(session)
    expect(notify).toHaveBeenCalledWith(message, true)
  })

  it('expõe o provedor da conta', () => {
    mocks.provider.mockReturnValue('google')
    expect(useAuth().accountProvider()).toBe('google')
  })
})
