// @vitest-environment jsdom

import {
	listLocalCollections,
} from "@modules/media/services/local-custom-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveCommunityCopy } from "../community-catalog";

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 500,
		json: async () => body,
	} as unknown as Response;
}

const COLLECTION = {
	id: 12,
	name: "Culto Jovem",
	description: "desc",
	coverUrl: null,
	authorName: "Maria",
	musicsCount: 2,
	updatedAt: null,
};

describe("saveCommunityCopy marca origem (AC1 — SPEC-louvorja-community-copies)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("após cópia, listLocalCollections tem origin.type==='community' e origin.collectionId===id público", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (String(url).endsWith("/collections/12/musics")) {
					return jsonResponse({
						data: [{ id_music: 1, name: "Hino A", official_music_id: 555 }],
					});
				}
				return jsonResponse({ data: [] });
			}),
		);

		const localId = await saveCommunityCopy(COLLECTION);
		expect(localId).not.toBeNull();
		const copy = listLocalCollections().find((c) => c.id === localId);
		expect(copy?.origin?.type).toBe("community");
		expect(copy?.origin?.collectionId).toBe(12);
		expect(typeof copy?.origin?.copiedAt).toBe("string");
		expect(Number.isNaN(Date.parse(copy?.origin?.copiedAt ?? ""))).toBe(false);
	});
});
