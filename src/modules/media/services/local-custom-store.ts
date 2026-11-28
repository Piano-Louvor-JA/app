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
	/** Id de blob de fundo no IndexedDB (offline, sem quota do localStorage). */
	imageMediaId?: string | null;
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
	/** bytes de áudio local (base64) — LEGACY préIndexedDB; novos imports
	 * usam audioMediaId (blob em IndexedDB, local-media-store). */
	audioBase64?: string | null;
	audioName?: string | null;
	/** Id do blob de áudio em IndexedDB (local-media-store) — caminho novo. */
	audioMediaId?: string | null;
	/** Id do blob da capa em IndexedDB — capa 1× por música, não por estrofe. */
	coverMediaId?: string | null;
	/** Id do blob do BG 16:9 (projeção, ex: 1º asset do .slja) — DISTINTO da
	 * cover quadrada; definir cover nunca substitui o BG (regra Rafael). */
	backgroundMediaId?: string | null;
	/** Duração conhecida/estimada (ms) — p.ex. import .slja (app#331). */
	durationMs?: number | null;
	/** SHA-256 do arquivo de origem — dedupe de re-import/migração (app#336). */
	sljaHash?: string | null;
	/** Estado de trabalho (SPEC t_deed74b5): 'draft' = em andamento (nunca
	 * sobe pra rede sem publicar); 'published' = publicado/legado. */
	status?: "draft" | "published";
};

export type CollectionOrigin = {
	/** 'community' = cópia da aba Comunidade (SPEC louvorja-community-copies). */
	type: "community";
	/** id_collection remota original (positivo, API custom). */
	collectionId: number;
	copiedAt: string;
};

/** Alias retrocompatível com código/testes da PR que usavam LocalCollectionOrigin. */
export type LocalCollectionOrigin = CollectionOrigin;

export type LocalCollection = {
	id: number;
	name: string;
	description?: string | null;
	createdAt: string;
	/** Id do blob de capa em IndexedDB (local-media-store) — cover 1× por coletânea. */
	coverMediaId?: string | null;
	/** SPEC-louvorja-community-copies D1: ausência/null = manual. */
	origin?: CollectionOrigin | null;
};

export type LocalDb = {
	nextCollectionId: number; // negativo, decrementa
	nextMusicId: number;
	nextLyricId: number;
	collections: LocalCollection[];
	musics: LocalMusic[];
};

export function emptyDb(): LocalDb {
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
			collections: Array.isArray(parsed.collections)
			? parsed.collections.map((c) => ({ ...c, origin: c.origin ?? null }))
			: [],
			// Migração draft (SPEC t_deed74b5): registro legado sem status
			// = já existia antes = tratado como publicado. O primeiro saveDb
			// persiste o campo (roundtrip: migrado sobrevive a reload).
			musics: Array.isArray(parsed.musics)
				? parsed.musics.map((m) => {
						let next = { ...m, status: m.status ?? "published" };
						// Migração BG×cover (regra Rafael): import .slja legado gravava
						// o BG 16:9 em coverMediaId. O blob segue em slja-<hash>-cover
						// (IndexedDB) mesmo depois de o editor definir uma capa — a
						// música guarda sljaHash, então o BG é reativo SEM reimport.
						if (next.backgroundMediaId === undefined && next.sljaHash) {
							next = {
								...next,
								backgroundMediaId: next.coverMediaId?.startsWith("slja-")
									? next.coverMediaId
									: `slja-${next.sljaHash}-cover`,
							};
						}
						return next;
					})
				: [],
		};
	} catch {
		return emptyDb();
	}
}

export function loadLocalDb(): LocalDb {
	return loadDb();
}

export function replaceLocalDb(next: LocalDb): boolean {
	return saveDb(next);
}

function saveDb(db: LocalDb): boolean {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
		try {
			localStorage.setItem("sync.modified.v1.mediaCustomCatalog", new Date().toISOString());
		} catch { /* O catálogo já foi persistido; falta de espaço no timestamp não o invalida. */ }
		return true;
	} catch {
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
	origin?: CollectionOrigin,
): LocalCollection {
	const db = loadDb();
	const collection: LocalCollection = {
		id: db.nextCollectionId,
		name,
		description: description ?? null,
		createdAt: new Date().toISOString(),
		origin: origin ?? null,
	};
	db.nextCollectionId -= 1;
	db.collections.push(collection);
	saveDb(db);
	return collection;
}

export function updateLocalCollection(
	id: number,
	patch: { name?: string; description?: string | null; coverMediaId?: string | null },
): boolean {
	const db = loadDb();
	const collection = db.collections.find((c) => c.id === id);
	if (!collection) return false;
	if (patch.name != null) collection.name = patch.name;
	if (patch.description !== undefined)
		collection.description = patch.description;
	if (patch.coverMediaId !== undefined) collection.coverMediaId = patch.coverMediaId;
	saveDb(db);
	return true;
}

/** Exclui a coletânea; músicas MIGRAM para a coletânea "Singles" (SPEC
 * editor-ux-v2: toda música é single a menos que esteja numa coletânea). */
export function deleteLocalCollection(id: number): boolean {
	const db = loadDb();
	const before = db.collections.length;
	db.collections = db.collections.filter((c) => c.id !== id);
	if (db.collections.length === before) return false;
	// SPEC editor-ux: músicas órfãs vão para "Singles" (não apaga o conteúdo).
	if (db.musics.some((m) => m.collectionId === id)) {
		let singles = db.collections.find((c) => c.name === "Singles");
		if (!singles) {
			singles = {
				id: db.nextCollectionId,
				name: "Singles",
				description: null,
				createdAt: new Date().toISOString(),
				origin: null,
			};
			db.nextCollectionId -= 1;
			db.collections.push(singles);
		}
		for (const music of db.musics) {
			if (music.collectionId === id) music.collectionId = singles.id;
		}
	}
	saveDb(db);
	return true;
}

/* ---------- Músicas ---------- */

/** Encontra música local pelo hash do arquivo de origem (dedupe app#336). */
export function findLocalMusicBySljaHash(hash: string): LocalMusic | null {
	return loadDb().musics.find((m) => m.sljaHash === hash) ?? null;
}

export function listLocalMusics(collectionId: number): LocalMusic[] {
	return loadDb().musics.filter((m) => m.collectionId === collectionId);
}

export function getLocalMusic(id: number): LocalMusic | null {
	return loadDb().musics.find((m) => m.id === id) ?? null;
}

/** Todas as músicas locais de todas as coletâneas (busca por letra, 03/10). */
export function listAllLocalMusicsWithLyrics(): LocalMusic[] {
	return loadDb().musics;
}

export function createLocalMusic(
	collectionId: number,
	input: {
		name?: string;
		lyric?: string;
		officialMusicId?: number;
		sljaHash?: string | null;
	},
): LocalMusic {
	const db = loadDb();
	const music: LocalMusic = {
		id: db.nextMusicId,
		collectionId,
		name: input.name ?? "",
		officialMusicId: input.officialMusicId ?? null,
		sljaHash: input.sljaHash ?? null,
		// Novas criações nascem como rascunho (SPEC t_deed74b5).
		status: "draft",
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
		/** Capa/cover da música — data: URL base64 (local, offline-first). */
		image_url?: string | null;
		/** Ids de blobs em IndexedDB (local-media-store) — sem quota. */
		audioMediaId?: string | null;
		coverMediaId?: string | null;
		/** BG 16:9 (projeção) — distinto da cover; separação regra Rafael. */
		backgroundMediaId?: string | null;
		/** Estado de trabalho (SPEC t_deed74b5). */
		status?: "draft" | "published";
	},
): boolean {
	const db = loadDb();
	const music = db.musics.find((m) => m.id === id);
	if (!music) return false;
	if (patch.name != null) music.name = patch.name;
	if (patch.audioBase64 !== undefined) music.audioBase64 = patch.audioBase64;
	if (patch.audioName !== undefined) music.audioName = patch.audioName;
	if (patch.durationMs !== undefined) music.durationMs = patch.durationMs;
	if (patch.image_url !== undefined) music.image_url = patch.image_url;
	if (patch.audioMediaId !== undefined) music.audioMediaId = patch.audioMediaId;
	if (patch.coverMediaId !== undefined) music.coverMediaId = patch.coverMediaId;
	if (patch.backgroundMediaId !== undefined) music.backgroundMediaId = patch.backgroundMediaId;
	if (patch.status !== undefined) music.status = patch.status;
	saveDb(db);
	return true;
}

/** Publica uma música local (SPEC t_deed74b5): draft → published. */
export function publishLocalMusic(id: number): boolean {
	const db = loadDb();
	const music = db.musics.find((m) => m.id === id);
	if (!music) return false;
	music.status = "published";
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
	input: {
		lyric: string;
		aux_lyric?: string;
		time?: string;
		order?: number;
		/** Fundo remoto/data URL legado. */
		image_url?: string | null;
		/** Id de blob de fundo no IndexedDB para import .slja local. */
		imageMediaId?: string | null;
		image_position?: string | number | null;
	},
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
		image_url: input.image_url ?? null,
		imageMediaId: input.imageMediaId ?? null,
		image_position: input.image_position == null ? null : String(input.image_position),
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
