import { ref, computed, type ComputedRef } from 'vue'
import {
  getAuthSession,
  login,
  logout,
  register,
  resetPassword,
  requestPasswordReset,
  type AuthSession,
} from '../../media/services/auth-client'
import {
  firebaseLogin,
  firebaseLoginGoogle,
  firebaseLogout,
  firebaseRegister,
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
}

export function useAuth(): UseAuthReturn {
  const session = authSession
  const isLoggedIn = computed(() => !!session.value)
  const userName = computed(() => session.value?.user.displayName ?? '')
  const userEmail = computed(() => session.value?.user.email ?? '')

  async function doLogin(email: string, password: string): Promise<boolean> {
    const result = await login(email.trim(), password)
    if (result) {
      session.value = result
      notify(`Bem-vindo, ${result.user.displayName}!`)
      return true
    }
    notify('E-mail ou senha incorretos', true)
    return false
  }

  async function doRegister(email: string, password: string, displayName: string): Promise<boolean> {
    const result = await register(email.trim(), password, displayName.trim())
    if (result) {
      session.value = result
      notify(`Bem-vindo, ${result.user.displayName}!`)
      return true
    }
    notify('Não foi possível criar a conta (e-mail já existe?)', true)
    return false
  }

  async function doLogout(): Promise<void> {
    await logout()
    await firebaseLogout()
    session.value = null
    notify('Sessão encerrada')
  }

  /** Login Google (popup — retorna sessão direto). */
  async function doLoginGoogle(): Promise<boolean> {
    const result = await firebaseLoginGoogle()
    if (result) {
      session.value = result
      notify(`Bem-vindo, ${result.user.displayName}!`)
      return true
    }
    notify('Não foi possível entrar com o Google', true)
    return false
  }

  /** Login unificado — Firebase primeiro, fallback no auth legacy da API. */
  async function doUnifiedLogin(email: string, password: string): Promise<boolean> {
    const fb = await firebaseLogin(email.trim(), password)
    if (fb) {
      session.value = fb
      notify(`Bem-vindo, ${fb.user.displayName}!`)
      return true
    }
    return doLogin(email, password)
  }

  /** Registro unificado (Firebase primeiro, fallback legacy). */
  async function doUnifiedRegister(email: string, password: string, displayName: string): Promise<boolean> {
    const fb = await firebaseRegister(email.trim(), password, displayName.trim())
    if (fb) {
      session.value = fb
      notify(`Bem-vindo, ${fb.user.displayName}!`)
      return true
    }
    return doRegister(email, password, displayName)
  }

  async function doForgotPassword(email: string): Promise<boolean> {
    const token = await requestPasswordReset(email.trim())
    if (token) {
      notify('Token gerado — confirme a senha nova')
      return true
    }
    // Resposta neutra da API: não revela se o e-mail existe.
    notify('Se o e-mail existir, o suporte tem o token de reset')
    return false
  }

  async function doResetPassword(token: string, password: string): Promise<boolean> {
    const ok = await resetPassword(token.trim(), password)
    if (ok) {
      notify('Senha alterada! Entre com a senha nova')
      return true
    }
    notify('Token inválido ou expirado', true)
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
  }
}
