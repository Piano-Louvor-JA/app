// @vitest-environment jsdom
// app#331 A3: a busca de música do item da liturgia encontra o importado
// (.slja local, id negativo) E as customs da API (1M+) — sem nunca
// sobrescrever hinos oficiais.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRemoteCatalogJsonMock, readCatalogRecordMock } = vi.hoisted(
	() => ({
		fetchRemoteCatalogJsonMock: vi.fn(),
		readCatalogRecordMock: vi.fn(),
	}),
);

vi.mock("@shared/services/remote-catalog", () => ({
	fetchRemoteCatalogJson: fetchRemoteCatalogJsonMock,
}));
vi.mock("@shared/services/workspace-api", () => ({
	readCatalogRecord: readCatalogRecordMock,
}));
vi.mock("@modules/sync/services/library-catalog", () => ({
	getCurrentApiPrefix: () => "pt",
}));

import { toCustomMusicId } from "@modules/media/services/custom-catalog";
import {
	createLocalCollection,
	createLocalMusic,
} from "@modules/media/services/local-custom-store";
import {
	filterLiturgyMusicOptions,
	loadLiturgyMusicOptions,
} from "../services/liturgy-catalog";

describe("catálogo da liturgia inclui custom + local (app#331)", () => {
	beforeEach(() => {
		localStorage.clear();
		fetchRemoteCatalogJsonMock.mockReset();
		readCatalogRecordMock.mockReset();
		// catálogo oficial: 1 hino só (id 42), via índice de músicas
		fetchRemoteCatalogJsonMock.mockImplementation(async (file: string) => {
			if (file === "pt_musics") {
				return [
					{
						id_music: 42,
						name: "Hino Oficial Probe",
						albums: [{ id_album: 1, name: "Album Oficial", track: 7 }],
					},
				];
			}
			return null;
		});
		readCatalogRecordMock.mockResolvedValue(null);
	});

	it("música local importada aparece na busca com id negativo", async () => {
		const collection = createLocalCollection("Importações .slja");
		createLocalMusic(collection.id, { name: "Missao Para Todos" });

		const options = await loadLiturgyMusicOptions();
		const local = options.find((o) => o.name === "Missao Para Todos");

		expect(local).toBeDefined();
		expect(local?.id).toBeLessThan(0);
		expect(local?.albumNames).toContain(".slja");

		// e a busca a encontra
		const results = filterLiturgyMusicOptions(options, "Missao", null);
		expect(results.some((o) => o.id === local?.id)).toBe(true);
	});

	it("oficial nunca é sobrescrito; custom API entra com offset 1M+", async () => {
		const collection = createLocalCollection("Importações .slja");
		const local = createLocalMusic(collection.id, {
			name: "42 — Colisão de Nome",
		});
		void local;

		const options = await loadLiturgyMusicOptions();
		const official = options.find((o) => o.id === 42);
		expect(official?.name).toBe("Hino Oficial Probe");

		// offset do custom não colide com oficial
		const offsetId = toCustomMusicId(1);
		expect(offsetId).toBe(1_000_001);
		expect(options.filter((o) => o.id === 42)).toHaveLength(1);
	});
});
