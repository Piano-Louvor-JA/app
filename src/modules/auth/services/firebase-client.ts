/**
 * RF-002/RF-003 — Firebase Auth client (login unificado PIANO).
 *
 * Email/senha + Google, mesma identidade do APK e da ponte na API
 * (firebaseAuth middleware valida o ID token em /v1/community/*).
 *
 * Sessão compatível com auth-client: salva na MESMA chave localStorage
 * (louvorja.custom.auth) com o ID token do Firebase — o módulo community
 * continua consumindo getAuthSession()/authHeaders() sem mudança.
 */
import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type UserCredential,
} from 'firebase/auth'
import { getAuthSession, saveSession, type AuthSession } from '@modules/media/services/auth-client'

let authInstance: Auth | null = null

function getFirebaseAuth(): Auth {
  if (!authInstance) {
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
      messagingSenderId: import.meta.env
        .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
      appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
    }
    if (!config.apiKey || !config.projectId) {
      throw new Error('Firebase não configurado (VITE_FIREBASE_*)')
    }
    authInstance = getAuth(initializeApp(config))
  }
  return authInstance
}

function firebaseSessionBridgeUrl(): string | null {
  const database = import.meta.env.VITE_URL_DATABASE as string | undefined
  if (!database) return null
  try {
    const url = new URL(database)
    if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') return null
    url.pathname = '/v1/custom/auth/firebase-session'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function isValidSession(session: unknown): session is AuthSession {
  if (!session || typeof session !== 'object') return false
  const candidate = session as AuthSession
  return Boolean(candidate.token) && Number.isInteger(candidate.user?.id_user) && candidate.user.id_user > 0
}

async function persistSession(credential: UserCredential): Promise<AuthSession | null> {
  const url = firebaseSessionBridgeUrl()
  if (!url) return null
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${await credential.user.getIdToken()}` },
    })
    if (!response.ok) return null
    const session = JSON.parse(await response.text()) as unknown
    if (!isValidSession(session)) return null
    saveSession(session)
    return getAuthSession()
  } catch {
    return null
  }
}

/** Login email/senha via Firebase. Retorna a sessão ou null. */
export async function firebaseLogin(
  email: string,
  password: string,
): Promise<AuthSession | null> {
  try {
    const credential = await signInWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password,
    )
    return await persistSession(credential)
  } catch {
    return null
  }
}

/** Registro email/senha via Firebase. */
export async function firebaseRegister(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthSession | null> {
  try {
    const credential = await createUserWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password,
    )
    if (displayName) {
      await updateProfile(credential.user, { displayName })
    }
    return await persistSession(credential)
  } catch {
    return null
  }
}

/** Login com Google (popup — imune a COOP e problemas de authDomain/cookies 3rd-party).
 * Retorna a sessão direto (não recarrega a página). */
export async function firebaseLoginGoogle(): Promise<AuthSession | null> {
  try {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(getFirebaseAuth(), provider)
    // Popup fechou com sucesso — processa a credencial direto.
    return await persistSession(result)
  } catch (e) {
    console.error('[auth] firebaseLoginGoogle ERRO:', e)
    // Se popup bloqueado pelo browser, avisa o caller pra tentar redirect como fallback
    if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'auth/popup-blocked') {
      console.warn('[auth] Popup bloqueado — caller deve tentar redirect')
    }
    return null
  }
}

/** Processa o resultado do redirect (chamar no mount da app). */
export async function handleRedirectResult(): Promise<AuthSession | null> {
  try {
    console.debug('[auth] handleRedirectResult: chamando getRedirectResult')
    const result = await getRedirectResult(getFirebaseAuth())
    if (result) {
      console.debug('[auth] handleRedirectResult: got result, chamando persistSession')
      return await persistSession(result)
    }
    console.debug('[auth] handleRedirectResult: result null (sem redirect pendente)')
    return null
  } catch (e) {
    console.error('[auth] handleRedirectResult ERRO:', e)
    return null
  }
}

/** Mantém a sessão local sincronizada com Firebase após refresh de token. */
export function subscribeFirebaseSession(): (() => void) | null {
  try {
    return onAuthStateChanged(getFirebaseAuth(), async user => {
      if (!user) return
      const current = getAuthSession()
      if (!current) return
      saveSession({ ...current, token: await user.getIdToken() })
    })
  } catch {
    return null
  }
}

/** Logout Firebase + limpa sessão local. */
export async function firebaseLogout(): Promise<void> {
  try {
    await signOut(getFirebaseAuth())
  } catch {
    // best-effort
  }
  saveSession(null)
}
