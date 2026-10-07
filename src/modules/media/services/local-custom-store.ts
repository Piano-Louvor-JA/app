/**
 * LocalCustomStore — CRUD de coletâneas/músicas/estrofes SEM autenticação.
 *
 * Regra de produto (Rafael, 12/09): não autenticado PODE criar, mas fica
 * só local (localStorage, ids negativos) — sem identidade não há escrita
 * confiável na API. Autenticado sobe pra API (custom-catalog.ts).
 *
 * IDs negativos colidem com nada: API usa autoincrement positivo, o
 * namespace de exibição (offset 1M/2M) soma por cima — negativo+offset
 * continua negativo, então o dispatcher consegue distinguir local de API.
 *
 * Upload de mídia (áudio/imagem) NÃO é suportado local — precisa da API
 * para servir o arquivo. O editor desabilita upload no modo local.
 */

const STORAGE_KEY = "louvorja.local-custom.v1";

export type LocalLyric = {
	id: number;
	lyric: string;
	aux_lyric?: string | null;
	image_url?: string | null;
	image_position?: string | null;
	time?: string | null;
	instrumental_time?: string | null;
	show_slide?: boolean | number;
	order: number;
};

export type LocalMusic = {
	id: number;
	collectionId: number;
	name: string;
	audio_url?: string | null;
	image_url?: string | null;
	officialMusicId?: number | null;
	lyrics: LocalLyric[];
	/** bytes de áudio local (base64) — toca no browser, não sobe */
	audioBase64?: string | null;
	audioName?: string | null;
	/** Duração conhecida/estimada (ms) — p.ex. import .slja (app#331). */
	durationMs?: number | null;
};

export type LocalCollection = {
	id: number;
	name: string;
	description?: string | null;
	createdAt: string;
};

type LocalDb = {
	nextCollectionId: number; // negativo, decrementa
	nextMusicId: number;
	nextLyricId: number;
	collections: LocalCollection[];
	musics: LocalMusic[];
};

function emptyDb(): LocalDb {
	return {
		nextCollectionId: -1,
		nextMusicId: -1,
		nextLyricId: -1,
		collections: [],
		musics: [],
	};
}

export function isLocalId(id: number | string | null | undefined): boolean {
	const n = Number(id);
	return Number.isFinite(n) && n < 0;
}

function loadDb(): LocalDb {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return emptyDb();
		const parsed = JSON.parse(raw) as LocalDb;
		if (!parsed || typeof parsed !== "object") return emptyDb();
		return {
			nextCollectionId: parsed.nextCollectionId ?? -1,
			nextMusicId: parsed.nextMusicId ?? -1,
			nextLyricId: parsed.nextLyricId ?? -1,
			collections: Array.isArray(parsed.collections) ? parsed.collections : [],
			musics: Array.isArray(parsed.musics) ? parsed.musics : [],
		};
	} catch {
		return emptyDb();
	}
}

function saveDb(db: LocalDb): boolean {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
		return true;
	} catch {
		// quota (áudio base64 grande) — o caller decide se o import falhou
		return false;
	}
}

/* ---------- Coletâneas ---------- */

export function listLocalCollections(): LocalCollection[] {
	return loadDb().collections;
}

export function getLocalCollection(id: number): LocalCollection | null {
	return loadDb().collections.find((c) => c.id === id) ?? null;
}

export function createLocalCollection(
	name: string,
	description?: string,
): LocalCollection {
	const db = loadDb();
	const collection: LocalCollection = {
		id: db.nextCollectionId,
		name,
		description: description ?? null,
		createdAt: new Date().toISOString(),
	};
	db.nextCollectionId -= 1;
	db.collections.push(collection);
	saveDb(db);
	return collection;
}

export function updateLocalCollection(
	id: number,
	patch: { name?: string; description?: string | null },
): boolean {
	const db = loadDb();
	const collection = db.collections.find((c) => c.id === id);
	if (!collection) return false;
	if (patch.name != null) collection.name = patch.name;
	if (patch.description !== undefined)
		collection.description = patch.description;
	saveDb(db);
	return true;
}

/** true se excluiu (e as músicas da coletânea junto). */
export function deleteLocalCollection(id: number): boolean {
	const db = loadDb();
	const before = db.collections.length;
	db.collections = db.collections.filter((c) => c.id !== id);
	db.musics = db.musics.filter((m) => m.collectionId !== id);
	saveDb(db);
	return db.collections.length < before;
}

/* ---------- Músicas ---------- */

export function listLocalMusics(collectionId: number): LocalMusic[] {
	return loadDb().musics.filter((m) => m.collectionId === collectionId);
}

export function getLocalMusic(id: number): LocalMusic | null {
	return loadDb().musics.find((m) => m.id === id) ?? null;
}

export function createLocalMusic(
	collectionId: number,
	input: { name?: string; lyric?: string; officialMusicId?: number },
): LocalMusic {
	const db = loadDb();
	const music: LocalMusic = {
		id: db.nextMusicId,
		collectionId,
		name: input.name ?? "",
		officialMusicId: input.officialMusicId ?? null,
		lyrics: [],
	};
	db.nextMusicId -= 1;
	db.musics.push(music);
	// letra inicial junto (contrato do editor: cria música + 1ª estrofe)
	if (input.lyric) {
		music.lyrics.push({
			id: db.nextLyricId,
			lyric: input.lyric,
			order: 1,
			show_slide: true,
		});
		db.nextLyricId -= 1;
	}
	saveDb(db);
	return music;
}

export function updateLocalMusic(
	id: number,
	patch: {
		name?: string;
		audioBase64?: string | null;
		audioName?: string | null;
		durationMs?: number | null;
	},
): boolean {
	const db = loadDb();
	const music = db.musics.find((m) => m.id === id);
	if (!music) return false;
	if (patch.name != null) music.name = patch.name;
	if (patch.audioBase64 !== undefined) music.audioBase64 = patch.audioBase64;
	if (patch.audioName !== undefined) music.audioName = patch.audioName;
	if (patch.durationMs !== undefined) music.durationMs = patch.durationMs;
	return saveDb(db);
}

export function deleteLocalMusic(id: number): boolean {
	const db = loadDb();
	const before = db.musics.length;
	db.musics = db.musics.filter((m) => m.id !== id);
	saveDb(db);
	return db.musics.length < before;
}

/* ---------- Estrofes (lyrics) ---------- */

export function createLocalLyric(
	musicId: number,
	input: { lyric: string; aux_lyric?: string; time?: string; order?: number },
): LocalLyric {
	const db = loadDb();
	const music = db.musics.find((m) => m.id === musicId);
	if (!music) throw new Error("local-music-missing");
	const order = input.order ?? music.lyrics.length + 1;
	const lyric: LocalLyric = {
		id: db.nextLyricId,
		lyric: input.lyric,
		aux_lyric: input.aux_lyric ?? null,
		time: input.time ?? null,
		order,
		show_slide: true,
	};
	db.nextLyricId -= 1;
	music.lyrics.push(lyric);
	music.lyrics.sort((a, b) => a.order - b.order);
	if (!saveDb(db)) {
		throw new Error("local-persist-failed");
	}
	return lyric;
}

export function updateLocalLyric(
	lyricId: number,
	patch: { lyric?: string; aux_lyric?: string; time?: string; order?: number },
): boolean {
	const db = loadDb();
	for (const music of db.musics) {
		const lyric = music.lyrics.find((l) => l.id === lyricId);
		if (!lyric) continue;
		if (patch.lyric != null) lyric.lyric = patch.lyric;
		if (patch.aux_lyric !== undefined) lyric.aux_lyric = patch.aux_lyric;
		if (patch.time !== undefined) lyric.time = patch.time;
		if (patch.order != null) lyric.order = patch.order;
		music.lyrics.sort((a, b) => a.order - b.order);
		saveDb(db);
		return true;
	}
	return false;
}

export function deleteLocalLyric(lyricId: number): boolean {
	const db = loadDb();
	for (const music of db.musics) {
		const before = music.lyrics.length;
		music.lyrics = music.lyrics.filter((l) => l.id !== lyricId);
		if (music.lyrics.length < before) {
			saveDb(db);
			return true;
		}
	}
	return false;
}
