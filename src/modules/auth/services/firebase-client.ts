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
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
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

function toSession(credential: UserCredential): AuthSession {
  const user = credential.user
  return {
    token: '', // preenchido abaixo (idToken é assíncrono)
    user: {
      id_user: 0, // id real vem do upsert na API; 0 = placeholder pós-login
      email: user.email ?? '',
      displayName: user.displayName ?? (user.email ?? '').split('@')[0],
    },
  }
}

async function persistSession(credential: UserCredential): Promise<AuthSession | null> {
  const idToken = await credential.user.getIdToken()
  // Bridge: troca o Firebase ID token por sessão com id_user real
  // (POST /v1/custom/auth/firebase-session — middleware firebaseAuth valida
  // via Admin SDK e faz upsert em custom_users).
  try {
    // Produção: URL absoluta da API (VITE_URL_DATABASE). URL relativa só
    // funciona em dev (proxy do Vite) — no deploy o host do web não tem /v1.
    const base = (import.meta.env.VITE_URL_DATABASE as string | undefined)?.replace(/\/+$/, '').replace(/\/json_db$/, '') ?? ''
    const url = `${base}/v1/custom/auth/firebase-session`
      const response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${idToken}` },
      })
      console.debug('[auth] persistSession: API response status:', response.status)
      const respText = await response.text()
      console.debug('[auth] persistSession: API response body:', respText)
      if (response.ok) {
        const json = JSON.parse(respText) as AuthSession
        if (json?.token && json?.user?.id_user) {
          saveSession(json)
          return getAuthSession()
        }
      }
    } catch (e) {
      // API indisponível → cai no fallback local abaixo
      console.warn('[auth] persistSession: API falhou, fallback placeholder:', e)
    }
    // Fallback local (API offline): sessão placeholder sem id_user —
    // getAuthSession() vai rejeitar, mas não corrompe o storage.
    const session = toSession(credential)
    session.token = idToken
    saveSession(session)
    console.warn('[auth] persistSession: FALLBACK placeholder salvo (id_user=0)')
    return getAuthSession()
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

/** Logout Firebase + limpa sessão local. */
export async function firebaseLogout(): Promise<void> {
  try {
    await signOut(getFirebaseAuth())
  } catch {
    // best-effort
  }
  saveSession(null)
}
