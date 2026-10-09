// @vitest-environment jsdom
// app#331 B2 — smoke de PROJEÇÃO: o item importado (.slja local) projeta
// IGUAL aos nativos. buildMediaSlides consome o MediaTrackRecord resolvido
// do item (mesma função do player/projeção) e a sincronia (slideTimesSec)
// vem do timing do .slja — capa automática + estrofes com timing.

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadMediaTrackMock, fetchMock, authSessionMock } = vi.hoisted(() => ({
	loadMediaTrackMock: vi.fn(),
	fetchMock: vi.fn(),
	authSessionMock: vi.fn<() => unknown>(() => null),
}));

vi.mock("@modules/media/services/media-catalog", () => ({
	loadMediaTrack: loadMediaTrackMock,
	resolveAlbumSubtitle: () => "",
}));
vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: authSessionMock,
	authHeaders: () => ({}),
}));
vi.stubGlobal("fetch", fetchMock);

import { importSljaAsLiturgyMusic } from "@modules/liturgy/services/import-slja-to-liturgy";
import { resolveMediaTrack } from "@modules/media/services/custom-catalog";
import { buildMediaSlides } from "@modules/media/services/media-slides";
import { useMediaStore } from "@modules/media/stores/useMediaStore";
import { buildSlja, type SljaArchive } from "@shared/services/slja";

describe("app#331 B2 — projeção do item importado", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		localStorage.clear();
		fetchMock.mockReset();
		fetchMock.mockRejectedValue(new Error("REDE BLOQUEADA no teste"));
		loadMediaTrackMock.mockReset();
		loadMediaTrackMock.mockRejectedValue(new Error("catálogo oficial NÃO"));
		authSessionMock.mockReset();
		authSessionMock.mockReturnValue(null);
	});

	it("slides da projeção: capa automática + estrofes com timing do .slja", async () => {
		const archive: SljaArchive = {
			title: "Missao Para Todos",
			audio: { name: "m.mp3", bytes: new Uint8Array([1, 2, 3]) },
			assets: [],
			slides: [
				{ lyric: "CAPA", type: "CAPA", timeMs: 0, order: 1 },
				{ lyric: "Estrofe 1", type: "LETRA", timeMs: 10_000, order: 2 },
				{ lyric: "Estrofe 2", type: "LETRA", timeMs: 25_000, order: 3 },
			],
		};
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "missao.slja",
		});
		const track = await resolveMediaTrack(imported.displayMusicId);
		expect(track).not.toBeNull();

		const slides = buildMediaSlides(track!);
		// capa automática (order -1 com o nome) + 2 estrofes — CAPA do .slja
		// não duplica (mesma regra do media editor)
		expect(slides.length).toBe(3);
		expect(slides[0]?.order).toBe(-1);
		expect(slides[0]?.lyric).toContain("Missao Para Todos");
		expect(slides[1]?.lyric).toBe("Estrofe 1");
		expect(slides[2]?.lyric).toBe("Estrofe 2");

		// sincronia: tempos em segundos na ordem
		const store = useMediaStore();
		void store;
		const times = slides.map((s) => s.time);
		expect(times[1]).toBe("00:00:10");
		expect(times[2]).toBe("00:00:25");
	});

	it("store.open() no item importado monta sessão de player/projeção completa", async () => {
		const archive: SljaArchive = {
			title: "Missao Para Todos",
			audio: { name: "m.mp3", bytes: new Uint8Array([1, 2, 3]) },
			assets: [],
			slides: [{ lyric: "Estrofe 1", type: "LETRA", timeMs: 10_000, order: 1 }],
		};
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "missao.slja",
		});

		const store = useMediaStore();
		const result = await store.open({
			musicId: imported.displayMusicId,
			mode: "audio",
		});
		expect(result.ok).toBe(true);
		expect(store.session?.slides.length).toBe(2); // capa + estrofe
		expect(store.session?.slides[0]?.lyric).toContain("Missao Para Todos");
		expect(store.session?.audioUrl).toMatch(/^data:audio/);
		// estado de projeção: título e slides prontos (mesmo contrato dos nativos)
		expect(store.session?.title).toBe("Missao Para Todos");
		store.close();
	});
});
