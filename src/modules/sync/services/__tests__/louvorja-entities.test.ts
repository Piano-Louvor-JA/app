// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: vi.fn(),
	setUserPreference: vi.fn(),
}));

import {
	exportLouvorjaFromBrowser,
	importLouvorjaIntoBrowser,
	SYNC_MODIFIED_PREFIX,
} from "../louvorja-adapter";
import {
	encodeLouvorjaPackage,
	decodeLouvorjaPackage,
} from "../louvorja-package";
import {
	replaceLocalDb,
	loadLocalDb,
} from "@modules/media/services/local-custom-store";
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import { getUserPreference, setUserPreference } from "@shared/services/user-preferences";

const mockGet = vi.mocked(getUserPreference);
const mockSet = vi.mocked(setUserPreference);

const TS_REMOTE = "2026-10-09T12:00:00.000Z";
const TS_OLDER = "2026-10-01T00:00:00.000Z";

const CUSTOM_DB = {
	nextCollectionId: -3,
	nextMusicId: -5,
	nextLyricId: -7,
	collections: [{ id: -1, name: "Coletânea Teste", description: null, createdAt: "2026-10-01T00:00:00.000Z" }],
	musics: [
		{
			id: -1,
			collectionId: -1,
			name: "Hino Sacro",
			audioBase64: "QUJD",
			audioName: "hino.mp3",
			lyrics: [{ id: -1, lyric: "Glória a Deus", order: 1, show_slide: true }],
		},
	],
};

const STAGE_PREF = { bg: 4282139546, fg: 4294967295, size: 96 };

function pkgWith(entities: Record<string, unknown>) {
	return decodeLouvorjaPackage(
		encodeLouvorjaPackage({
			schema: 1,
			appVersion: "test",
			platform: "apk",
			exportedAt: TS_REMOTE,
			entities,
		}),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	replaceLocalDb({
		nextCollectionId: -1,
		nextMusicId: -1,
		nextLyricId: -1,
		collections: [],
		musics: [],
	});
});

describe("entidade mediaCustomCatalog (desktop)", () => {
	it("export inclui db custom quando há coletâneas", () => {
		replaceLocalDb(structuredClone(CUSTOM_DB));

		const pkg = exportLouvorjaFromBrowser("1.0", "desktop");

		const ent = pkg.entities.mediaCustomCatalog;
		expect(ent).toBeDefined();
		expect(ent?.data.db.collections).toHaveLength(1);
		expect(ent?.data.db.musics[0]?.name).toBe("Hino Sacro");
		// binário nunca sai no pacote
		expect(ent?.data.db.musics[0]?.audioBase64).toBeNull();
	});

	it("export NÃO inclui mediaCustomCatalog quando store vazio", () => {
		const pkg = exportLouvorjaFromBrowser("1.0", "desktop");
		expect(pkg.entities.mediaCustomCatalog).toBeUndefined();
	});

	it("import aplica catálogo remoto mais novo (substituição total só da entidade)", () => {
		localStorage.setItem(
			`${SYNC_MODIFIED_PREFIX}.mediaCustomCatalog`,
			TS_OLDER,
		);

		const res = importLouvorjaIntoBrowser(
			pkgWith({
				mediaCustomCatalog: {
					type: "mediaCustomCatalog",
					modified: TS_REMOTE,
					data: { db: CUSTOM_DB },
				},
			}),
		);

		expect(res.applied).toContain("mediaCustomCatalog");
		const db = loadLocalDb();
		expect(db.collections).toEqual(CUSTOM_DB.collections);
		expect(db.nextMusicId).toBe(-5);
		expect(localStorage.getItem(`${SYNC_MODIFIED_PREFIX}.mediaCustomCatalog`)).toBe(TS_REMOTE);
	});

	it("import NÃO apaga áudio local existente (offline-first)", () => {
		localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.mediaCustomCatalog`, TS_OLDER);
		// pacote sem áudio (null após export de outra máquina)
		const remote = structuredClone(CUSTOM_DB);
		remote.musics[0].audioBase64 = null;
		remote.musics[0].audioName = null;
		// mas device local TEM áudio com mesmo id
		replaceLocalDb(structuredClone(CUSTOM_DB));

		const res = importLouvorjaIntoBrowser(
			pkgWith({
				mediaCustomCatalog: {
					type: "mediaCustomCatalog",
					modified: TS_REMOTE,
					data: { db: remote },
				},
			}),
		);

		expect(res.applied).toContain("mediaCustomCatalog");
		expect(loadLocalDb().musics[0].audioBase64).toBe("QUJD");
	});

	it("import pula quando LWW local é mais novo", () => {
		localStorage.setItem(
			`${SYNC_MODIFIED_PREFIX}.mediaCustomCatalog`,
			TS_REMOTE,
		);

		const res = importLouvorjaIntoBrowser(
			pkgWith({
				mediaCustomCatalog: {
					type: "mediaCustomCatalog",
					modified: TS_OLDER,
					data: { db: CUSTOM_DB },
				},
			}),
		);

		expect(res.skipped).toContain("mediaCustomCatalog");
		expect(loadLocalDb().collections).toHaveLength(0);
	});

	it("import pula payload malformado", () => {
		const res = importLouvorjaIntoBrowser(
			pkgWith({
				mediaCustomCatalog: {
					type: "mediaCustomCatalog",
					modified: TS_REMOTE,
					data: { db: { foo: 1 } },
				},
			}),
		);
		expect(res.skipped).toContain("mediaCustomCatalog");
	});
});

describe("entidade preferences (desktop)", () => {
	it("export inclui stage.settings de escopos com override", () => {
		mockGet.mockImplementation((key: string) => {
			if (key === "stage.settings.global") return STAGE_PREF;
			return null;
		});

		const pkg = exportLouvorjaFromBrowser("1.0", "desktop");

		expect(pkg.entities.preferences?.data).toEqual({
			"stage.settings.global": STAGE_PREF,
		});
	});

	it("import aplica allowlist e IGNORA chave fora da lista", () => {
		localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.preferences`, TS_OLDER);

		const res = importLouvorjaIntoBrowser(
			pkgWith({
				preferences: {
					type: "preferences",
					modified: TS_REMOTE,
					data: {
						"stage.settings.hymns": STAGE_PREF,
						"user_data": { hijack: true },
						"stage.settings.evil": { x: 1 },
					},
				},
			}),
		);

		expect(res.applied).toContain("preferences");
		expect(mockSet).toHaveBeenCalledWith("stage.settings.hymns", STAGE_PREF);
		expect(mockSet).not.toHaveBeenCalledWith("user_data", expect.anything());
		expect(mockSet).not.toHaveBeenCalledWith("stage.settings.evil", expect.anything());
	});

	it("import pula quando LWW local mais novo", () => {
		localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.preferences`, TS_REMOTE);

		const res = importLouvorjaIntoBrowser(
			pkgWith({
				preferences: {
					type: "preferences",
					modified: TS_OLDER,
					data: { "stage.settings.global": STAGE_PREF },
				},
			}),
		);

		expect(res.skipped).toContain("preferences");
		expect(mockSet).not.toHaveBeenCalled();
	});

	it("import pula quando nenhuma chave da allowlist existe", () => {
		const res = importLouvorjaIntoBrowser(
			pkgWith({
				preferences: {
					type: "preferences",
					modified: TS_REMOTE,
					data: { unknown: true },
				},
			}),
		);
		expect(res.skipped).toContain("preferences");
	});
});

describe("round-trip desktop → desktop", () => {
	it("export → encode → decode → import reproduz estado igual", () => {
		replaceLocalDb(structuredClone(CUSTOM_DB));
		mockGet.mockImplementation((key: string) => {
			if (key === "stage.settings.global") return STAGE_PREF;
			return null;
		});
		localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.mediaCustomCatalog`, TS_OLDER);
		localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.preferences`, TS_OLDER);

		const exported = exportLouvorjaFromBrowser("1.0", "desktop");
		const raw = encodeLouvorjaPackage(exported);
		const decoded = decodeLouvorjaPackage(raw);
		// Simula chegada posterior do pacote: modified da entidade precisa ser
		// ESTRITAMENTE maior que o LWW local para o import aplicar.
		decoded.entities.mediaCustomCatalog.modified = TS_REMOTE;
		decoded.entities.preferences.modified = TS_REMOTE;

		replaceLocalDb({
			nextCollectionId: -1,
			nextMusicId: -1,
			nextLyricId: -1,
			collections: [],
			musics: [],
		});

		const res = importLouvorjaIntoBrowser(decoded);

		expect(res.applied).toEqual(
			expect.arrayContaining(["mediaCustomCatalog", "preferences"]),
		);
		const db = loadLocalDb();
		expect(db.collections).toEqual(CUSTOM_DB.collections);
		expect(db.musics[0].name).toBe("Hino Sacro");
		expect(mockSet).toHaveBeenCalledWith("stage.settings.global", STAGE_PREF);
	});

	it("schema segue 1 e entidade desconhecida é ignorada", () => {
		const res = importLouvorjaIntoBrowser(
			pkgWith({
				futureEntity: { type: "futureEntity", modified: TS_REMOTE, data: {} },
			}),
		);
		expect(res.applied).toHaveLength(0);
	});
});
