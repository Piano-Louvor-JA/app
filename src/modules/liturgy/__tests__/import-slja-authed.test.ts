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
			{
				bytes: await buildSlja(archive),
				name: "hino-autoral.slja",
			},
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
			if (u.includes("/collections/55/musics")) return json({ id_music: 8 }, 201);
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
			{
				bytes: await buildSlja(archive),
				name: "so-letra.slja",
			},
			{ confirmUpload: async () => true },
		);

		expect(imported.local).toBe(false);
		expect(imported.hasAudio).toBe(false);
		expect(imported.slides).toBe(1);
	});

	it("imagem da CAPA vira capa da música, sem virar estrofe", async () => {
		let coverFileId: number | null = null;
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			const u = String(url);
			const json = (body: unknown, status = 200) =>
				new Response(JSON.stringify(body), { status });
			if (u.endsWith("/collections") && init?.method === "POST") {
				return json({ id_collection: 55 });
			}
			if (u.includes("/collections/55/musics") && init?.method === "POST") {
				return json({ id_music: 7 }, 201);
			}
			if (u.endsWith("/files") && init?.method === "POST") {
				return json({ id_file: 44, url: "/custom/capa.png" });
			}
			if (u.endsWith("/musics/7") && init?.method === "PUT") {
				const body = JSON.parse(String(init?.body ?? "{}")) as {
					id_file_image?: number;
				};
				if (body.id_file_image != null) coverFileId = body.id_file_image;
				return json({});
			}
			if (u.endsWith("/musics/7/lyrics") && init?.method === "POST") {
				return json({ id_lyric: 1 });
			}
			return json({ message: "nf" }, 404);
		});

		const archive: SljaArchive = {
			title: "Com Capa",
			assets: [{ path: "capa.png", bytes: new Uint8Array([1, 2]) }],
			slides: [
				{
					lyric: "Capa",
					type: "CAPA",
					timeMs: 0,
					order: 1,
					image: { name: "capa.png", bytes: new Uint8Array([1, 2]) },
				},
				{ lyric: "Verso", type: "LETRA", timeMs: 1_000, order: 2 },
			],
		};
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "capa.slja",
		});
		expect(imported.slides).toBe(1);
		expect(coverFileId).toBe(44);
	});

	it("não reusa a coletânea pública de outro usuário", async () => {
		authSessionMock.mockReturnValue({
			token: "tok",
			user: { id_user: 1, email: "op@igreja.org" },
		});
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			const u = String(url);
			const json = (body: unknown, status = 200) =>
				new Response(JSON.stringify(body), { status });
			if (u.endsWith("/collections") && init?.method !== "POST") {
				return json({
					data: [
						{
							id_collection: 99,
							name: "Importações .slja",
							owner_id: 999,
							visibility: "public",
						},
					],
				});
			}
			if (u.endsWith("/collections") && init?.method === "POST") {
				return json({ id_collection: 55 });
			}
			if (u.includes("/collections/55/musics") && init?.method === "POST") {
				return json({ id_music: 7 }, 201);
			}
			if (u.endsWith("/musics/7/lyrics") && init?.method === "POST") {
				return json({ id_lyric: 1 });
			}
			return json({ message: "nf" }, 404);
		});
		const archive: SljaArchive = {
			title: "Minha",
			assets: [],
			slides: [{ lyric: "Verso", type: "LETRA", timeMs: 1_000, order: 1 }],
		};
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "minha.slja",
		});
		expect(imported.collectionId).toBe(55);
		expect(
			fetchMock.mock.calls.some((call) =>
				String(call[0]).includes("/collections/99/"),
			),
		).toBe(false);
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
				return json({ id_music: 7 }, 201);
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

 it("prefere imagem exata quando nomes de assets se sobrepõem", async () => {
   authSessionMock.mockReturnValue({ token: "tok", user: { id_user: 1 } });
   fetchMock.mockClear();
   routeFetch(7, 0);
   const archive: SljaArchive = {
     title: "Assets", assets: [
       { path: "special-bg.png", bytes: new Uint8Array([1]) },
       { path: "bg.png", bytes: new Uint8Array([2]) },
     ],
     slides: [{ lyric: "Verso", type: "LETRA", order: 1, timeMs: 1000,
       image: { name: "bg.png", bytes: new Uint8Array([2]) } }],
   };
   await importSljaAsLiturgyMusic({ bytes: await buildSlja(archive), name: "assets.slja" });
   const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/musics/7/lyrics") && init?.method === "POST");
   expect(JSON.parse(String(call?.[1]?.body)).id_file_image).toBe(902);
 });

 it("encerra importação quando consulta de coletâneas expira", async () => {
   authSessionMock.mockReturnValue({ token: "tok", user: { id_user: 1 } });
   const controller = new AbortController();
   const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
   fetchMock.mockClear();
   fetchMock.mockImplementation(async (_url, init) => {
     expect(init.signal).toBe(controller.signal);
     controller.abort();
     throw new DOMException("Timeout", "AbortError");
   });
   try {
     const archive: SljaArchive = { title: "Timeout", assets: [], slides: [{ lyric: "Verso", type: "LETRA", order: 1, timeMs: 0 }] };
     await expect(importSljaAsLiturgyMusic({ bytes: await buildSlja(archive), name: "timeout.slja" })).rejects.toThrow("SLJA_IMPORT_COLLECTION_FAILED");
     expect(timeout).toHaveBeenCalledWith(15_000);
     expect(fetchMock).toHaveBeenCalledTimes(1);
   } finally { timeout.mockRestore(); }
 });

 it("preserva a posição da imagem do slide importada do .slja", async () => {
   authSessionMock.mockReturnValue({ token: "tok", user: { id_user: 1 } });
   fetchMock.mockClear();
   routeFetch(7, 0);
   const archive: SljaArchive = { title: "Posição", assets: [], slides: [
     { lyric: "Slide com posição", type: "LETRA", order: 1, timeMs: 0, imagePosition: 2 },
     { lyric: "Slide default", type: "LETRA", order: 2, timeMs: 5000 },
   ] };
   await importSljaAsLiturgyMusic({ bytes: await buildSlja(archive), name: "posicao.slja" });
   const lyricCalls = fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/lyrics") && init?.method === "POST");
   expect(lyricCalls.length).toBe(2);
   const bodies = lyricCalls.map(([, init]) => JSON.parse(String(init?.body)));
   expect(bodies[0].image_position).toBe(2);
   expect(bodies[1].image_position).toBeUndefined();
 });

it("persiste estimativa de duração na música remota em segundos", async () => {
   authSessionMock.mockReturnValue({ token: "tok", user: { id_user: 1 } });
   fetchMock.mockClear();
   routeFetch(7, 0);
   const archive: SljaArchive = { title: "Duração", assets: [], slides: [
     { lyric: "Primeira", type: "LETRA", order: 1, timeMs: 0 },
     { lyric: "Última", type: "LETRA", order: 2, timeMs: 30000 },
   ] };
   const imported = await importSljaAsLiturgyMusic({ bytes: await buildSlja(archive), name: "duration.slja" });
   const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/collections/55/musics") && init?.method === "POST");
   expect(imported.durationMs).toBeGreaterThan(0);
   expect(JSON.parse(String(call?.[1]?.body)).duration).toBe(imported.durationMs / 1000);
 });
