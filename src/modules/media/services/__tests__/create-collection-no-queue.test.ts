// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const enqueue = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../outbox', () => ({
  enqueue,
  newClientUuid: () => 'uuid-test',
}))

import { createCustomCollection } from '../custom-catalog'

describe('createCustomCollection sem fila', () => {
  beforeEach(() => {
    localStorage.clear()
    enqueue.mockClear()
    localStorage.setItem(
      'louvorja.custom.auth',
      JSON.stringify({
        token: 'tok',
        user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
      }),
    )
  })

  it('rede caída no import não enfileira coletânea vazia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    try {
      const created = await createCustomCollection(
        'Importações .slja',
        undefined,
        undefined,
        'private',
        { queueOffline: false },
      )
      expect(created).toBeNull()
      expect(enqueue).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
