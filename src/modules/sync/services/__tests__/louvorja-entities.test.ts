// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => vi.useRealTimers());

beforeEach(() => {
 vi.useFakeTimers();
 vi.setSystemTime(new Date(TS_OLDER));
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
			}), { catalogReplacementConfirmed: true },
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
			}), { catalogReplacementConfirmed: true },
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
			}), { catalogReplacementConfirmed: true },
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
			}), { catalogReplacementConfirmed: true },
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
			}), { catalogReplacementConfirmed: true },
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
			}), { catalogReplacementConfirmed: true },
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
			}), { catalogReplacementConfirmed: true },
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

		const res = importLouvorjaIntoBrowser(decoded, { catalogReplacementConfirmed: true });

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
			}), { catalogReplacementConfirmed: true },
		);
		expect(res.applied).toHaveLength(0);
	});
});


describe("regressões identificadas na preparação do PR429", () => {
  it("round-trip real sem manipular timestamps aplica em outro aparelho vazio", () => {
    replaceLocalDb(structuredClone(CUSTOM_DB));
    const pkg = decodeLouvorjaPackage(encodeLouvorjaPackage(exportLouvorjaFromBrowser("test", "desktop")));
    localStorage.clear();
    const result = importLouvorjaIntoBrowser(pkg, { catalogReplacementConfirmed: true });
    expect(result.applied).toContain("mediaCustomCatalog");
    expect(loadLocalDb().musics).toHaveLength(1);
  });

  it("importação sem confirmação preserva o catálogo atual", () => {
    const current = structuredClone(CUSTOM_DB);
    current.musics.push({ ...structuredClone(current.musics[0]), id: -2, name: "Hino local que não está no pacote", audioBase64: "REVG" });
    replaceLocalDb(current);
    const incoming = structuredClone(CUSTOM_DB);
    incoming.musics[0].audioBase64 = "";
    const result = importLouvorjaIntoBrowser(pkgWith({ mediaCustomCatalog: { type: "mediaCustomCatalog", modified: TS_REMOTE, data: { db: incoming } } }));
    expect(result.skipped).toContain("mediaCustomCatalog");
    expect(loadLocalDb().musics.some(music => music.id === -2)).toBe(true);
  });
});

import { MEDIA_CUSTOM_BACKUP_KEY, restoreMediaCustomCatalogBackup } from '../media-custom-backup';

describe('substituição confirmada com backup', () => {
 it('substitui e permite restaurar músicas ausentes e áudio depois de recarregar', () => {
  const current = structuredClone(CUSTOM_DB);
  current.musics.push({ ...structuredClone(current.musics[0]), id: -2, name: 'Somente local', audioBase64: 'REVG' });
  replaceLocalDb(current);
  const incoming = structuredClone(CUSTOM_DB);
  incoming.musics[0].audioBase64 = null;
  const result = importLouvorjaIntoBrowser(pkgWith({mediaCustomCatalog:{type:'mediaCustomCatalog',modified:TS_REMOTE,data:{db:incoming}}}), {catalogReplacementConfirmed:true});
  expect(result.applied).toContain('mediaCustomCatalog');
  expect(loadLocalDb().musics).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem(MEDIA_CUSTOM_BACKUP_KEY)!).db).toEqual(current);
  expect(restoreMediaCustomCatalogBackup()).toBe(true);
  expect(loadLocalDb()).toEqual(current);
 });
 it('falha no backup bloqueia qualquer alteração do catálogo', () => {
  replaceLocalDb(structuredClone(CUSTOM_DB));
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
   if(key === MEDIA_CUSTOM_BACKUP_KEY) throw new DOMException('Quota', 'QuotaExceededError');
   original.call(this, key, value);
  });
  try {
   expect(() => importLouvorjaIntoBrowser(pkgWith({mediaCustomCatalog:{type:'mediaCustomCatalog',modified:TS_REMOTE,data:{db:{...CUSTOM_DB,musics:[]}}}}), {catalogReplacementConfirmed:true})).toThrow();
   expect(loadLocalDb()).toEqual(CUSTOM_DB);
  } finally { spy.mockRestore(); }
 });
});
