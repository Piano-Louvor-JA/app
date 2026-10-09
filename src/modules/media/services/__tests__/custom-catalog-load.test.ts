// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complemento 2 custom-catalog — loadCustomMusicTrack: música local
 * (data: URL, link p/ oficial), API com official_music_id, rows inválidas.
 */

const mocks = vi.hoisted(() => ({
	authHeadersMock: vi.fn(() => ({ Authorization: "Bearer x" })),
	getAuthSessionMock: vi.fn(() => null),
	loadMediaTrackMock: vi.fn<(id: number) => Promise<unknown>>(async () => null),
	resolveRemoteFileUrlMock: vi.fn(
		(p: string) => `https://files.example.com${p}`,
	),
}));

vi.mock("../auth-client", () => ({
	authHeaders: () => mocks.authHeadersMock(),
	getAuthSession: () => mocks.getAuthSessionMock(),
}));
vi.mock("../media-catalog", () => ({
	loadMediaTrack: (...args: unknown[]) =>
		mocks.loadMediaTrackMock(...(args as [number])),
}));
vi.mock("../media-audio", () => ({
	resolveRemoteFileUrl: (p: string) => mocks.resolveRemoteFileUrlMock(p),
}));

import { loadCustomMusicTrack } from "../custom-catalog";
import {
	createLocalCollection,
	createLocalLyric,
	createLocalMusic,
	updateLocalMusic,
} from "../local-custom-store";

type Route = {
	match: (url: string, init?: RequestInit) => boolean;
	status?: number;
	body?: unknown;
};
let routes: Route[] = [];

function fetchStub(url: string, init?: RequestInit) {
	const route = routes.find((r) => r.match(url, init));
	if (!route) return Promise.reject(new Error(`fetch sem rota: ${url}`));
	return Promise.resolve({
		ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
		status: route.status ?? 200,
		json: async () => route.body,
	});
}

beforeEach(() => {
	localStorage.clear();
	routes = [];
	vi.stubGlobal("fetch", vi.fn(fetchStub));
	mocks.loadMediaTrackMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("loadCustomMusicTrack — música local", () => {
	it("id local inexistente -> null", async () => {
		expect(await loadCustomMusicTrack(-999)).toBeNull();
	});

	it("local com officialMusicId delega ao catálogo oficial", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "M", officialMusicId: 42 });
		mocks.loadMediaTrackMock.mockResolvedValue({
			id: 42,
			name: "Oficial",
			durationLabel: "3:00",
			audioUrl: "http://a.mp3",
			instrumentalUrl: null,
			coverUrl: null,
			coverPosition: null,
			albums: [],
			categories: [],
			lyrics: [],
		});
		const result = await loadCustomMusicTrack(music.id);
		expect(result?.id).toBe(music.id);
		expect(result?.name).toBe("Oficial");
	});

	it("local com officialMusicId e oficial inexistente -> null", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "M", officialMusicId: 42 });
		expect(await loadCustomMusicTrack(music.id)).toBeNull();
	});

	it("local sem áudio -> audioUrl null; letra com show_slide", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "Local" });
		createLocalLyric(music.id, { lyric: "estrofe" });
		const result = await loadCustomMusicTrack(music.id);
		expect(result?.audioUrl).toBeNull();
		expect(result?.categories).toEqual(["Minhas Coletâneas"]);
		expect(result?.lyrics[0]?.lyric).toBe("estrofe");
		expect(result?.lyrics[0]?.showSlide).toBe(true);
	});

	it("local com áudio base64 -> data: URL", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "Com audio" });
		updateLocalMusic(music.id, { audioBase64: "ZGF0YQ==" });
		const result = await loadCustomMusicTrack(music.id);
		expect(result?.audioUrl).toBe("data:audio/mpeg;base64,ZGF0YQ==");
	});
});

describe("loadCustomMusicTrack — via API", () => {
	it("id inválido (0/negativo/NaN) -> null sem fetch", async () => {
		expect(await loadCustomMusicTrack(0)).toBeNull();
		expect(await loadCustomMusicTrack(-5)).toBeNull();
		expect(await loadCustomMusicTrack(Number.NaN)).toBeNull();
	});

	it("API !ok -> null", async () => {
		routes = [{ match: () => true, status: 404 }];
		expect(await loadCustomMusicTrack(10)).toBeNull();
	});

	it("row sem name -> null", async () => {
		routes = [{ match: () => true, body: { id: 10 } }];
		expect(await loadCustomMusicTrack(10)).toBeNull();
	});

	it("row com official_music_id delega; oficial falha -> null", async () => {
		routes = [
			{
				match: () => true,
				body: { id_music: 10, name: "M", official_music_id: 77 },
			},
		];
		expect(await loadCustomMusicTrack(10)).toBeNull();
		expect(mocks.loadMediaTrackMock).toHaveBeenCalledWith(77);
	});

	it("row completa mapeia capa fallback do slide e coverPosition", async () => {
		routes = [
			{
				match: () => true,
				body: {
					id_music: 10,
					name: "Completa",
					duration: "3:45",
					audio_url: "/custom/a.mp3",
					instrumental_url: null,
					image_url: null,
					image_position: 3,
					lyrics: [{ order: 1, lyric: "l1", image_url: "/custom/capa.jpg" }],
				},
			},
		];
		const result = await loadCustomMusicTrack(10);
		expect(result?.coverUrl).toBe("/custom/capa.jpg");
		expect(result?.coverPosition).toBe("3");
		expect(result?.durationLabel).toBe("3:45");
		expect(result?.lyrics[0]?.imageUrl).toBe("/custom/capa.jpg");
		expect(result?.lyrics[0]?.isCover).toBe(true);
	});

	it("fetch lançando -> null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("down");
			}),
		);
		expect(await loadCustomMusicTrack(10)).toBeNull();
	});
});
