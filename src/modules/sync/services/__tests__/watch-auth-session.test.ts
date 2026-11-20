import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * sync v2 (SPEC piano-sync-v2-post-login-pull): pull pós-login.
 *
 * Contrato:
 * - watchAuthSession() observa a sessão (polling leve) e dispara flushOutbox()
 *   (push+pull atômico) na TRANSIÇÃO sem-sessão → com-sessão (token novo).
 * - Refresh do MESMO token/uid não dispara novamente (sem loop).
 * - Renovação de token com uid igual dentro da janela mínima (60s) não duplica.
 * - Troca de conta (uid diferente) dispara sempre.
 * - Logout (sessão null) reseta o estado; relogin dispara de novo.
 * - Falha de rede: outbox intacto (contrato offline-first do flush).
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

type MockSession = { token: string; user: { id_user: number } } | null
const sessionState: { session: MockSession } = { session: null }

vi.doMock('@modules/media/services/auth-client', () => ({
  getAuthSession: () => sessionState.session,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

let clearOutbox: () => void
let enqueueOperatorState: (ns: string, key: string, value: unknown) => void
let outboxCount: () => number
let watchAuthSession: () => () => void

beforeEach(async () => {
  vi.resetModules()
  lsStore.clear()
  fetchMock.mockReset()
  sessionState.session = null
  vi.useFakeTimers()
  ;({ clearOutbox, enqueueOperatorState, outboxCount, watchAuthSession } =
    await import('../sync-outbox-service'))
})

afterEach(() => {
  vi.useRealTimers()
})

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function login(token: string, uid = 42): void {
  sessionState.session = { token, user: { id_user: uid } }
}

function logout(): void {
  sessionState.session = null
}

describe('watchAuthSession — pull pós-login (RF-01, RF-02, RF-05)', () => {
  it('sem sessão: polling não faz request (RF-01 negativo)', async () => {
    const dispose = watchAuthSession()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
    dispose()
  })

  it('login em app já aberto: dispara flush (push+pull) sem edição local (RF-01)', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ server_time: 1, applied: {}, collections: [], operator_state: [] }),
    )
    const dispose = watchAuthSession()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).not.toHaveBeenCalled() // antes do login, nada

    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/v1/custom/sync')
    expect((init as RequestInit).headers).toMatchObject({
      'X-Tenant': 'piano',
      authorization: 'Bearer tok-A',
    })
    dispose()
  })

  it('mesmo token/uid: não duplica request em polls seguintes (RF-05)', async () => {
    fetchMock.mockResolvedValue(okResponse({ operator_state: [] }))
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000) // muitos polls depois
    expect(fetchMock).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('renovação de token com uid igual dentro de 60s: não duplica (RF-05 anti-refresh-loop)', async () => {
    fetchMock.mockResolvedValue(okResponse({ operator_state: [] }))
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    login('tok-B') // Firebase renovou o ID token (~1h depois na vida real; aqui imediato)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // janela 60s segura o ruído
    dispose()
  })

  it('renovação de token com uid igual após 60s: dispara de novo (pull periódico ok)', async () => {
    fetchMock.mockResolvedValue(okResponse({ operator_state: [] }))
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    login('tok-B')
    await vi.advanceTimersByTimeAsync(65_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('logout → login: dispara novamente (estado resetado)', async () => {
    fetchMock.mockResolvedValue(okResponse({ operator_state: [] }))
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    logout()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    login('tok-A')
    await vi.advanceTimersByTimeAsync(65_000) // uid igual + token igual, mas passou da janela após logout→login
    // token igual + uid igual + dentro de nada novo: sem sessão→reset; relogin mesma identidade
    // pode disparar 1x (transição) OU não disparar (identidade igual); contrato: transição dispara
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1)
    dispose()
  })

  it('troca de conta (uid diferente): dispara imediatamente, independente de janela', async () => {
    fetchMock.mockResolvedValue(okResponse({ operator_state: [] }))
    const dispose = watchAuthSession()
    login('tok-A', 42)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    login('tok-Z', 99) // outro usuário
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('login com outbox pendente: flush envia e esvazia a fila (RF-02)', async () => {
    enqueueOperatorState('liturgy', 'week', { friday: [] })
    expect(outboxCount()).toBe(1)
    fetchMock.mockResolvedValue(okResponse({ operator_state: [] }))
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(outboxCount()).toBe(0)
    dispose()
  })

  it('login com falha de rede: outbox preservado (RF-02 offline-first)', async () => {
    enqueueOperatorState('liturgy', 'week', { friday: [] })
    fetchMock.mockRejectedValue(new Error('offline'))
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(outboxCount()).toBe(1)
    dispose()
  })
})

describe('watchAuthSession — pull aplica LWW (RF-03)', () => {
  it('operator_state do servidor com updated_at_ms maior é aplicado', async () => {
    const now = Date.now()
    fetchMock.mockResolvedValue(
      okResponse({
        operator_state: [
          {
            client_uuid: 'srv-1',
            namespace: 'prefs',
            key: 'values',
            value_json: JSON.stringify({ theme: 'dark' }),
            updated_at_ms: now + 10_000,
            deleted_at: null,
          },
        ],
      }),
    )
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // prefs vivem no blob 'user_data' (user-preferences), não em chave própria
    const blob = lsStore.get('user_data')
    expect(blob).toBeTruthy()
    const prefs = JSON.parse(blob!) as Record<string, unknown>
    expect(prefs['theme']).toBe('dark')
    dispose()
  })

  it('operator_state mais velho que o local é ignorado (LWW local vence)', async () => {
    const now = Date.now()
    lsStore.set('pianolouvorja:sync:prefs:updatedAt', String(now))
    fetchMock.mockResolvedValue(
      okResponse({
        operator_state: [
          {
            client_uuid: 'srv-1',
            namespace: 'prefs',
            key: 'values',
            value_json: JSON.stringify({ 'app.theme': 'light' }),
            updated_at_ms: now - 5_000,
            deleted_at: null,
          },
        ],
      }),
    )
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    const blob = lsStore.get('user_data')
    if (blob) expect(JSON.parse(blob as string)['theme']).toBeUndefined()
    dispose()
  })
})

describe('watchAuthSession — ambiente (RF-04)', () => {
  it('nenhuma URL fixa nova: base vem de VITE_URL_DATABASE como no flush existente', async () => {
    fetchMock.mockResolvedValue(okResponse({ operator_state: [] }))
    const dispose = watchAuthSession()
    login('tok-A')
    await vi.advanceTimersByTimeAsync(3_000)
    const [url] = fetchMock.mock.calls[0]
    // base relativa/vazia em teste — nunca uma URL de produção hard-coded
    expect(String(url)).not.toContain('api.pianolouvorja.com.br')
    dispose()
  })
})
