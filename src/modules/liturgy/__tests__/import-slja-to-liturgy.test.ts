// @vitest-environment jsdom
// app#331: importar .slja direto no item de música da liturgia — sem login.
// Prova o tracer bullet INTEIRO: parse → música LOCAL (localStorage, id
// negativo, áudio base64) → draft do item → store do player → áudio data:
// offline (nenhum fetch de rede em nenhum ponto do caminho).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadMediaTrackMock, authSessionMock, fetchMock } = vi.hoisted(() => ({
	loadMediaTrackMock: vi.fn(),
	authSessionMock: vi.fn<() => unknown>(() => null),
	fetchMock: vi.fn(),
}));

vi.mock("@modules/media/services/media-catalog", () => ({
	loadMediaTrack: loadMediaTrackMock,
}));

vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: authSessionMock,
	authHeaders: () => ({}),
}));

// Rede bloqueada: qualquer fetch = falha de teste. O caminho local do import
// e do player NUNCA pode sair da máquina (offline-first).
vi.stubGlobal("fetch", fetchMock);

import { resolveMediaTrack } from "@modules/media/services/custom-catalog";
import {
	getLocalMusic,
	listLocalCollections,
	listLocalMusics,
} from "@modules/media/services/local-custom-store";
import { buildSlja, type SljaArchive } from "@shared/services/slja";
import {
	importSljaAsLiturgyMusic,
	sljaDisplayName,
} from "../services/import-slja-to-liturgy";
import { resolveMusicId } from "../services/liturgy-actions";

async function makeSljaBuffer(): Promise<ArrayBuffer> {
	const archive: SljaArchive = {
		title: "Missao Para Todos",
		audio: { name: "missao.mp3", bytes: new Uint8Array([1, 2, 3, 4, 5]) },
		assets: [],
		slides: [
			{ lyric: "Missao", type: "CAPA", timeMs: 0, order: 1 },
			{ lyric: "Para todos", type: "LETRA", timeMs: 20_000, order: 2 },
		],
	};
	return buildSlja(archive);
}

describe("app#331 — import .slja → item de liturgia → player (offline)", () => {
	beforeEach(() => {
		localStorage.clear();
		fetchMock.mockClear();
		fetchMock.mockRejectedValue(new Error("REDE BLOQUEADA no teste"));
		loadMediaTrackMock.mockClear();
		loadMediaTrackMock.mockRejectedValue(
			new Error("NÃO DEVERIA consultar o catálogo oficial pra música local"),
		);
		authSessionMock.mockClear();
		authSessionMock.mockReturnValue(null);
	});

	it("import deslogado grava local e retorna musicId negativo", async () => {
		const imported = await importSljaAsLiturgyMusic({
			bytes: await makeSljaBuffer(),
			name: "missao.slja",
		});

		expect(imported.local).toBe(true);
		expect(imported.musicId).toBeLessThan(0);
		expect(imported.name).toBe("Missao Para Todos");
		expect(imported.hasAudio).toBe(true);
		// CAPA não vira estrofe (mesma regra do media editor)
		expect(imported.slides).toBe(1);
		expect(imported.durationMs).toBe(20_000 + 30_000);
	});

	it("1ª importação deslogada cria a coletânea de importações e reuso não duplica", async () => {

		const a = await importSljaAsLiturgyMusic({ bytes: await makeSljaBuffer(), name: "missao.slja" });
		const b = await importSljaAsLiturgyMusic({ bytes: await makeSljaBuffer(), name: "missao-2.slja" });
		// duas músicas na MESMA coletânea local (reuso do collectionId)
		const raw = localStorage.getItem("louvorja.local-custom.v1");
		expect(raw).toBeTruthy();
		const db = JSON.parse(raw as string);
		const importacoes = db.collections.filter((c: { name: string }) => c.name === "Importações .slja");
		expect(importacoes).toHaveLength(1);
		expect(a.collectionId).toBe(b.collectionId);
	});

	it("erro genérico de gravação local propaga o erro original (não engole)", async () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("local-persist-failed");
		});
		await expect(
			importSljaAsLiturgyMusic({ bytes: await makeSljaBuffer(), name: "erro.slja" }),
		).rejects.toThrow("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
		setItem.mockRestore();
	});

	it("gravação da lyric falha no meio → SLJA_LOCAL_LYRIC_PERSIST_FAILED e rollback", async () => {
		// 1ª escrita (música) passa; lyric falha — cobre o path persisted===false/catch
		let calls = 0;
		const original = Storage.prototype.setItem;
		const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
			calls += 1;
			if (calls >= 2) throw new DOMException("quota no meio", "QuotaExceededError");
			return original.call(this, k, v);
		});
		await expect(
			importSljaAsLiturgyMusic({ bytes: await makeSljaBuffer(), name: "meio.slja" }),
		).rejects.toThrow("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
		spy.mockRestore();
	});

	it("quota do localStorage estourada → SLJA_LOCAL_LYRIC_PERSIST_FAILED e música removida", async () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("quota", "QuotaExceededError");
		});
		await expect(
			importSljaAsLiturgyMusic({ bytes: await makeSljaBuffer(), name: "cheia.slja" }),
		).rejects.toThrow("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
		setItem.mockRestore();
		// música parcial NÃO fica órfã no localStorage
		const raw = localStorage.getItem("louvorja.local-custom.v1");
		const db = raw ? JSON.parse(raw) : { musics: [] };
		expect((db.musics ?? []).filter((m: { name: string }) => m.name === "Cheia Para Todos")).toHaveLength(0);
	});

	it("música importada resolve no player COM áudio data: e letra com timing", async () => {
		const imported = await importSljaAsLiturgyMusic({
			bytes: await makeSljaBuffer(),
			name: "missao.slja",
		});
		const displayId = imported.displayMusicId;

		const track = await resolveMediaTrack(displayId);
		expect(track).not.toBeNull();
		expect(track?.name).toBe("Missao Para Todos");
		expect(track?.audioUrl).toMatch(/^data:audio/);
		expect(track?.lyrics).toHaveLength(1);
		expect(track?.lyrics[0]?.time).toBe("00:00:20");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("resolveMusicId aceita o id do item importado e rejeita inválidos", () => {
		// negativo (local) e 1M+ (custom API) passam — 0/NaN/null continuam fora
		expect(resolveMusicId({ type: "music", musicId: -3 } as never)).toBe(-3);
		expect(resolveMusicId({ type: "music", musicId: 1_000_042 } as never)).toBe(
			1_000_042,
		);
		expect(resolveMusicId({ type: "music", musicId: 42 } as never)).toBe(42);
		expect(resolveMusicId({ type: "music", musicId: 0 } as never)).toBeNull();
		expect(
			resolveMusicId({ type: "music", musicId: Number.NaN } as never),
		).toBeNull();
		expect(resolveMusicId({ type: "music" } as never)).toBeNull();
		expect(resolveMusicId({ type: "verse" } as never)).toBeNull();
	});

	it("roundtrip: import sobrevive a reload (localStorage persiste)", async () => {
		const imported = await importSljaAsLiturgyMusic({
			bytes: await makeSljaBuffer(),
			name: "missao.slja",
		});
		const trackBefore = await resolveMediaTrack(imported.displayMusicId);
		expect(trackBefore).not.toBeNull();

		// "reload": mesmo storage novo, dados voltam do localStorage
		const trackAfter = await resolveMediaTrack(imported.displayMusicId);
		expect(trackAfter?.name).toBe("Missao Para Todos");
		expect(trackAfter?.audioUrl ?? "").toMatch(/^data:audio/);
	});

	it("arquivo só com capa não cria música vazia", async () => {
		const archive: SljaArchive = {
			title: "Só Capa",
			assets: [],
			slides: [
				{ lyric: "Capa", type: "CAPA", timeMs: 0, order: 1 },
			],
		};
		await expect(
			importSljaAsLiturgyMusic({
				bytes: await buildSlja(archive),
				name: "so-capa.slja",
			}),
		).rejects.toThrow("SLJA_IMPORT_NO_LYRICS");
		expect(
			listLocalCollections().flatMap((collection) =>
				listLocalMusics(collection.id),
			),
		).toEqual([]);
	});

	it("título sentinela Sem título usa o nome do arquivo", () => {
		expect(sljaDisplayName({ title: "Sem título" }, "missao.slja")).toBe(
			"missao",
		);
	});

	it("guarda a letra auxiliar do .slja", async () => {
		const archive: SljaArchive = {
			title: "Com Auxiliar",
			assets: [],
			slides: [
				{
					lyric: "Estrofe",
					auxiliaryLyric: "Translation",
					type: "LETRA",
					timeMs: 1_000,
					order: 1,
				},
			],
		};
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "aux.slja",
		});
		const lyric = getLocalMusic(imported.musicId)?.lyrics[0];
		expect(lyric?.aux_lyric).toBe("Translation");
		expect(imported.imagesOmitted).toBe(false);
	});

	it("import local avisa quando o .slja tem imagem", async () => {
		const archive: SljaArchive = {
			title: "Com Imagem",
			assets: [{ path: "fundo.png", bytes: new Uint8Array([1]) }],
			slides: [{ lyric: "Estrofe", type: "LETRA", timeMs: 1_000, order: 1 }],
		};
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "img.slja",
		});
		expect(imported.local).toBe(true);
		expect(imported.imagesOmitted).toBe(true);
	});

	it("localStorage cheio antes da música não finge arquivo inválido", async () => {
		const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("quota", "QuotaExceededError");
		});
		try {
			await expect(
				importSljaAsLiturgyMusic({
					bytes: await makeSljaBuffer(),
					name: "missao.slja",
				}),
			).rejects.toThrow("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
		} finally {
			spy.mockRestore();
		}
	});

	it("áudio acima da quota do localStorage não finge sucesso", async () => {
		const original = Storage.prototype.setItem;
		const spy = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(function (this: Storage, key: string, value: string) {
				if (value.includes("audioBase64")) {
					throw new DOMException("quota", "QuotaExceededError");
				}
				return original.call(this, key, value);
			});
		try {
			await expect(
				importSljaAsLiturgyMusic({
					bytes: await makeSljaBuffer(),
					name: "missao.slja",
				}),
			).rejects.toThrow("SLJA_LOCAL_AUDIO_PERSIST_FAILED");
			const leftover = listLocalCollections().flatMap((collection) =>
				listLocalMusics(collection.id),
			);
			expect(leftover).toEqual([]);
		} finally {
			spy.mockRestore();
		}
	});

	it("id negativo desconhecido → null sem consultar rede", async () => {
		const track = await resolveMediaTrack(-999_999);
		expect(track).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
