// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	createLocalCollection,
	loadLocalDb,
	listLocalCollections,
	replaceLocalDb,
} from "../local-custom-store";

describe("origem de coletânea local (SPEC-louvorja-community-copies AC1/AC4/AC5)", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("AC1: createLocalCollection com origin persiste e loadLocalDb devolve origin", () => {
		const origin = {
			type: "community" as const,
			collectionId: 42,
			copiedAt: "2026-11-23T12:00:00.000Z",
		};
		const c = createLocalCollection("Cópia", undefined, origin);
		const stored = listLocalCollections().find((x) => x.id === c.id);
		expect(stored?.origin).toEqual(origin);
		const loaded = loadLocalDb().collections.find((x) => x.id === c.id);
		expect(loaded?.origin).toEqual(origin);
	});

	it("sem origin → origin === null (coletânea manual)", () => {
		const c = createLocalCollection("Manual");
		const stored = listLocalCollections().find((x) => x.id === c.id);
		expect(stored?.origin ?? null).toBeNull();
	});

	it("AC5: JSON sem campo origin (pacote .louvorja antigo) parseia com origin === null", () => {
		localStorage.setItem(
			"louvorja.local-custom.v1",
			JSON.stringify({
				nextCollectionId: -2,
				nextMusicId: -1,
				nextLyricId: -1,
				collections: [
					{ id: -1, name: "Antiga", description: null, createdAt: "2025-01-01T00:00:00.000Z" },
				],
				musics: [],
			}),
		);
		const loaded = loadLocalDb().collections.find((x) => x.id === -1);
		expect(loaded?.origin ?? null).toBeNull();
	});

	it("AC4: reload preserva origin (round-trip replaceLocalDb → loadLocalDb)", () => {
		const origin = {
			type: "community" as const,
			collectionId: 7,
			copiedAt: "2026-11-23T10:00:00.000Z",
		};
		const c = createLocalCollection("Cópia 7", undefined, origin);
		const db = loadLocalDb();
		replaceLocalDb(db);
		const loaded = loadLocalDb().collections.find((x) => x.id === c.id);
		expect(loaded?.origin).toEqual(origin);
	});
});
