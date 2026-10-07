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
import {
	createLocalCollection,
	listLocalMusics,
} from "@modules/media/services/local-custom-store";
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
			return json({ id_music: musicId });
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
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "hino-autoral.slja",
		});

		expect(imported.local).toBe(false);
		expect(imported.musicId).toBe(7);
		expect(imported.displayMusicId).toBe(1_000_007);
		expect(imported.hasAudio).toBe(true);
		expect(imported.slides).toBe(2);
		// ...e o id 1M+ resolve no player via API fake
		const track = await resolveMediaTrack(imported.displayMusicId);
		expect(track?.name).toBe("Hino Autoral Probe");
	});

	it("coletânea local homônima não é reusada depois do login", async () => {
		const local = createLocalCollection("Importações .slja");
		routeFetch(7, 0);
		const archive: SljaArchive = {
			title: "Hino Autoral Probe",
			audio: { name: "autor.mp3", bytes: new Uint8Array([9, 9, 9]) },
			assets: [],
			slides: [{ lyric: "Verso um", type: "LETRA", timeMs: 5_000, order: 1 }],
		};
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "hino-autoral.slja",
		});

		expect(imported.local).toBe(false);
		expect(imported.displayMusicId).toBe(1_000_007);
		expect(listLocalMusics(local.id)).toHaveLength(0);
		const musicPost = fetchMock.mock.calls.find(
			(call) =>
				String(call[0]).includes("/musics") &&
				(call[1] as RequestInit | undefined)?.method === "POST",
		);
		expect(String(musicPost?.[0])).toContain("/collections/55/musics");
	});

	it("upload de áudio falhou → import segue (sem áudio), não aborta", async () => {
		routeFetch(8, 0);
		fetchMock.mockImplementation(async (url: string, _init?: RequestInit) => {
			const u = String(url);
			const json = (body: unknown, status = 200) =>
				new Response(JSON.stringify(body), { status });
			if (u.endsWith("/collections")) return json({ id_collection: 55 });
			if (u.includes("/collections/55/musics")) return json({ id_music: 8 });
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
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "so-letra.slja",
		});

		expect(imported.local).toBe(false);
		expect(imported.hasAudio).toBe(false);
		expect(imported.slides).toBe(1);
	});

	it("estrofe rejeitada desfaz a música e não reporta sucesso", async () => {
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			const u = String(url);
			const json = (body: unknown, status = 200) =>
				new Response(JSON.stringify(body), { status });
			if (u.endsWith("/collections") && init?.method === "POST") {
				return json({ id_collection: 55 });
			}
			if (u.includes("/collections/55/musics") && init?.method === "POST") {
				return json({ id_music: 7 });
			}
			if (u.endsWith("/files") && init?.method === "POST") {
				return json({ id_file: 1, url: "/custom/f1.mp3" });
			}
			if (u.endsWith("/musics/7") && init?.method === "PUT") return json({});
			if (u.endsWith("/musics/7/lyrics") && init?.method === "POST") {
				return json({ message: "fail" }, 500);
			}
			if (u.endsWith("/musics/7") && init?.method === "DELETE") return json({});
			return json({ message: "nf" }, 404);
		});

		const archive: SljaArchive = {
			title: "Letra Quebrada",
			audio: { name: "a.mp3", bytes: new Uint8Array([1]) },
			assets: [],
			slides: [{ lyric: "Verso", type: "LETRA", timeMs: 1_000, order: 1 }],
		};
		await expect(
			importSljaAsLiturgyMusic({
				bytes: await buildSlja(archive),
				name: "quebrada.slja",
			}),
		).rejects.toThrow("SLJA_IMPORT_LYRICS_INCOMPLETE");
		expect(
			fetchMock.mock.calls.some(
				(call) =>
					String(call[0]).endsWith("/musics/7") &&
					(call[1] as RequestInit | undefined)?.method === "DELETE",
			),
		).toBe(true);
	});
});
