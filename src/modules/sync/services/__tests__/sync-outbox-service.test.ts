import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * sync v2 fase 2 (app#336): outbox do estado do operador.
 *
 * Contrato offline-first:
 * - enqueue grava LOCAL primeiro (persistente, sobrevive a reload/kill)
 * - flush em batch POST /v1/custom/sync com Bearer da sessão
 * - coalescing: mesma namespace+key vira 1 item (última escrita)
 * - sem sessão real (id_user=0/placeholder) → outbox enfileira mas NÃO envia
 * - falha de rede → itens voltam pra fila (nada se perde)
 * - resposta aplica pull: operator_state do servidor atualiza o local
 */

// localStorage mock (jsdom tem, mas isolamos pra determinismo)
const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

// sessão mockável
const sessionState = { token: null as string | null }
vi.doMock('@modules/media/services/auth-client', () => ({
  getAuthSession: () =>
    sessionState.token
      ? { token: sessionState.token, user: { id_user: 42, displayName: 'R', email: 'r@x' } }
      : null,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

let clearOutbox: () => void
let enqueueOperatorState: (ns: string, key: string, value: unknown) => void
let flushOutbox: () => Promise<{ operator_state: unknown[] } | null>
let outboxCount: () => number

beforeAll(async () => {
  ;({ clearOutbox, enqueueOperatorState, flushOutbox, outboxCount } =
    await import('../sync-outbox-service'))
})

describe('outbox do estado do operador (sync v2 fase 2)', () => {
  beforeEach(() => {
    lsStore.clear()
    fetchMock.mockReset()
    sessionState.token = null
    clearOutbox()
  })

  it('enqueue sem rede: grava persistente e NÃO envia sem sessão', async () => {
    enqueueOperatorState('liturgy', 'week', { friday: [] })
    expect(outboxCount()).toBe(1)
    expect(lsStore.get('pianolouvorja:sync:outbox')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('coalescing: mesma namespace+key mantém só a última escrita', async () => {
    enqueueOperatorState('liturgy', 'week', { v: 1 })
    enqueueOperatorState('liturgy', 'week', { v: 2 })
    expect(outboxCount()).toBe(1)
  })

  it('flush com sessão: POST batch pro /sync com Bearer', async () => {
    sessionState.token = 'tok-123'
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ server_time: 1, applied: { created: 1, updated: 0 }, collections: [], operator_state: [] }), { status: 200 }),
    )
    enqueueOperatorState('liturgy', 'week', { friday: [] })
    await flushOutbox()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/v1/custom/sync')
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer tok-123',
    })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.operator_state).toHaveLength(1)
    expect(body.operator_state[0]).toMatchObject({
      namespace: 'liturgy',
      key: 'week',
    })
    // enviou → fila esvazia
    expect(outboxCount()).toBe(0)
  })

  it('falha de rede: itens permanecem na fila (nada se perde)', async () => {
    sessionState.token = 'tok-123'
    fetchMock.mockRejectedValue(new Error('offline'))
    enqueueOperatorState('prefs', 'ui', { zoom: 1 })
    await flushOutbox()
    expect(outboxCount()).toBe(1)
  })

  it('placeholder (sem token real): flush não envia', async () => {
    enqueueOperatorState('liturgy', 'week', {})
    await flushOutbox()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(outboxCount()).toBe(1)
  })
})
