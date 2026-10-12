// @vitest-environment jsdom
// app#331 B1/B2: useMediaStore.open resolve os TRÊS namespaces de musicId —
// oficial (positivo), custom API (1M+) e LOCAL (negativo, import .slja sem
// login). O catálogo oficial NUNCA pode ser consultado por id local.

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadMediaTrackMock, authSessionMock, fetchMock } = vi.hoisted(() => ({
	loadMediaTrackMock: vi.fn(),
	authSessionMock: vi.fn<() => unknown>(() => null),
	fetchMock: vi.fn(),
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

import {
	createLocalCollection,
	createLocalLyric,
	createLocalMusic,
	updateLocalMusic,
} from "@modules/media/services/local-custom-store";
import { useMediaStore } from "@modules/media/stores/useMediaStore";

function seedLocalMusic(): number {
	const collection = createLocalCollection("Importações .slja");
	const music = createLocalMusic(collection.id, { name: "Missao Para Todos" });
	createLocalLyric(music.id, {
		lyric: "Para todos",
		time: "00:00:20",
		order: 1,
	});
	updateLocalMusic(music.id, {
		audioBase64: "AQIDBAU=",
		audioName: "missao.mp3",
	});
	return music.id;
}

describe("useMediaStore.open — namespace de musicId (app#331)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		localStorage.clear();
		fetchMock.mockReset();
		fetchMock.mockRejectedValue(new Error("REDE BLOQUEADA no teste"));
		loadMediaTrackMock.mockReset();
		loadMediaTrackMock.mockRejectedValue(
			new Error("NÃO DEVERIA consultar o catálogo oficial pra música local"),
		);
		authSessionMock.mockReset();
		authSessionMock.mockReturnValue(null);
	});

	it("musicId LOCAL (negativo) abre no player com áudio data: (offline)", async () => {
		const localId = seedLocalMusic();
		const store = useMediaStore();

		const result = await store.open({ musicId: localId, mode: "audio" });

		expect(result.ok).toBe(true);
		expect(store.session).not.toBeNull();
		expect(store.session?.title).toBe("Missao Para Todos");
		expect(store.session?.audioUrl).toBe("data:audio/mpeg;base64,AQIDBAU=");
		expect(fetchMock).not.toHaveBeenCalled();
		store.close();
	});

	it("musicId 0/NaN continua rejeitado (trackMissing)", async () => {
		const store = useMediaStore();
		expect((await store.open({ musicId: 0, mode: "audio" })).ok).toBe(false);
		expect((await store.open({ musicId: Number.NaN, mode: "audio" })).ok).toBe(
			false,
		);
		expect(store.session).toBeNull();
	});
});
