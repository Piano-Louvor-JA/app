import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAuthSession,
  getAuthSession,
  login,
  logout,
  register,
  type AuthSession,
} from '../auth-client'

const SESSION_KEY = 'louvorja.custom.auth'

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('auth-client', () => {
  beforeEach(() => {
    // Vitest 4 (node env): localStorage não existe — usar stub do jsdom-less
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('register guarda token + user no localStorage', async () => {
    const fetchMock = mockFetchOnce(201, {
      token: 'tok123',
      user: { id_user: 1, email: 'a@b.c', displayName: 'Rafael' },
    })
    vi.stubGlobal('fetch', fetchMock)

    const session = await register('a@b.c', 'senha123', 'Rafael')
    expect(session).toEqual({
      token: 'tok123',
      user: { id_user: 1, email: 'a@b.c', displayName: 'Rafael' },
    })
    expect(getAuthSession()).toEqual(session)
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')).toEqual(session)
  })

  it('login guarda sessão', async () => {
    const fetchMock = mockFetchOnce(200, {
      token: 'tok456',
      user: { id_user: 2, email: 'x@y.z', displayName: 'Elias' },
    })
    vi.stubGlobal('fetch', fetchMock)

    const session = await login('x@y.z', 'senha')
    expect(session?.token).toBe('tok456')
    expect(getAuthSession()?.user.displayName).toBe('Elias')
  })

  it('login com credencial errada retorna null e não guarda nada', async () => {
    const fetchMock = mockFetchOnce(401, { error: 'E-mail ou senha incorretos' })
    vi.stubGlobal('fetch', fetchMock)

    const session = await login('x@y.z', 'errada')
    expect(session).toBeNull()
    expect(getAuthSession()).toBeNull()
  })

  it('logout limpa sessão', async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        token: 'tok',
        user: { id_user: 1, email: 'a@b.c', displayName: 'R' },
      } satisfies AuthSession),
    )
    vi.stubGlobal('fetch', mockFetchOnce(204, undefined))

    await logout()
    expect(getAuthSession()).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it.each([0, -1, '0', 'abc', undefined])('placeholder id_user=%j é removido e não autentica', id_user => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'tok', user: { id_user, email: 'a@b.c', displayName: 'Rafael' } }))
    expect(getAuthSession()).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('token corrompido no localStorage = sessão nula', () => {
    localStorage.setItem(SESSION_KEY, '{{{')
    expect(getAuthSession()).toBeNull()
  })
})
