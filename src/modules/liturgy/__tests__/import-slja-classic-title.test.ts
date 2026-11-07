// @vitest-environment jsdom
// .slja clássico (Delphi) não grava `titulo` em [Geral]: o título da música
// é a letra da CAPA. Import local precisa usar esse título — e corrigir a
// música já importada com o nome do arquivo, sem pisar em renomeação manual.
import { zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: () => null,
}));

vi.mock("@modules/media/services/local-media-store", () => ({
	putMedia: vi.fn(async () => undefined),
	getMedia: vi.fn(async () => null),
	deleteMedia: vi.fn(async () => undefined),
}));

import { sha256Hex } from "@shared/services/content-hash";
import {
	createLocalCollection,
	createLocalLyric,
	createLocalMusic,
	getLocalMusic,
} from "@modules/media/services/local-custom-store";
import { importSljaAsLiturgyMusic } from "../services/import-slja-to-liturgy";

const FILE_NAME = "doxologia sem imagem.slja";

function classicSlja(): ArrayBuffer {
	const ini = [
		"[Geral]",
		"slides=3",
		"versao=2.0",
		"[Slide:1]",
		"tipo=CAPA",
		"letra=Doxologia|Hinario Adventista",
		"[Slide:2]",
		"tipo=LETRA",
		"letra=A Deus, supremo Benfeitor",
		"tempo=00:05",
		"[Slide:3]",
		"tipo=LETRA",
		"letra=Anjos e homens dando louvor",
		"tempo=00:10",
		"",
	].join("\n");
	const zipped = zipSync({ "slides.lja": new TextEncoder().encode(ini) });
	return zipped.buffer.slice(
		zipped.byteOffset,
		zipped.byteOffset + zipped.byteLength,
	) as ArrayBuffer;
}

async function seedPreviousImport(name: string): Promise<number> {
	const bytes = classicSlja();
	const sljaHash = await sha256Hex(new Uint8Array(bytes));
	const collection = createLocalCollection("Importações .slja");
	const music = createLocalMusic(collection.id, { name, sljaHash });
	createLocalLyric(music.id, { lyric: "A Deus, supremo Benfeitor" });
	createLocalLyric(music.id, { lyric: "Anjos e homens dando louvor" });
	return music.id;
}

describe("import .slja clássico — título vem da CAPA", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("música nova recebe o título da CAPA, não o nome do arquivo", async () => {
		const imported = await importSljaAsLiturgyMusic({
			bytes: classicSlja(),
			name: FILE_NAME,
		});

		expect(imported.name).toBe("Doxologia");
		expect(getLocalMusic(imported.musicId)?.name).toBe("Doxologia");
	});

	it("re-import corrige música antiga salva com o nome do arquivo", async () => {
		const id = await seedPreviousImport("doxologia sem imagem");

		const imported = await importSljaAsLiturgyMusic({
			bytes: classicSlja(),
			name: FILE_NAME,
		});

		expect(imported.musicId).toBe(id);
		expect(imported.updatedExisting).toBe(true);
		expect(imported.name).toBe("Doxologia");
		expect(getLocalMusic(id)?.name).toBe("Doxologia");
	});

	it("re-import não sobrescreve nome renomeado pelo usuário", async () => {
		const id = await seedPreviousImport("Doxologia (coral)");

		const imported = await importSljaAsLiturgyMusic({
			bytes: classicSlja(),
			name: FILE_NAME,
		});

		expect(imported.name).toBe("Doxologia (coral)");
		expect(getLocalMusic(id)?.name).toBe("Doxologia (coral)");
	});
});
