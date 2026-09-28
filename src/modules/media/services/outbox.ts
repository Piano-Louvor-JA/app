/**
 * Outbox — fila de operações pendentes de sync (offline-first, B1/B2 da BARRA).
 *
 * Modelo: quando autenticado e a API está inalcançável, as operações de
 * escrita (criar/atualizar/deletar coletânea, música, letra) são enfileiradas
 * em IndexedDB e aplicadas via POST /v1/custom/sync quando a conexão volta
 * ou no próximo login (spec: crash do processo não perde a fila).
 *
 * LWW client-side: cada operação carrega updated_at no momento da ação.
 * O servidor resolve conflito por updated_at_ms (spec SYNC_API.md).
 *
 * Persistência: IndexedDB (não localStorage) — sobrevive a crash, é
 * assíncrono e aguenta payloads grandes (letras completas).
 */

const DB_NAME = "louvorja-outbox";
const DB_VERSION = 1;
const STORE = "operations";

export type OutboxOp = {
  /** autoincrement */
  id?: number;
  /** tipo de entidade */
  entity: "collection" | "music" | "lyric";
  /** client_uuid da entidade (identidade estável, gerado no client) */
  client_uuid: string;
  /** criação/atualização/delete lógico */
  action: "upsert" | "delete";
  /** payload no formato do SyncRequest (collection/music/lyric shape) */
  payload: Record<string, unknown>;
  /** epoch ms da ação local */
  updated_at: number;
  /** sessão na hora da ação (pra sync no login de outra conta falhar cedo) */
  owner_email: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("client_uuid", "client_uuid");
        store.createIndex("entity", "entity");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/** uuid v4 (crypto disponível em browser e Electron renderer). */
export function newClientUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // fallback (navegadores sem randomUUID): RFC4122 v4 via getRandomValues
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Enfileira operação. Nunca lança — falha de fila não pode quebrar o UX. */
export async function enqueue(
  op: Omit<OutboxOp, "id">,
): Promise<void> {
  try {
    await tx("readwrite", (s) => s.add(op) as IDBRequest<IDBValidKey>);
  } catch (err) {
    console.error("[outbox] enqueue falhou", err);
  }
}

/** Toda a fila, em ordem de chegada. */
export async function listPending(): Promise<OutboxOp[]> {
  try {
    const all = await tx<OutboxOp[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  } catch {
    return [];
  }
}

export async function countPending(): Promise<number> {
  try {
    return await tx<number>("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

async function removeOp(id: number): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

/** Converte a fila em payload SyncRequest e faz POST /v1/custom/sync. */
export async function flushOutbox(
  apiBase: string,
  authHeaders: Record<string, string>,
): Promise<{ ok: boolean; applied?: number; conflicts?: number }> {
  const ops = await listPending();
  if (ops.length === 0) return { ok: true, applied: 0, conflicts: 0 };

  // agrupa por collection (o contrato do sync é por coletânea).
  // Passada 1: indexa music uuid → collection uuid (pra resolver lyric órfã).
  // Passada 2: cada op cai no grupo da sua coletânea.
  const musicToCollection = new Map<string, string>();
  for (const op of ops) {
    if (op.entity === "music") {
      musicToCollection.set(
        op.client_uuid,
        String(op.payload.collection_uuid ?? ""),
      );
    }
  }
  const byCollection = new Map<string, OutboxOp[]>();
  const groupFor = (op: OutboxOp): string => {
    if (op.entity === "collection") return op.client_uuid;
    if (op.payload.collection_uuid) return String(op.payload.collection_uuid);
    if (op.entity === "lyric") {
      const parent = String(op.payload.music_uuid ?? "");
      return musicToCollection.get(parent) ?? parent;
    }
    return op.client_uuid;
  };
  for (const op of ops) {
    const key = groupFor(op);
    const arr = byCollection.get(key) ?? [];
    arr.push(op);
    byCollection.set(key, arr);
  }

  const collections = [...byCollection.values()].map((group) => {
    const colOp = group.find((o) => o.entity === "collection");
    const musics = group
      .filter((o) => o.entity === "music")
      .map((o) => ({
        client_uuid: o.client_uuid,
        ...o.payload,
        lyrics: (o.payload.lyrics as unknown[]) ?? [],
      }));
    // lyrics vão dentro da música — reanexa do payload da música
    for (const op of group.filter((o) => o.entity === "lyric")) {
      const parentUuid = String(op.payload.music_uuid ?? "");
      const parent = musics.find((m) => m.client_uuid === parentUuid);
      if (parent) {
        parent.lyrics = [
          ...(parent.lyrics as Record<string, unknown>[]),
          op.payload,
        ];
      }
    }
    return {
      client_uuid: colOp?.client_uuid ?? String(group[0].payload.collection_uuid),
      ...(colOp?.payload ?? {}),
      musics,
    };
  });

  try {
    const res = await fetch(`${apiBase}/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ last_sync_at: 0, collections }),
    });
    if (res.status === 401) {
      // sessão expirou — fila preservada pro re-login
      return { ok: false };
    }
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as {
      applied: { created: number; updated: number };
      conflicts: unknown[];
    };
    // sucesso: limpa a fila inteira (o servidor é a fonte da verdade agora;
    // próximos syncs pull o estado canônico)
    for (const op of ops) {
      if (op.id !== undefined) await removeOp(op.id);
    }
    return {
      ok: true,
      applied: body.applied.created + body.applied.updated,
      conflicts: body.conflicts.length,
    };
  } catch {
    return { ok: false }; // rede caiu — fila preservada
  }
}

/** Limpa a fila (uso: logout de conta diferente, dev tools). */
export async function clearOutbox(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear() as unknown as IDBRequest<undefined>);
  } catch {
    /* silencioso */
  }
}
