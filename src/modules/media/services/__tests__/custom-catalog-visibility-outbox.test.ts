// @vitest-environment jsdom
// F2 (t_8e652bfe): enqueue offline de createCustomCollection omite visibility.
// O POST online manda visibility:'private' (decisão t_35e4d3ea), mas o enqueue
// offline não inclui — flushOutbox espalha o payload literal e a coleção
// privada sincronizada offline sobe SEM visibility → default da API 'public'
// = vaza pra comunidade.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(() => null as null | { token: string }),
}))

vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: mocks.getSession,
  authHeaders: (token: string | null | undefined = mocks.getSession()?.token) =>
    token ? { Authorization: `Bearer ${token}` } : {},
}))

const enqueue = vi.fn(async (_op?: unknown) => {})
vi.mock('@modules/media/services/outbox', () => ({
  enqueue: (...a: unknown[]) => enqueue(...a),
  newClientUuid: vi.fn(() => 'test-uuid'),
}))

import { createCustomCollection } from '../custom-catalog'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.getSession.mockReturnValue({ token: 'tok' } as never)
})

describe('createCustomCollection — F2 visibility no enqueue offline (t_8e652bfe)', () => {
  it('offline autenticado SEM visibility explícita: enqueue inclui visibility "private"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch (offline)')
      }),
    )
    await createCustomCollection('Privada offline')
    expect(enqueue).toHaveBeenCalledTimes(1)
    const op = enqueue.mock.calls[0]![0] as unknown as {
      payload: Record<string, unknown>
    }
    expect('visibility' in op.payload).toBe(true)
    expect(op.payload.visibility).toBe('private')
  })

  it('offline autenticado COM visibility "public": enqueue carrega "public"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch (offline)')
      }),
    )
    await createCustomCollection('Pública offline', undefined, undefined, 'public')
    const op = enqueue.mock.calls[0]![0] as unknown as {
      payload: Record<string, unknown>
    }
    expect(op.payload.visibility).toBe('public')
  })
})
