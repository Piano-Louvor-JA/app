// @vitest-environment jsdom

import {
	createLocalCollection,
	listLocalCollections,
	listLocalMusics,
} from "@modules/media/services/local-custom-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	listCommunityCollectionsPage,
	saveCommunityCopy,
} from "../community-catalog";

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

describe("saveCommunityCopy (cópia local read-only → editável)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("cria cópia local com as faixas da original, só com GET (B4/B5)", async () => {
		const calls: Array<{ url: string; method: string }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				calls.push({
					url: String(url),
					method: (init?.method as string) ?? "GET",
				});
				if (String(url).endsWith("/collections/12/musics")) {
					return jsonResponse({
						data: [
							{ id_music: 1, name: "Hino A", official_music_id: 555 },
							{ id_music: 2, name: "Hino B", official_music_id: null },
						],
					});
				}
				return jsonResponse({ data: [] });
			}),
		);

		const localId = await saveCommunityCopy(COLLECTION);
		expect(localId).not.toBeNull();
		expect(localId).toSatisfy((n: number) => n < 0); // id local (negativo)
		const copy = listLocalMusics(localId as number);
		expect(copy.map((m) => m.name)).toEqual(["Hino A", "Hino B"]);
		expect(copy[0]?.officialMusicId).toBe(555);
		// zero escritas remotas: nenhum POST/PUT/PATCH/DELETE
		expect(calls.filter((c) => !["GET", "HEAD"].includes(c.method))).toEqual(
			[],
		);
		// a coletânea da comunidade não mudou (não há como — só lemos)
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("falha ao buscar faixas → null, sem criar cópia parcial", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ error: "x" }, false)),
		);
		const before = listLocalCollections().length;
		const localId = await saveCommunityCopy(COLLECTION);
		expect(localId).toBeNull();
		expect(listLocalCollections().length).toBe(before);
	});

	it("exceção de rede → null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("down");
			}),
		);
		expect(await saveCommunityCopy(COLLECTION)).toBeNull();
	});

	it("listCommunityCollections continua não afetando localStorage", async () => {
		createLocalCollection("pre-existente");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ data: [] })),
		);
		await listCommunityCollectionsPage(1);
		expect(listLocalCollections().length).toBe(1);
	});

	it("response !ok na busca de faixas → null (lado erro)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ error: "x" }, false)),
		);
		expect(await saveCommunityCopy(COLLECTION)).toBeNull();
	});

	it("payload sem array → null; description null não quebra (lado null)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (String(url).endsWith("/collections/12/musics")) {
					return jsonResponse({ nope: true });
				}
				return jsonResponse({ data: [] });
			}),
		);
		expect(
			await saveCommunityCopy({ ...COLLECTION, description: null }),
		).toBeNull();
	});

	it("copia com description null funciona quando ha faixas", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (String(url).endsWith("/collections/12/musics")) {
					return jsonResponse({
						data: [
							{ id_music: 1, name: "A", official_music_id: 0 },
							{ id_music: 2 },
						],
					});
				}
				return jsonResponse({ data: [] });
			}),
		);
		const localId = await saveCommunityCopy({
			...COLLECTION,
			description: null,
		});
		expect(localId).not.toBeNull();
		expect(listLocalMusics(localId as number)).toHaveLength(2);
	});
});

describe("saveCommunityCopy — fechamento de mutantes (mapeamento de faixa)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("official_music_id: número >0 é preservado; 0/negativo/string → null (branches exatas)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (String(url).endsWith("/collections/12/musics")) {
					return jsonResponse({
						data: [
							{ id_music: 1, name: "Link", official_music_id: 42 },
							{ id_music: 2, name: "Zero", official_music_id: 0 },
							{ id_music: 3, name: "Neg", official_music_id: -1 },
							{ id_music: 4, name: "Str", official_music_id: "42" },
							{ id_music: 5, name: "Ausente" },
						],
					});
				}
				return jsonResponse({ data: [] });
			}),
		);
		const localId = await saveCommunityCopy(COLLECTION);
		expect(localId).not.toBeNull();
		const musics = listLocalMusics(localId as number);
		expect(musics).toHaveLength(5);
		const byName = new Map(musics.map((m) => [m.name, m]));
		// 42: único caso em que officialMusicId !== null
		expect(byName.get("Link")?.officialMusicId).toBe(42);
		// 0 e -1: falham no > 0
		expect(byName.get("Zero")?.officialMusicId ?? null).toBeNull();
		expect(byName.get("Neg")?.officialMusicId ?? null).toBeNull();
		// string "42": falha no typeof === "number"
		expect(byName.get("Str")?.officialMusicId ?? null).toBeNull();
		// ausente: null
		expect(byName.get("Ausente")?.officialMusicId ?? null).toBeNull();
	});

	it("payload de faixas SEM array → null e NENHUMA cópia criada (mesmo com musics lixo)", async () => {
		const before = listLocalCollections().length;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (String(url).endsWith("/collections/12/musics")) {
					return jsonResponse({ data: { not: "array" } });
				}
				return jsonResponse({ data: [] });
			}),
		);
		expect(await saveCommunityCopy(COLLECTION)).toBeNull();
		expect(listLocalCollections().length).toBe(before);
	});

	it("faixa mapeada tem name default '' quando name ausente (asString ?? '')", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (String(url).endsWith("/collections/12/musics")) {
					return jsonResponse({
						data: [{ id_music: 1, official_music_id: 7 }],
					});
				}
				return jsonResponse({ data: [] });
			}),
		);
		const localId = await saveCommunityCopy(COLLECTION);
		const musics = listLocalMusics(localId as number);
		expect(musics[0]?.name).toBe("");
		expect(musics[0]?.officialMusicId).toBe(7);
	});
});
