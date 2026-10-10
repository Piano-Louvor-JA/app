// @vitest-environment jsdom
// app#slja-storage — import .slja LOCAL grava blobs em IndexedDB (via
// local-media-store), NÃO em localStorage; quota estourando propaga erro.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAuthSession: vi.fn<() => unknown>(() => null),
	putMedia: vi.fn(),
	getMedia: vi.fn(),
	deleteMedia: vi.fn(),
	parseSljaFile: vi.fn(),
}));

vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: mocks.getAuthSession,
}));

vi.mock("@modules/media/services/local-media-store", () => ({
	putMedia: mocks.putMedia,
	getMedia: mocks.getMedia,
	deleteMedia: mocks.deleteMedia,
}));

import { buildSlja, type SljaArchive } from "@shared/services/slja";
import {
	getLocalMusic,
	listLocalCollections,
	listLocalMusics,
} from "@modules/media/services/local-custom-store";
import { importSljaAsLiturgyMusic } from "../services/import-slja-to-liturgy";

async function makeSljaBuffer(): Promise<ArrayBuffer> {
	const archive: SljaArchive = {
		title: "Encontro Especial",
		audio: { name: "encontro.wav", bytes: new Uint8Array(1024) },
		assets: [{ path: "capa.png", bytes: new Uint8Array(512) }],
		slides: [
			{ lyric: "Bem-vindo", type: "CAPA", timeMs: 0, order: 1 },
			...Array.from({ length: 32 }, (_, i) => ({
				lyric: `Estrofe ${i + 1}`,
				type: "LETRA" as const,
				timeMs: 10_000 * (i + 1),
				order: i + 2,
			})),
		],
	};
	return buildSlja(archive);
}

const REAL_SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("import .slja local — blobs em IndexedDB (não localStorage)", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		mocks.getAuthSession.mockReturnValue(null);
		mocks.putMedia.mockResolvedValue(undefined);
		mocks.getMedia.mockResolvedValue(null);
	});

	it("áudio vai pra IndexedDB com id slja-<hash>-audio (sem base64 no localStorage)", async () => {
		const bytes = await makeSljaBuffer();
		// hash determinístico real (o import usa sha256Hex) — stub via crypto real
		const imported = await importSljaAsLiturgyMusic({
			bytes,
			name: "encontro.slja",
		});

		expect(imported.local).toBe(true);
		expect(imported.hasAudio).toBe(true);
		const hash = imported.sljaHash;

		// putMedia chamado com áudio e capa, ids derivados do hash
		expect(mocks.putMedia).toHaveBeenCalledWith(
			`slja-${hash}-audio`,
			expect.objectContaining({ length: 1024 }),
		);
		expect(mocks.putMedia).toHaveBeenCalledWith(
			`slja-${hash}-cover`,
			expect.objectContaining({ length: 512 }),
		);

		// localStorage: SÓ metadados — nada de base64/dataURL gigantes
		const music = getLocalMusic(imported.musicId);
		expect(music).not.toBeNull();
		expect(music?.audioBase64 ?? null).toBeNull();
		expect(music?.image_url ?? "").not.toMatch(/^data:/);
		expect(music?.audioMediaId).toBe(`slja-${hash}-audio`);
		expect(music?.coverMediaId).toBe(`slja-${hash}-cover`);
		expect(music?.audioName).toBe("encontro.wav");
	});

	it("capa gravada 1× (música) — NÃO repetida por estrofe", async () => {
		const bytes = await makeSljaBuffer();
		const imported = await importSljaAsLiturgyMusic({
			bytes,
			name: "encontro.slja",
		});
		const music = getLocalMusic(imported.musicId);
		expect(music?.lyrics).toHaveLength(32);
		// nenhuma estrofe carrega data: URL da capa
		for (const lyric of music?.lyrics ?? []) {
			expect(lyric.image_url ?? "").not.toMatch(/^data:/);
		}
		// localStorage total bem abaixo de qualquer quota
		const raw = localStorage.getItem("louvorja.local-custom.v1") ?? "";
		expect(raw.length).toBeLessThan(50_000);
	});

	it("re-import do mesmo arquivo é no-op (dedupe por sljaHash)", async () => {
		const bytes = await makeSljaBuffer();
		const first = await importSljaAsLiturgyMusic({
			bytes,
			name: "encontro.slja",
		});
		const second = await importSljaAsLiturgyMusic({
			bytes: await makeSljaBuffer(), // mesmos bytes → mesmo hash
			name: "encontro.slja",
		});

		expect(second.updatedExisting).toBe(true);
		expect(second.musicId).toBe(first.musicId);

		// apenas 1 música na coletânea de imports
		const collections = listLocalCollections();
		const importCollection = collections.find(
			(c) => c.name === "Importações .slja",
		);
		expect(importCollection).toBeDefined();
		expect(listLocalMusics(importCollection!.id)).toHaveLength(1);
	});

	it("quota excedida no localStorage PROPAGA erro (sem sucesso falso)", async () => {
		const bytes = await makeSljaBuffer();
		const original = localStorage.setItem.bind(localStorage);
		localStorage.setItem = vi.fn(() => {
			throw new DOMException("quota", "QuotaExceededError");
		});
		try {
			await expect(
				importSljaAsLiturgyMusic({ bytes, name: "encontro.slja" }),
			).rejects.toThrow();
		} finally {
			localStorage.setItem = original;
		}
	});

	it("legacy: música com audioBase64 inline continua legível (compat)", async () => {
		// grava uma música "pré-fix" direto no formato antigo
		const { createLocalCollection, createLocalMusic, updateLocalMusic } =
			await import("@modules/media/services/local-custom-store");
		const col = createLocalCollection("Legado");
		const music = createLocalMusic(col.id, { name: "Antiga" });
		updateLocalMusic(music.id, { audioBase64: "QUJD", audioName: "a.mp3" });

		const stored = getLocalMusic(music.id);
		expect(stored?.audioBase64).toBe("QUJD"); // não quebrou
	});

	it("updateLocalMusic aceita audioMediaId/coverMediaId (metadados)", async () => {
		const { createLocalCollection, createLocalMusic, updateLocalMusic } =
			await import("@modules/media/services/local-custom-store");
		const col = createLocalCollection("Meta");
		const music = createLocalMusic(col.id, { name: "M" });
		const ok = updateLocalMusic(music.id, {
			audioMediaId: "slja-x-audio",
			coverMediaId: "slja-x-cover",
			audioName: "x.mp3",
		});
		expect(ok).toBe(true);
		expect(getLocalMusic(music.id)?.audioMediaId).toBe("slja-x-audio");
		expect(getLocalMusic(music.id)?.coverMediaId).toBe("slja-x-cover");
	});
});

describe("local-media-store (unit — API shape)", () => {
	it("exporta putMedia/getMedia/deleteMedia", async () => {
		const mod = await import("@modules/media/services/local-media-store");
		expect(typeof mod.putMedia).toBe("function");
		expect(typeof mod.getMedia).toBe("function");
		expect(typeof mod.deleteMedia).toBe("function");
	});
});
