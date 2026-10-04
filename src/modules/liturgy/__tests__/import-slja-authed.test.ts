// @vitest-environment jsdom
// app#331: import .slja LOGADO — sobe pra API (Minhas Coletâneas →
// "Importações .slja") e o service devolve displayMusicId 1M+ (namespace
// custom que resolveMediaTrack resolve). Falha de upload de mídia NÃO
// aborta (semântica do media editor).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, authSessionMock } = vi.hoisted(() => ({
	fetchMock: vi.fn(),
	authSessionMock: vi.fn<() => unknown>(() => null),
}));

vi.stubGlobal("fetch", fetchMock);

vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: authSessionMock,
	authHeaders: () => ({ authorization: "Bearer probe" }),
}));

import { resolveMediaTrack } from "@modules/media/services/custom-catalog";
import { buildSlja, type SljaArchive } from "@shared/services/slja";
import { importSljaAsLiturgyMusic } from "../services/import-slja-to-liturgy";

/** fetch roteado por URL (API fake em memória). */
function routeFetch(musicId: number, lyricId: number) {
	const files: Array<Record<string, unknown>> = [];
	fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
		const u = String(url);
		const json = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), { status });
		if (u.endsWith("/collections") && init?.method === "POST") {
			return json({ id_collection: 55 });
		}
		if (u.includes("/collections/55/musics") && init?.method === "POST") {
			// 201 = criado (dedup: 200 seria "já existia" e pularia uploads)
			return json({ id_music: musicId }, 201);
		}
		if (u.endsWith("/files") && init?.method === "POST") {
			files.push({});
			return json({
				id_file: 900 + files.length,
				url: `/custom/f${files.length}.mp3`,
			});
		}
		if (u.endsWith(`/musics/${musicId}`) && init?.method === "PUT") {
			return json({});
		}
		// GET da música: loadCustomMusicTrack lê name/lyrics/audio_url daqui
		if (u.endsWith(`/musics/${musicId}`) && !init?.method) {
			return json({
				id_music: musicId,
				name: "Hino Autoral Probe",
				audio_url: "/custom/f1.mp3",
				lyrics: [
					{ id_lyric: 1, lyric: "Verso um", time: "00:00:05", order: 1 },
					{ id_lyric: 2, lyric: "Verso dois", time: "00:00:15", order: 2 },
				],
			});
		}
		if (u.endsWith(`/musics/${musicId}/lyrics`) && init?.method === "POST") {
			return json({ id_lyric: ++lyricId });
		}
		return json({ message: "not found" }, 404);
	});
}

describe("import .slja LOGADO → API custom (app#331)", () => {
	beforeEach(() => {
		localStorage.clear();
		fetchMock.mockReset();
		authSessionMock.mockReset();
		authSessionMock.mockReturnValue({ user: { email: "op@igreja.org" } });
	});

	it("sobe música+áudio+estrofes pra API e devolve displayMusicId 1M+", async () => {
		routeFetch(7, 0);
		const archive: SljaArchive = {
			title: "Hino Autoral Probe",
			audio: { name: "autor.mp3", bytes: new Uint8Array([9, 9, 9]) },
			assets: [],
			slides: [
				{ lyric: "Verso um", type: "LETRA", timeMs: 5_000, order: 1 },
				{ lyric: "Verso dois", type: "LETRA", timeMs: 15_000, order: 2 },
			],
		};
		const imported = await importSljaAsLiturgyMusic(
			{ bytes: await buildSlja(archive), name: "hino-autoral.slja" },
			{ confirmUpload: async () => true },
		);

		expect(imported.local).toBe(false);
		expect(imported.musicId).toBe(7);
		expect(imported.displayMusicId).toBe(1_000_007);
		expect(imported.hasAudio).toBe(true);
		expect(imported.slides).toBe(2);
		// ...e o id 1M+ resolve no player via API fake
		const track = await resolveMediaTrack(imported.displayMusicId);
		expect(track?.name).toBe("Hino Autoral Probe");
	});

	it("upload de áudio falhou → import segue (sem áudio), não aborta", async () => {
		routeFetch(8, 0);
		fetchMock.mockImplementation(async (url: string, _init?: RequestInit) => {
			const u = String(url);
			console.log("FETCH", _init?.method ?? "GET", u);
			const json = (body: unknown, status = 200) =>
				new Response(JSON.stringify(body), { status });
			if (u.endsWith("/collections")) return json({ id_collection: 55 });
			if (u.includes("/collections/55/musics")) {
				// dedup: 201 = criado agora; 200 = já existia (pula uploads)
				return json({ id_music: 8 }, _init?.method === "POST" ? 201 : 200);
			}
			if (u.endsWith("/files")) return json({}, 500); // upload quebra
			if (u.endsWith("/musics/8/lyrics")) return json({ id_lyric: 1 });
			return json({ message: "nf" }, 404);
		});

		const archive: SljaArchive = {
			title: "Só Letra",
			audio: { name: "a.mp3", bytes: new Uint8Array([1]) },
			assets: [],
			slides: [{ lyric: "Texto", type: "LETRA", timeMs: 0, order: 1 }],
		};
		const imported = await importSljaAsLiturgyMusic(
			{ bytes: await buildSlja(archive), name: "so-letra.slja" },
			{ confirmUpload: async () => true },
		);

		expect(imported.local).toBe(false);
		expect(imported.hasAudio).toBe(false);
		expect(imported.slides).toBe(1);
	});
});
