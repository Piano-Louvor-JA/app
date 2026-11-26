// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	getCommunityCollectionDetail,
	type CommunityCollectionDetail,
} from "../community-catalog";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: async () => body,
	} as unknown as Response;
}

const DETAIL_PAYLOAD = {
	id_collection: 42,
	name: "Coletânea da Comunidade",
	description: "Cantos do culto",
	author_name: "João",
	musics_count: 2,
};

const MUSICS_PAYLOAD = {
	data: [
		{
			id_music: 7,
			name: "Hino com áudio",
			audio_url: "/files/hino7.mp3",
			official_music_id: 123,
		},
		{
			id_music: 8,
			name: "Hino sem áudio",
			audio_url: null,
			official_music_id: null,
		},
	],
	meta: { total: 2, per_page: 2, current_page: 1, last_page: 1 },
};

describe("getCommunityCollectionDetail (detalhe público read-only, RF-01/RF-02)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("200: retorna coletânea + faixas ordenadas com hasAudio correto", async () => {
		const calls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calls.push(String(url));
				if (String(url).endsWith("/collections/42")) {
					return jsonResponse(DETAIL_PAYLOAD);
				}
				if (String(url).endsWith("/collections/42/musics")) {
					return jsonResponse(MUSICS_PAYLOAD);
				}
				return jsonResponse({ error: "not found" }, false, 404);
			}),
		);

		const detail: CommunityCollectionDetail | null =
			await getCommunityCollectionDetail(42);
		expect(detail).not.toBeNull();
		expect(detail?.id).toBe(42);
		expect(detail?.name).toBe("Coletânea da Comunidade");
		expect(detail?.authorName).toBe("João");
		expect(detail?.musics).toHaveLength(2);
		expect(detail?.musics[0]).toMatchObject({
			id: 7,
			name: "Hino com áudio",
			officialMusicId: 123,
			hasAudio: true,
		});
		// faixa sem áudio nem hino oficial → hasAudio false (RF-02: indisponibilidade explícita)
		expect(detail?.musics[1]?.hasAudio).toBe(false);
		// ambas as chamadas batem nos endpoints públicos existentes
		expect(calls.some((u) => u.endsWith("/collections/42"))).toBe(true);
		expect(calls.some((u) => u.endsWith("/collections/42/musics"))).toBe(true);
	});

	it("404 na coletânea (inexistente ou privada de terceiro) → null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ error: "x" }, false, 404)),
		);
		expect(await getCommunityCollectionDetail(999)).toBeNull();
	});

	it("falha de rede → null (nunca lança)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await getCommunityCollectionDetail(42)).toBeNull();
	});

	it("JSON inválido → null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => {
					throw new Error("bad json");
				},
			} as unknown as Response)),
		);
		expect(await getCommunityCollectionDetail(42)).toBeNull();
	});

	it("id não positivo → null sem fetch", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		expect(await getCommunityCollectionDetail(0)).toBeNull();
		expect(await getCommunityCollectionDetail(-5)).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("payload sem id_collection → null (contrato quebrado tratado)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (String(url).endsWith("/collections/42")) {
					return jsonResponse({ name: "sem id" });
				}
				return jsonResponse(MUSICS_PAYLOAD);
			}),
		);
		expect(await getCommunityCollectionDetail(42)).toBeNull();
	});
});
