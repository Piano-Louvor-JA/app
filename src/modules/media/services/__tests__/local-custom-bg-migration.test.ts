// @vitest-environment jsdom
// Migração BG×cover (regra Rafael): import .slja legado gravava o BG 16:9 em
// coverMediaId; loadDb promove para backgroundMediaId SEM reimport.
import { beforeEach, describe, expect, it } from "vitest";

import { loadLocalDb } from "@modules/media/services/local-custom-store";

const STORAGE_KEY = "louvorja.local-custom.v1";

function seedDb(musics: unknown[]) {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			nextCollectionId: -1,
			nextMusicId: -1,
			nextLyricId: -1,
			collections: [],
			musics,
		}),
	);
}

describe("migração legado coverMediaId→backgroundMediaId (.slja)", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("legado slja- em coverMediaId vira backgroundMediaId; coverMediaId zerado", () => {
		seedDb([{ id: -1, id_collection: -1, name: "Encontro", coverMediaId: "slja-h-cover", sljaHash: "h" }]);
		const db = loadLocalDb();
		expect(db.musics[0]?.backgroundMediaId).toBe("slja-h-cover");
		expect(db.musics[0]?.coverMediaId).toBe("slja-h-cover"); // blob preservado p/ cover até editor definir
	});

	it("legado com capa do editor definida (coverMediaId sobrescrito) reata BG pelo sljaHash", () => {
		seedDb([{ id: -1, id_collection: -1, name: "Encontro", coverMediaId: "local-music--1-cover", sljaHash: "h" }]);
		const db = loadLocalDb();
		expect(db.musics[0]?.backgroundMediaId).toBe("slja-h-cover");
		expect(db.musics[0]?.coverMediaId).toBe("local-music--1-cover"); // capa preservada
	});

	it("música sem sljaHash (não .slja) não ganha background", () => {
		seedDb([{ id: -1, id_collection: -1, name: "Missão", coverMediaId: "local-music--1-cover" }]);
		const db = loadLocalDb();
		expect(db.musics[0]?.backgroundMediaId).toBeUndefined();
	});

	it("música já migrada não é tocada de novo", () => {
		seedDb([{ id: -1, id_collection: -1, name: "Nova", backgroundMediaId: "slja-x", coverMediaId: "local-music--1-cover" }]);
		const db = loadLocalDb();
		expect(db.musics[0]?.backgroundMediaId).toBe("slja-x");
		expect(db.musics[0]?.coverMediaId).toBe("local-music--1-cover");
	});
});
