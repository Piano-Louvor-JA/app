/**
 * Testes do outbox (B1/B2): enfileira, sobrevive a "crash" (nova conexão),
 * flush monta SyncRequest correto e limpa fila só no sucesso.
 *
 * IndexedDB é stubado com um mini-implementador em memória (suficiente pros
 * métodos usados: open/createObjectStore/getAll/add/delete/clear/count).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOutbox,
  countPending,
  enqueue,
  flushOutbox,
  listPending,
  newClientUuid,
} from "../outbox";

type Row = Record<string, unknown> & { id?: number };
let store: Row[];
let nextId: number;

vi.stubGlobal("crypto", {
  randomUUID: () => "uuid-test-0001",
  getRandomValues: (b: Uint8Array) => b,
});

// mini-IDB em memória
class MiniReq<T> {
  ok = true;
  result: T;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(result: T) {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }
}

vi.stubGlobal("indexedDB", {
  open: () => {
    const req = new MiniReq({
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({
        createIndex: () => {},
      }),
      transaction: () => ({
        objectStore: () => ({
          add: (op: Row) => {
            op.id = nextId++;
            store.push(op);
            return new MiniReq(op.id);
          },
          getAll: () => new MiniReq([...store]),
          delete: (id: number) => {
            store = store.filter((r) => r.id !== id);
            return new MiniReq(undefined);
          },
          clear: () => {
            store = [];
            return new MiniReq(undefined);
          },
          count: () => new MiniReq(store.length),
        }),
      }),
    });
    return req;
  },
});

const baseHeaders = { authorization: "Bearer tok" };

beforeEach(() => {
  store = [];
  nextId = 1;
});

describe("newClientUuid", () => {
  it("gera uuid determinístico no ambiente de teste", () => {
    expect(newClientUuid()).toBe("uuid-test-0001");
  });
});

describe("enqueue/list/count", () => {
  it("enfileira e lista em ordem", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "upsert",
      payload: { name: "A" },
      updated_at: 1,
      owner_email: "a@t.l",
    });
    await enqueue({
      entity: "music",
      client_uuid: "m1",
      action: "upsert",
      payload: { collection_uuid: "c1", name: "M" },
      updated_at: 2,
      owner_email: "a@t.l",
    });
    expect(await countPending()).toBe(2);
    const ops = await listPending();
    expect(ops.map((o) => o.client_uuid)).toEqual(["c1", "m1"]);
  });

  it("sobrevive a 'crash' — fila vive entre chamadas (nova leitura)", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "upsert",
      payload: { name: "A" },
      updated_at: 1,
      owner_email: "a@t.l",
    });
    // simula reinício: nova leitura (stub global persiste = mesmo "disco")
    const again = await listPending();
    expect(again.length).toBe(1);
  });
});

describe("flushOutbox", () => {
  it("fila vazia: ok sem chamar rede", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await flushOutbox("https://api.test/v1/custom", baseHeaders);
    expect(r).toEqual({ ok: true, applied: 0, conflicts: 0 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("monta SyncRequest agrupado por coleção e limpa fila no 200", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "upsert",
      payload: { name: "Col A", updated_at: 100 },
      updated_at: 100,
      owner_email: "a@t.l",
    });
    await enqueue({
      entity: "music",
      client_uuid: "m1",
      action: "upsert",
      payload: { collection_uuid: "c1", name: "Mus", updated_at: 101 },
      updated_at: 101,
      owner_email: "a@t.l",
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          applied: { created: 2, updated: 0 },
          conflicts: [],
          collections: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await flushOutbox("https://api.test/v1/custom", baseHeaders);
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(2);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/v1/custom/sync");
    const body = JSON.parse(String(init.body)) as {
      collections: Array<{ client_uuid: string; musics: Array<{ client_uuid: string }> }>;
    };
    expect(body.collections.length).toBe(1);
    expect(body.collections[0].client_uuid).toBe("c1");
    expect(body.collections[0].musics[0].client_uuid).toBe("m1");

    // fila limpa
    expect(await countPending()).toBe(0);
  });

  it("anexa lyrics na música pai", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "upsert",
      payload: { name: "Col", updated_at: 100 },
      updated_at: 100,
      owner_email: "a@t.l",
    });
    await enqueue({
      entity: "music",
      client_uuid: "m1",
      action: "upsert",
      payload: { collection_uuid: "c1", name: "Mus", updated_at: 101 },
      updated_at: 101,
      owner_email: "a@t.l",
    });
    await enqueue({
      entity: "lyric",
      client_uuid: "l1",
      action: "upsert",
      payload: { music_uuid: "m1", lyric: "verso", order: 0, updated_at: 102 },
      updated_at: 102,
      owner_email: "a@t.l",
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ applied: { created: 3, updated: 0 }, conflicts: [] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await flushOutbox("https://api.test/v1/custom", baseHeaders);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      collections: Array<{ musics: Array<{ lyrics: Array<{ lyric: string }> }> }>;
    };
    expect(body.collections[0].musics[0].lyrics[0].lyric).toBe("verso");
  });

  it("401 preserva a fila (re-login sincroniza depois)", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "upsert",
      payload: { name: "A" },
      updated_at: 1,
      owner_email: "a@t.l",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    const r = await flushOutbox("https://api.test/v1/custom", baseHeaders);
    expect(r.ok).toBe(false);
    expect(await countPending()).toBe(1);
  });

  it("falha de rede preserva a fila (B2)", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "upsert",
      payload: { name: "A" },
      updated_at: 1,
      owner_email: "a@t.l",
    });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    const r = await flushOutbox("https://api.test/v1/custom", baseHeaders);
    expect(r.ok).toBe(false);
    expect(await countPending()).toBe(1);
  });

  it("delete chega como payload com deleted_at", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "delete",
      payload: { name: "A", deleted_at: 500, updated_at: 500 },
      updated_at: 500,
      owner_email: "a@t.l",
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ applied: { created: 0, updated: 1 }, conflicts: [] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await flushOutbox("https://api.test/v1/custom", baseHeaders);
    expect(r.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      collections: Array<{ deleted_at: number }>;
    };
    expect(body.collections[0].deleted_at).toBe(500);
  });
});

describe("clearOutbox", () => {
  it("limpa tudo", async () => {
    await enqueue({
      entity: "collection",
      client_uuid: "c1",
      action: "upsert",
      payload: {},
      updated_at: 1,
      owner_email: null,
    });
    await clearOutbox();
    expect(await countPending()).toBe(0);
  });
});
