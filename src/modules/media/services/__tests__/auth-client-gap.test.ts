// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gap-fill de auth-client.ts — sessão local, headers, register/login/logout,
 * requestPasswordReset/resetPassword. fetch stubado.
 */

import {
  getAuthSession,
  authHeaders,
  register,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  clearSession,
} from '../auth-client'

const SESSION_KEY = 'louvorja.custom.auth'
const session = {
  token: 'tok-123',
  user: { id_user: 7, email: 'a@b.c', displayName: 'Ana' },
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('getAuthSession / authHeaders', () => {
  it('sem sessão -> null e headers vazios', () => {
    expect(getAuthSession()).toBeNull()
    expect(authHeaders()).toEqual({})
  })

  it('sessão válida -> lê; headers Bearer', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    expect(getAuthSession()).toEqual(session)
    expect(authHeaders()).toEqual({ authorization: 'Bearer tok-123' })
  })

  it('JSON inválido -> null; token ausente -> null; user sem id -> null', () => {
    localStorage.setItem(SESSION_KEY, 'lixo')
    expect(getAuthSession()).toBeNull()
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't' }))
    expect(getAuthSession()).toBeNull()
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token: 't', user: { email: 'x' } }),
    )
    expect(getAuthSession()).toBeNull()
  })
})


  it('authBaseUrl respeita VITE_PALCO_API_URL', async () => {
    vi.stubEnv('VITE_PALCO_API_URL', 'https://api.example')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => session,
    })
    vi.stubGlobal('fetch', fetchMock)
    await login('a@b.c', 'pw')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/v1/custom/auth/login',
      expect.anything(),
    )
    vi.unstubAllEnvs()
  })


  it('authBaseUrl: env vazio -> fallback relativo', async () => {
    vi.stubEnv('VITE_PALCO_API_URL', '')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => session,
    })
    vi.stubGlobal('fetch', fetchMock)
    await login('a@b.c', 'pw')
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/custom/auth/login',
      expect.anything(),
    )
    vi.unstubAllEnvs()
  })

describe('register/login', () => {
  it('register ok salva sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => session,
      }),
    )
    const r = await register('a@b.c', 'pw', 'Ana')
    expect(r).toEqual(session)
    expect(getAuthSession()).toEqual(session)
  })

  it('login: !ok, sem token, rede -> null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await login('a@b.c', 'pw')).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 't' }) }),
    )
    expect(await login('a@b.c', 'pw')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await login('a@b.c', 'pw')).toBeNull()
  })
})

describe('logout', () => {
  it('com sessão: POST logout + limpa local; sem rede também limpa', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await logout()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/logout'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(getAuthSession()).toBeNull()
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    await logout()
    expect(getAuthSession()).toBeNull()
  })

  it('sem sessão: só limpa (sem fetch)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await logout()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clearSession alias limpa', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    clearSession()
    expect(getAuthSession()).toBeNull()
  })
})

describe('requestPasswordReset / resetPassword', () => {
  it('forgot: token exposto retorna; sem token -> null; !ok/rede -> null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'rt' }) }),
    )
    expect(await requestPasswordReset('a@b.c')).toBe('rt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    )
    expect(await requestPasswordReset('a@b.c')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await requestPasswordReset('a@b.c')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await requestPasswordReset('a@b.c')).toBeNull()
  })

  it('reset: ok true, !ok false, rede false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await resetPassword('rt', 'nova')).toBe(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await resetPassword('rt', 'nova')).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await resetPassword('rt', 'nova')).toBe(false)
  })
})
