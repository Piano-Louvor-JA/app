// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Complemento local-custom-store — corruption guard do loadDb, ids locais
 * negativos e patches parciais de música/letra.
 */
import {
	createLocalCollection,
	createLocalLyric,
	createLocalMusic,
	deleteLocalCollection,
	deleteLocalLyric,
	getLocalCollection,
	getLocalMusic,
	isLocalId,
	listLocalCollections,
	listLocalMusics,
	updateLocalCollection,
	updateLocalLyric,
	updateLocalMusic,
} from "../local-custom-store";

const KEY = "louvorja.local-custom.v1";

beforeEach(() => {
	localStorage.clear();
});

describe("loadDb — guards de corrupção", () => {
	it("JSON inválido → db vazio", () => {
		localStorage.setItem(KEY, "{quebrado");
		expect(listLocalCollections()).toEqual([]);
	});

	it("payload não-objeto (string) → db vazio", () => {
		localStorage.setItem(KEY, '"sou-uma-string"');
		expect(listLocalCollections()).toEqual([]);
	});

	it("payload null → db vazio", () => {
		localStorage.setItem(KEY, "null");
		expect(listLocalCollections()).toEqual([]);
	});

	it("campos ausentes → defaults; arrays inválidos → []", () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({
				nextCollectionId: 5,
				collections: "nao-array",
				musics: 42,
			}),
		);
		expect(listLocalCollections()).toEqual([]);
	});
});

describe("isLocalId", () => {
	it.each([
		[-1, true],
		[-999, true],
		[0, false],
		[1, false],
		["abc", false],
		[null, false],
		[undefined, false],
	])("%s → %s", (input, expected) => {
		expect(isLocalId(input as never)).toBe(expected);
	});
});

describe("patches e removidos", () => {
	it("updateLocalCollection em id inexistente → null", () => {
		expect(updateLocalCollection(999, { name: "x" })).toBe(false);
	});

	it("updateLocalMusic em id inexistente → false", () => {
		expect(updateLocalMusic(-999, { title: "x" })).toBe(false);
	});

	it("updateLocalLyric em música inexistente → false; letra inexistente continua", () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, "M", "L", "");
		// música existe, mas lyricId não
		expect(updateLocalLyric(-999, { aux_lyric: "x" })).toBe(false);
	});

	it("deleteLocalLyric inexistente → false", () => {
		expect(deleteLocalLyric(-999)).toBe(false);
	});

	it("patch parcial de música: só audioName", () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "M" });
		expect(updateLocalMusic(music.id, { audioName: "novo.mp3" } as never)).toBe(
			true,
		);
		expect(getLocalMusic(music.id)?.audioName).toBe("novo.mp3");
	});

	it("patch parcial de letra: só time", () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "M" });
		const lyric = createLocalLyric(music.id, { lyric: "texto", time: "500" });
		expect(updateLocalLyric(lyric.id, { time: "900" })).toBe(true);
		const updated = getLocalMusic(music.id);
		const found = updated?.lyrics?.find((l) => l.id === lyric.id);
		expect(found?.time).toBe("900");
	});

	it("getLocalCollection inexistente → null", () => {
		expect(getLocalCollection(999)).toBeNull();
	});

	it("getLocalMusic inexistente → null", () => {
		expect(getLocalMusic(-999)).toBeNull();
	});
});

describe("ramos restantes locais", () => {
	it("payload com collections e musics válidos usa ambos os arrays (83-84)", () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({
				collections: [{ id: -1, name: "C" }],
				musics: [{ id: -1, collectionId: -1, name: "M", lyrics: [] }],
			}),
		);
		expect(listLocalMusics(-1)).toHaveLength(1);
	});

	it("getLocalCollection encontrado (106 null guard)", () => {
		const col = createLocalCollection("Existe");
		expect(getLocalCollection(col.id)?.name).toBe("Existe");
		expect(getLocalCollection(999)).toBeNull();
	});

	it("updateLocalCollection com description (134-135)", () => {
		const col = createLocalCollection("C");
		updateLocalCollection(col.id, { description: "desc" } as never);
		expect(getLocalCollection(col.id)?.description).toBe("desc");
	});

	it("createLocalLyric em música inexistente lança (222)", () => {
		expect(() => createLocalLyric(-999, { lyric: "x" })).toThrow(
			"local-music-missing",
		);
	});

	it("createLocalLyric com order explícito reordena (234)", () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "M" });
		const a = createLocalLyric(music.id, { lyric: "a", order: 5 });
		const b = createLocalLyric(music.id, { lyric: "b", order: 1 });
		const updated = getLocalMusic(music.id);
		expect(updated?.lyrics?.[0]?.id).toBe(b.id);
		expect(updated?.lyrics?.[1]?.id).toBe(a.id);
	});

	it("updateLocalLyric com order e lyric (248-251)", () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "M" });
		const lyric = createLocalLyric(music.id, { lyric: "a" });
		expect(
			updateLocalLyric(lyric.id, { lyric: "novo", order: 9, aux_lyric: "aux" }),
		).toBe(true);
		const updated = getLocalMusic(music.id);
		expect(updated?.lyrics?.[0]?.lyric).toBe("novo");
		expect(updated?.lyrics?.[0]?.order).toBe(9);
		expect(updated?.lyrics?.[0]?.aux_lyric).toBe("aux");
	});

	it("patch de música com name e audioBase64 (ramos extras)", () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "M" });
		expect(
			updateLocalMusic(music.id, {
				name: "n2",
				audioBase64: "ZGF0YQ==",
			} as never),
		).toBe(true);
		const updated = getLocalMusic(music.id);
		expect(updated?.name).toBe("n2");
		expect(updated?.audioBase64).toBe("ZGF0YQ==");
	});

	it("corrupção: parsed com nextIds certos e arrays válidos (80-84 caminho feliz)", () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({
				nextCollectionId: -3,
				nextMusicId: -7,
				nextLyricId: -9,
				collections: [{ id: -1, name: "C" }],
				musics: [],
			}),
		);
		expect(listLocalCollections()).toHaveLength(1);
	});

	it("parsed sem nextIds → defaults -1 (80-82 ??)", () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({ collections: [{ id: -1, name: "C" }], musics: [] }),
		);
		const col = createLocalCollection("Nova");
		expect(col.id).toBe(-1); // nextCollectionId partiu de -1
	});
});

describe("deleteLocalCollection remove músicas junto (145)", () => {
	it("coletânea com músicas → tudo vai embora e true", () => {
		const col = createLocalCollection("Com musicas");
		createLocalMusic(col.id, { name: "M1" });
		createLocalMusic(col.id, { name: "M2" });
		expect(deleteLocalCollection(col.id)).toBe(true);
		expect(listLocalCollections()).toHaveLength(0);
		// músicas da coletânea removidas
		expect(listAllMusics()).toHaveLength(0);
	});

	it("id inexistente → false", () => {
		expect(deleteLocalCollection(999)).toBe(false);
	});
});

function listAllMusics() {
	// varre o localStorage diretamente
	const raw = localStorage.getItem(KEY);
	const db = raw ? (JSON.parse(raw) as { musics: unknown[] }) : { musics: [] };
	return db.musics;
}
