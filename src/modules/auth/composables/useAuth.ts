import i18n from '@plugins/i18n'
const t = (k: string, p?: Record<string, unknown>) => i18n.global.t(k, p ?? {})
import { computed, onUnmounted, ref, type ComputedRef } from 'vue'
import {
  deleteAccount,
  getAuthSession,
  login,
  register,
  resetPassword,
  requestPasswordReset,
  type AuthSession,
} from '../../media/services/auth-client'
import {
  currentAccountProvider,
  firebaseLogin,
  firebaseLoginGoogle,
  firebaseLogout,
  firebaseReauthenticate,
  firebaseRegister,
  revalidateFirebaseSessionOnBoot,
  type AccountProvider,
  subscribeFirebaseSession,
} from '../services/firebase-client'

/**
 * useAuth — padrão web (AuthAccountDialog no header), login unificado:
 * Firebase (e-mail+senha e Google) primeiro; fallback no auth legacy da
 * API custom. Mesma chave de sessão e mesma API do web — a conta é a mesma.
 */

/** Estado reativo da sessão de autenticação. */
export const authSession = ref<AuthSession | null>(getAuthSession())

/** Notificador global (snackbar) — setado pelo AppShell ao montar. */
let notifyFn: ((message: string, isError?: boolean) => void) | null = null

export function setNotify(fn: (message: string, isError?: boolean) => void): void {
  notifyFn = fn
}

function notify(message: string, isError?: boolean): void {
  notifyFn?.(message, isError)
}

interface UseAuthReturn {
  session: typeof authSession
  isLoggedIn: ComputedRef<boolean>
  userName: ComputedRef<string>
  userEmail: ComputedRef<string>
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, displayName: string) => Promise<boolean>
  loginGoogle: () => Promise<boolean>
  logout: () => Promise<void>
  forgotPassword: (email: string) => Promise<boolean>
  resetPassword: (token: string, password: string) => Promise<boolean>
  /** Como a conta logada confirma a identidade (senha ou Google). */
  accountProvider: () => AccountProvider
  /** Exclui a conta (irreversível). Senha vazia só para conta Google. */
  deleteAccount: (password: string) => Promise<boolean>
}

export function useAuth(): UseAuthReturn {
  const session = authSession
  const isLoggedIn = computed(() => !!session.value)
  const userName = computed(() => session.value?.user.displayName ?? '')
  const userEmail = computed(() => session.value?.user.email ?? '')
  void revalidateFirebaseSessionOnBoot().then(result => {
    authSession.value = result ?? getAuthSession()
  })
  const unsubscribe = subscribeFirebaseSession()
  if (unsubscribe) onUnmounted(unsubscribe)

  async function doLogin(email: string, password: string): Promise<boolean> {
    const result = await login(email.trim(), password)
    if (result) {
      session.value = result
      notify(t('media.account.welcome', { name: result.user.displayName }))
      return true
    }
    notify('E-mail ou senha incorretos', true)
    return false
  }

  async function doRegister(email: string, password: string, displayName: string): Promise<boolean> {
    const result = await register(email.trim(), password, displayName.trim())
    if (result) {
      session.value = result
      notify(t('media.account.welcome', { name: result.user.displayName }))
      return true
    }
    notify(t('media.account.registerFailed'), true)
    return false
  }

  async function doLogout(): Promise<void> {
    await firebaseLogout()
    session.value = null
    notify(t('media.account.signedOut'))
  }

  /** Login Google (popup — retorna sessão direto). */
  async function doLoginGoogle(): Promise<boolean> {
    const result = await firebaseLoginGoogle()
    if (result) {
      session.value = result
      notify(t('media.account.welcome', { name: result.user.displayName }))
      return true
    }
    notify(t('media.account.loginFailed'), true)
    return false
  }

  /** Login unificado — Firebase primeiro, fallback no auth legacy da API. */
  async function doUnifiedLogin(email: string, password: string): Promise<boolean> {
    const fb = await firebaseLogin(email.trim(), password)
    if (fb) {
      session.value = fb
      notify(t('media.account.welcome', { name: fb.user.displayName }))
      return true
    }
    return doLogin(email, password)
  }

  /** Registro unificado (Firebase primeiro, fallback legacy). */
  async function doUnifiedRegister(email: string, password: string, displayName: string): Promise<boolean> {
    const fb = await firebaseRegister(email.trim(), password, displayName.trim())
    if (fb) {
      session.value = fb
      notify(t('media.account.welcome', { name: fb.user.displayName }))
      return true
    }
    return doRegister(email, password, displayName)
  }

  async function doForgotPassword(email: string): Promise<boolean> {
    const token = await requestPasswordReset(email.trim())
    if (token) {
      notify(t('media.account.resetTokenGenerated'))
      return true
    }
    // Resposta neutra da API: não revela se o e-mail existe.
    notify(t('media.account.resetTokenNeutral'))
    return false
  }

  async function doResetPassword(token: string, password: string): Promise<boolean> {
    const ok = await resetPassword(token.trim(), password)
    if (ok) {
      notify(t('media.account.passwordChanged'))
      return true
    }
    notify(t('media.account.tokenInvalid'), true)
    return false
  }

  /**
   * Exclusão de conta (App Store 5.1.1(v)): Firebase reautentica (senha ou
   * Google) antes; sessão legado manda a senha para a API conferir.
   */
  async function doDeleteAccount(password: string): Promise<boolean> {
    const provider = currentAccountProvider()
    if (provider !== 'legacy') {
      const reauth = await firebaseReauthenticate(provider === 'password' ? password : undefined)
      if (reauth !== 'ok') {
        notify(reauth === 'wrong-password' ? t('auth.wrongPassword') : t('auth.reauthFailed'), true)
        return false
      }
    }
    const result = await deleteAccount(provider === 'legacy' ? password : undefined)
    if (result === 'ok') {
      await firebaseLogout()
      session.value = null
      notify(t('auth.accountDeleted'))
      return true
    }
    const messages: Record<string, string> = {
      'wrong-password': t('auth.wrongPassword'),
      'password-required': t('auth.passwordRequired'),
      unauthorized: t('auth.sessionExpired'),
    }
    notify(messages[result] ?? t('auth.deleteFailed'), true)
    return false
  }

  return {
    session,
    isLoggedIn,
    userName,
    userEmail,
    login: doUnifiedLogin,
    register: doUnifiedRegister,
    loginGoogle: doLoginGoogle,
    logout: doLogout,
    forgotPassword: doForgotPassword,
    resetPassword: doResetPassword,
    accountProvider: () => currentAccountProvider(),
    deleteAccount: doDeleteAccount,
  }
}
