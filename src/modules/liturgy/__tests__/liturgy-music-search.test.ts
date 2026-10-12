// @vitest-environment jsdom
// app#346 fase 2 da #302: busca fuzzy + busca por trecho da letra.
// Ranking: título (exato) > álbum/número > fuzzy no título > letra.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiturgyMusicOption } from "../../types/liturgy";
import {
	normalizeSearchText,
	levenshteinWithin,
	searchLiturgyMusic,
} from "../services/liturgy-music-search";
import type { MusicSearchEntry } from "../services/liturgy-music-search";

type SearchEntry = LiturgyMusicOption & { lyricsText?: string };

function option(
	id: number,
	name: string,
	overrides: Partial<SearchEntry> = {},
): SearchEntry {
	return {
		id,
		name,
		hymnalTrack: null,
		albumNames: "Coletânea Teste",
		displayLabel: name,
		durationMs: null,
		hasInstrumental: false,
		...overrides,
	};
}

function norm(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

const CATALOG: SearchEntry[] = [
	option(1285, "A Única Esperança", {
		lyricsText: norm(
			"Há um só Deus Uma verdade, uma missão Há um clamor no mundo Por salvação",
		),
	}),
	option(82, "Medley - Quão Bom/Satisfação", { hymnalTrack: 82 }),
	option(2179, "Sangue Precioso De Cristo", {
		lyricsText: norm("Só Cristo pode salvar o pecador"),
	}),
	option(500, "Missao Para Todos", {
		albumNames: "Importações .slja",
	}),
	option(424, "Sublime Graça", {
		hymnalTrack: 424,
		lyricsText: norm("Maravilhosa graça"),
	}),
];

describe("normalizeSearchText (app#346)", () => {
	it("remove acentos, pontuação e normaliza case", () => {
		expect(normalizeSearchText("  A Única, Esperança! ")).toBe(
			"a unica esperanca",
		);
	});
});

describe("levenshteinWithin (early-exit)", () => {
	it("distância dentro do limite", () => {
		expect(levenshteinWithin("esperansa", "esperanca", 1)).toBe(true);
		expect(levenshteinWithin("kitten", "sitten", 1)).toBe(true);
	});
	it("distância acima do limite", () => {
		expect(levenshteinWithin("esperansa", "esperanca", 0)).toBe(false);
		expect(levenshteinWithin("abc", "xyz", 1)).toBe(false);
	});
});

describe("searchLiturgyMusic (app#346)", () => {
	it(" fuzzy troca de letras: 'unica esperansa' acha 'A Única Esperança'", () => {
		const results = searchLiturgyMusic(CATALOG, "unica esperansa");
		expect(results[0]?.id).toBe(1285);
	});

	it("ordem das palavras não importa: 'Esperança unica' também acha", () => {
		const results = searchLiturgyMusic(CATALOG, "Esperança unica");
		expect(results[0]?.id).toBe(1285);
	});

	it("ranking título > número > letra", () => {
		// "424" é número do hino e não aparece em título nem letra
		const byNumber = searchLiturgyMusic(CATALOG, "424");
		expect(byNumber[0]?.id).toBe(424);

		// "graça" está no título de "Sublime Graça" — título vence a letra
		const mixed = searchLiturgyMusic(CATALOG, "graça");
		expect(mixed[0]?.id).toBe(424);
	});

	it("trecho da letra acha a música ('só Cristo')", () => {
		const results = searchLiturgyMusic(CATALOG, "só Cristo");
		expect(results.some((entry) => entry.id === 2179)).toBe(true);
	});

	it("busca exata em título continua funcionando (regressão #302)", () => {
		const results = searchLiturgyMusic(CATALOG, "Missao");
		expect(results[0]?.id).toBe(500);
	});

	it("query vazia não retorna nada", () => {
		expect(searchLiturgyMusic(CATALOG, "   ")).toEqual([]);
	});

	it("sem letra indexada, música não quebra a busca", () => {
		const results = searchLiturgyMusic(CATALOG, "Medley");
		expect(results[0]?.id).toBe(82);
	});

	it("limita a 50 resultados", () => {
		const many = Array.from({ length: 80 }, (_, index) =>
			option(10000 + index, `Hino Esperança ${index}`),
		);
		const results = searchLiturgyMusic(many, "Esperança");
		expect(results.length).toBe(50);
	});
});

// Contrato de integração: loadLiturgyMusicOptions propaga a letra do índice
// pt_musics para as opções (índice título+letra offline).
vi.mock("@shared/services/remote-catalog", () => ({
	fetchRemoteCatalogJson: vi.fn(),
}));
vi.mock("@shared/services/workspace-api", () => ({
	readCatalogRecord: vi.fn(),
}));

import { readCatalogRecord } from "@shared/services/workspace-api";
import { loadLiturgyMusicOptions } from "../services/liturgy-catalog";

const readCatalogRecordMock = vi.mocked(readCatalogRecord);

describe("índice título+letra offline (app#346)", () => {
	beforeEach(() => {
		readCatalogRecordMock.mockReset();
		readCatalogRecordMock.mockResolvedValue([
			{
				id_music: 1285,
				name: "A Única Esperança",
				lyric: "Há um só Deus\r\nUma verdade",
				albums_names: "Hinário Adventista",
				track: 1285,
			},
		]);
	});

	it("loadLiturgyMusicOptions carrega lyric da linha do catálogo", async () => {
		const options = await loadLiturgyMusicOptions();
		const target = options.find((entry) => entry.id === 1285);
		expect(target?.lyricsText).toContain("so deus");
	});
});
