import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }))

import { deleteAccount, getAuthSession } from '../auth-client'

const SESSION_KEY = 'louvorja.custom.auth'
const session = { token: 'tok123', user: { id_user: 1, email: 'a@b.c', displayName: 'Ana' } }

function response(status: number) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status })
}

describe('auth-client deleteAccount', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('204 → ok, manda DELETE /me com Bearer e senha, e limpa a sessão', async () => {
    const fetchMock = response(204)
    vi.stubGlobal('fetch', fetchMock)

    expect(await deleteAccount('secret')).toBe('ok')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/custom\/auth\/me$/)
    expect(init.method).toBe('DELETE')
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok123', 'X-Tenant': 'piano' })
    expect(JSON.parse(init.body)).toEqual({ password: 'secret' })
    expect(getAuthSession()).toBeNull()
  })

  it('sem senha manda corpo vazio', async () => {
    const fetchMock = response(204)
    vi.stubGlobal('fetch', fetchMock)
    await deleteAccount()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({})
  })

  it.each([
    [400, 'password-required'],
    [403, 'wrong-password'],
    [401, 'unauthorized'],
    [500, 'failed'],
  ])('%s → %s e mantém a sessão', async (status, expected) => {
    vi.stubGlobal('fetch', response(status))
    expect(await deleteAccount('x')).toBe(expected)
    expect(getAuthSession()).toEqual(session)
  })

  it('erro de rede → failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await deleteAccount('x')).toBe('failed')
  })

  it('sem sessão → unauthorized sem chamar a rede', async () => {
    localStorage.removeItem(SESSION_KEY)
    const fetchMock = response(204)
    vi.stubGlobal('fetch', fetchMock)
    expect(await deleteAccount('x')).toBe('unauthorized')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
