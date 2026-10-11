/**
 * local-media-store — blobs de mídia local (áudio/capa de imports .slja)
 * em IndexedDB, FORA do localStorage (quota ~10 MB do Chromium).
 *
 * Bug (reproduzido): import .slja com WAV 30 MB virava base64 38 MB em
 * localStorage → QuotaExceededError engolido → só a 1ª estrofe sobrevivia.
 * localStorage fica SÓ com metadados (id da mídia, duração, nome); o bytes
 * vivem aqui (IndexedDB aguenta centenas de MB).
 *
 * API mínima sem deps: putMedia/getMedia/deleteMedia. Ids são strings
 * estáveis derivadas do hash do .slja (`slja-<hash>-audio` / `-cover`).
 */

const DB_NAME = "louvorja-media";
const DB_VERSION = 1;
const STORE = "blobs";

export type LocalMediaBlob = Blob | ArrayBuffer | Uint8Array;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Fallback em memória p/ ambientes sem IndexedDB (jsdom em testes, SSR).
 * Sem persistência real, mas mantém o contrato put→get dentro da sessão —
 * o import continua funcionando (o browser/Electron real tem IndexedDB).
 */
const memoryStore = new Map<string, Blob>();
const memoryOnly = () => typeof indexedDB === "undefined";

function openDb(): Promise<IDBDatabase> {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			if (typeof indexedDB === "undefined") {
				reject(new Error("LOCAL_MEDIA_INDEXEDDB_UNAVAILABLE"));
				return;
			}
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE)) {
					db.createObjectStore(STORE, { keyPath: "id" });
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(request.error ?? new Error("LOCAL_MEDIA_OPEN_FAILED"));
		});
	}
	return dbPromise;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("LOCAL_MEDIA_REQUEST_FAILED"));
	});
}

function toBlob(value: LocalMediaBlob): Blob {
	if (value instanceof Blob) return value;
	if (value instanceof ArrayBuffer) return new Blob([value]);
	return new Blob([value as BlobPart]);
}

/** Grava (ou sobrescreve) um blob sob a chave `id`. */
export async function putMedia(id: string, data: LocalMediaBlob): Promise<void> {
	const blob = toBlob(data);
	if (memoryOnly()) {
		memoryStore.set(id, blob);
		return;
	}
	const db = await openDb();
	const tx = db.transaction(STORE, "readwrite");
	await requestAsPromise(tx.objectStore(STORE).put({ id, blob }));
}

/** Lê um blob; null se não existir (ou IndexedDB indisponível). */
export async function getMedia(id: string): Promise<Blob | null> {
	if (memoryOnly()) return memoryStore.get(id) ?? null;
	try {
		const db = await openDb();
		const tx = db.transaction(STORE, "readonly");
		const row = await requestAsPromise<{ id: string; blob: Blob } | undefined>(
			tx.objectStore(STORE).get(id) as IDBRequest<
				{ id: string; blob: Blob } | undefined
			>,
		);
		return row?.blob ?? null;
	} catch {
		// leitura não pode derrubar o player — trata como mídia ausente
		return null;
	}
}

/** Apaga um blob (best-effort; erro não propaga). */
export async function deleteMedia(id: string): Promise<void> {
	if (memoryOnly()) {
		memoryStore.delete(id);
		return;
	}
	try {
		const db = await openDb();
		const tx = db.transaction(STORE, "readwrite");
		await requestAsPromise(tx.objectStore(STORE).delete(id));
	} catch {
		// best-effort
	}
}

/** Lê um blob e devolve objectURL pronto pra <audio>/<img>; null se ausente. */
export async function getMediaObjectUrl(id: string): Promise<string | null> {
	const blob = await getMedia(id);
	return blob ? URL.createObjectURL(blob) : null;
}
