import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  auth: vi.fn(),
  reauthCredential: vi.fn(),
  reauthPopup: vi.fn(),
  credential: vi.fn(() => 'cred'),
}))

vi.mock('firebase/app', () => ({ initializeApp: mocks.initialize }))
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: mocks.credential },
  GoogleAuthProvider: class {},
  getAuth: mocks.auth,
  reauthenticateWithCredential: mocks.reauthCredential,
  reauthenticateWithPopup: mocks.reauthPopup,
  createUserWithEmailAndPassword: vi.fn(),
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}))
vi.mock('@modules/media/services/auth-client', () => ({ saveSession: vi.fn(), getAuthSession: vi.fn() }))

function user(providers: string[], email: string | null = 'ana@example.org') {
  return { email, providerData: providers.map(providerId => ({ providerId })) }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.credential.mockReturnValue('cred')
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('firebase-client — provedor e reautenticação', () => {
  it.each([
    [['password'], 'password'],
    [['google.com', 'password'], 'password'],
    [['google.com'], 'google'],
  ])('providers %j → %s', async (providers, expected) => {
    mocks.auth.mockReturnValue({ currentUser: user(providers) })
    const client = await import('../firebase-client')
    expect(client.currentAccountProvider()).toBe(expected)
  })

  it('sem usuário Firebase ou sem configuração → legacy', async () => {
    mocks.auth.mockReturnValue({ currentUser: null })
    expect((await import('../firebase-client')).currentAccountProvider()).toBe('legacy')
    vi.resetModules()
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    expect((await import('../firebase-client')).currentAccountProvider()).toBe('legacy')
  })

  it('com senha usa credencial de e-mail', async () => {
    const current = user(['password'])
    mocks.auth.mockReturnValue({ currentUser: current })
    mocks.reauthCredential.mockResolvedValue({})
    const client = await import('../firebase-client')

    expect(await client.firebaseReauthenticate('secret')).toBe('ok')
    expect(mocks.credential).toHaveBeenCalledWith('ana@example.org', 'secret')
    expect(mocks.reauthCredential).toHaveBeenCalledWith(current, 'cred')
    expect(mocks.reauthPopup).not.toHaveBeenCalled()
  })

  it('sem senha usa popup do Google', async () => {
    mocks.auth.mockReturnValue({ currentUser: user(['google.com']) })
    mocks.reauthPopup.mockResolvedValue({})
    const client = await import('../firebase-client')
    expect(await client.firebaseReauthenticate()).toBe('ok')
    expect(mocks.reauthPopup).toHaveBeenCalledOnce()
  })

  it.each(['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'])(
    '%s → wrong-password',
    async code => {
      mocks.auth.mockReturnValue({ currentUser: user(['password']) })
      mocks.reauthCredential.mockRejectedValue({ code })
      expect(await (await import('../firebase-client')).firebaseReauthenticate('x')).toBe('wrong-password')
    },
  )

  it('outro erro (popup fechado) → failed', async () => {
    mocks.auth.mockReturnValue({ currentUser: user(['google.com']) })
    mocks.reauthPopup.mockRejectedValue(new Error('closed'))
    expect(await (await import('../firebase-client')).firebaseReauthenticate()).toBe('failed')
  })

  it('sem usuário Firebase → failed', async () => {
    mocks.auth.mockReturnValue({ currentUser: null })
    expect(await (await import('../firebase-client')).firebaseReauthenticate('x')).toBe('failed')
    expect(mocks.reauthCredential).not.toHaveBeenCalled()
  })
})
