// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Fake IndexedDB mínimo (cobra open/transaction/objectStore/add/getAll/put/delete/count)
type Rec = Record<string, unknown> & { id?: IDBValidKey }
class FakeReq {
  result: unknown = undefined
  error: unknown = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  onupgradeneeded: (() => void) | null = null
  _set(r: unknown) { this.result = r; setTimeout(() => this.onsuccess?.(), 0) }
  _fail(e: unknown) { this.error = e; setTimeout(() => this.onerror?.(), 0) }
}
class FakeStore {
  data = new Map<IDBValidKey, Rec>()
  index(_n: string) { return this }
  indexes = new Set<string>()
  createIndex(n: string, _p: string) { this.indexes.add(n) }
  add(op: Rec) {
    const key = (this._next++ ) as IDBValidKey
    this.data.set(key, { ...op, id: key })
    const req = new FakeReq(); req._set(key); return req
  }
  _next = 1
  put(op: Rec) {
    const key = (op.id ?? (this._next++)) as IDBValidKey
    this.data.set(key, op)
    const req = new FakeReq(); req._set(key); return req
  }
  get(k: IDBValidKey) {
    const req = new FakeReq(); req._set(this.data.get(k)); return req
  }
  getAll() {
    const req = new FakeReq(); req._set(Array.from(this.data.values())); return req
  }
  delete(k: IDBValidKey) {
    this.data.delete(k)
    const req = new FakeReq(); req._set(undefined); return req
  }
  count() {
    const req = new FakeReq(); req._set(this.data.size); return req
  }
}
class FakeDB {
  objectStoreNames = { contains: (_n: string) => this.stores.size > 0 }
  stores = new Map<string, FakeStore>()
  version = 0
  onversionchange: (() => void) | null = null
  close() { /* noop */ }
  createObjectStore(n: string, _opts: unknown) {
    const s = new FakeStore(); this.stores.set(n, s); return s
  }
  transaction(_mode: string, _stores?: string[]) {
    const store = this.stores.get('outbox') ?? this.stores.values().next().value!
    return {
      objectStore: () => store,
      oncomplete: null as (() => void) | null,
    }
  }
}
let currentDb = new FakeDB()
class FakeOpenReq extends FakeReq {}

function installFakeIDB() {
  ;(globalThis as Record<string, unknown>).indexedDB = {
    open: (_name: string, _v: number) => {
      const req = new FakeOpenReq()
      req.onupgradeneeded = null
      setTimeout(() => {
        if (!currentDb.objectStoreNames.contains('outbox')) {
          currentDb.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
        }
        req.result = currentDb // onupgradeneeded usa req.result como db
        req.onupgradeneeded?.()
        req.onsuccess?.()
      }, 0)
      return req
    },
  }
}

const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getAuthSession: vi.fn(() => null as { token: string } | null),
  authHeaders: vi.fn(() => ({})),
}))
vi.mock('../auth-client', () => ({
  getAuthSession: mocks.getAuthSession,
  authHeaders: mocks.authHeaders,
}))
vi.stubGlobal('fetch', mocks.fetchMock)

let enqueue: (op: never) => Promise<void>
let countPending: () => Promise<number>
let flushOutbox: (base: string, h?: Record<string, string>) => Promise<{ ok: boolean; sent?: number; failed?: number }>
let newClientUuid: () => string
let listPending: () => Promise<unknown[]>

async function freshOutbox() {
  vi.resetModules()
  const m = await import('../outbox')
  enqueue = m.enqueue; countPending = m.countPending
  flushOutbox = m.flushOutbox; newClientUuid = m.newClientUuid; listPending = m.listPending
}

describe('outbox — indexedDB real (fake IDB)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    currentDb = new FakeDB()
    installFakeIDB()
    await freshOutbox()
    mocks.getAuthSession.mockReturnValue(null)
    mocks.fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  })

  it('enqueue grava e countPending conta', async () => {
    await enqueue({ entity: 'collection', op: 'create', payload: { name: 'x' } } as never)
    await enqueue({ entity: 'collection', op: 'create', payload: { name: 'y' } } as never)
    expect(await countPending()).toBe(2)
  })

  it('enqueue não lança se IDB falha (erro engolido)', async () => {
    ;(globalThis as Record<string, unknown>).indexedDB = undefined
    await expect(enqueue({ entity: 'x' } as never)).resolves.toBeUndefined()
  })

  it('flushOutbox: POST /sync por coletânea e aplica resposta', async () => {
    mocks.fetchMock.mockResolvedValue(new Response(JSON.stringify({ applied: { created: 1, updated: 1 }, conflicts: [] }), { status: 200 }))
    await enqueue({ entity: 'collection', action: 'upsert', client_uuid: 'c1', payload: { name: 'x' }, updated_at: 1, owner_email: null } as never)
    await enqueue({ entity: 'music', action: 'upsert', client_uuid: 'm1', payload: { collection_uuid: 'c1' }, updated_at: 2, owner_email: null } as never)
    const res = await flushOutbox('https://api.test/v1/custom', { authorization: 'Bearer t' })
    expect(res).toEqual({ ok: true, applied: 2, conflicts: 0 })
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer t')
    expect(await countPending()).toBe(0)
  })

  it('flushOutbox com fetch falho: ok:false e fila mantida', async () => {
    mocks.fetchMock.mockRejectedValue(new Error('rede caiu'))
    await enqueue({ entity: 'collection', action: 'upsert', client_uuid: 'c1', payload: {}, updated_at: 1, owner_email: null } as never)
    const res = await flushOutbox('https://api.test/v1/custom', { authorization: 'x' })
    expect(res.ok).toBe(false)
    expect(await countPending()).toBe(1)
  })

  it('flushOutbox com resposta !ok: ok:false e fila mantida', async () => {
    mocks.fetchMock.mockResolvedValue(new Response('err', { status: 500 }))
    await enqueue({ entity: 'collection', action: 'upsert', client_uuid: 'c1', payload: {}, updated_at: 1, owner_email: null } as never)
    const res = await flushOutbox('https://api.test/v1/custom', { authorization: 'x' })
    expect(res.ok).toBe(false)
    expect(await countPending()).toBe(1)
  })

  it('flushOutbox fila vazia: ok true sem fetch', async () => {
    const res = await flushOutbox('https://api.test/v1/custom', {})
    expect(res).toEqual({ ok: true, applied: 0, conflicts: 0 })
    expect(mocks.fetchMock).not.toHaveBeenCalled()
  })

  it('newClientUuid: formato uuid v4', () => {
    const u = newClientUuid()
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('upgrade: store já existente não recria (branch contains)', async () => {
    // 2º openDb no MESMO db fake: contains retorna true → pula createObjectStore
    currentDb.stores.set('outbox', new FakeStore()) // store já existe de upgrade anterior
    currentDb.objectStoreNames.contains = () => true
    await enqueue({ entity: 'collection', action: 'upsert', client_uuid: 'c1', payload: {}, updated_at: 1, owner_email: null } as never)
    expect(await countPending()).toBe(1)
  })

  it('open com erro: enqueue engole (catch)', async () => {
    ;(globalThis as Record<string, unknown>).indexedDB = {
      open: () => {
        const req: Record<string, unknown> = { result: undefined, error: new Error('boom') }
        setTimeout(() => req.onerror?.(), 0)
        return req
      },
    }
    await freshOutbox()
    await expect(enqueue({ entity: 'x' } as never)).resolves.toBeUndefined()
  })

  it('tx com erro na request: listPending catch → []', async () => {
    await enqueue({ entity: 'collection', action: 'upsert', client_uuid: 'c1', payload: {}, updated_at: 1, owner_email: null } as never)
    // corromper o store pra forçar erro no getAll
    const store = (currentDb as unknown as { stores: Map<string, { getAll: () => unknown }> }).stores.get('outbox')!
    store.getAll = () => { const r: Record<string, unknown> = {}; setTimeout(() => { r.error = new Error('tx fail'); r.onerror?.() }, 0); return r }
    expect(await listPending()).toEqual([])
  })

  it('countPending com erro: 0', async () => {
    ;(globalThis as Record<string, unknown>).indexedDB = undefined
    await freshOutbox()
    expect(await countPending()).toBe(0)
  })

  it('newClientUuid fallback: sem randomUUID usa getRandomValues', () => {
    const orig = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: (b: Uint8Array) => { b.fill(7); return b } },
      configurable: true,
    })
    const u = newClientUuid()
    Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true })
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('tx request com erro: enqueue engole (req.onerror)', async () => {
    // store.add que falha
    currentDb.stores.set('outbox', new FakeStore())
    const store = currentDb.stores.get('outbox')!
    store.add = () => { const r: Record<string, unknown> = {}; setTimeout(() => { r.error = new Error('add fail'); r.onerror?.() }, 0); return r }
    await expect(enqueue({ entity: 'x' } as never)).resolves.toBeUndefined()
  })

  it('flushOutbox: lyric sem música pai vai no grupo do próprio uuid', async () => {
    mocks.fetchMock.mockResolvedValue(new Response(JSON.stringify({ applied: { created: 0, updated: 0 }, conflicts: [] }), { status: 200 }))
    await enqueue({ entity: 'lyric', action: 'upsert', client_uuid: 'l1', payload: { music_uuid: 'desconhecida' }, updated_at: 1, owner_email: null } as never)
    const res = await flushOutbox('https://api.test/v1/custom', { authorization: 'x' })
    expect(res.ok).toBe(true)
  })
  it('upgrade com db vazio: cria store e índices no onupgradeneeded', async () => {
    // db SEM store: o harness pré-criaria; interceptar contains pra ele "ver" que
    // já existe e o handler do módulo ENXERGAR o contrário → s43-48 executa.
    currentDb = new FakeDB()
    let fakeContains = true // harness vê true (não pré-cria); módulo vê false
    const origContains = currentDb.objectStoreNames.contains
    ;(currentDb.objectStoreNames as { contains: (n: string) => boolean }).contains = (n: string) =>
      fakeContains ? origContains.call(currentDb.objectStoreNames, n) : fakeContains
    // primeira checagem (harness): true-ish via origContains → stores vazio = false...
    // simplificar: fakeContains controla a resposta crua
    ;(currentDb.objectStoreNames as { contains: (n: string) => boolean }).contains = () => fakeContains
    ;(globalThis as Record<string, unknown>).indexedDB = {
      open: (_name: string, _v: number) => {
        const req = new FakeOpenReq()
        req.onupgradeneeded = null
        setTimeout(() => {
          const firstOpen = currentDb.stores.size === 0
          fakeContains = !firstOpen // 1ª abertura: contains false → módulo cria store
          req.result = currentDb
          req.onupgradeneeded?.()
          req.onsuccess?.()
          fakeContains = true // aberturas seguintes: store já existe de verdade
        }, 0)
        return req
      },
    }
    vi.resetModules()
    const m = await import('../outbox')
    await m.enqueue({ entity: 'lyric', payload: { music_uuid: 'm1' } } as never)
    await new Promise((r) => setTimeout(r, 10))
    expect(currentDb.stores.has('operations')).toBe(true)
    const store = currentDb.stores.get('operations') as unknown as { indexes: Set<string> }
    expect(store.indexes.has('client_uuid')).toBe(true)
    expect(store.indexes.has('entity')).toBe(true)
    expect(await m.countPending()).toBe(1)
  })

})