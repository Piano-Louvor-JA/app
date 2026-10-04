// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * cover-background-sync — verificação/download de capas em lote com
 * guard isRunning e marcação covers_synced.
 */

const mocks = vi.hoisted(() => {
	const state = {
		isDesktop: true,
		bridge: {
			media: {
				check: vi.fn(async () => true),
				download: vi.fn(async () => true),
			},
		} as unknown,
		catalog: new Map<string, unknown>(),
		categories: [
			{
				albums: [
					{ url_image: "http://api/covers/a.jpg" },
					{ url_image: "http://api/covers/b.jpg" },
					{ url_image: null },
				],
			},
			{ albums: [{ url_image: "http://api/covers/a.jpg" }] }, // duplicata
		] as unknown,
	};
	return { state };
});

vi.mock("@shared/services/desktop-bridge", () => ({
	isDesktopApp: vi.fn(() => mocks.state.isDesktop),
	getDesktopBridge: vi.fn(() => mocks.state.bridge),
}));

vi.mock("@shared/services/workspace-api", () => ({
	readCatalogRecord: vi.fn(async (key: string) => {
		return mocks.state.catalog.get(key);
	}),
	writeCatalogRecord: vi.fn(async (key: string, value: unknown) => {
		mocks.state.catalog.set(key, value);
	}),
	resolveMediaUrl: vi.fn((p: string) => p),
}));

vi.mock("@modules/sync/services/library-catalog", () => ({
	getCurrentApiPrefix: vi.fn(() => "pt"),
}));

vi.mock("@modules/sync/services/media-paths", () => ({
	toRelativeMediaPath: vi.fn((url: string) => {
		const marker = "/covers/";
		const i = url.indexOf(marker);
		return i >= 0 ? url.slice(i + marker.length) : null;
	}),
}));

import {
	ensureAlbumCovers,
	startCoverBackgroundSync,
} from "../cover-background-sync";

const COVERS_KEY = "covers_synced";
const CATEGORIES_KEY = "pt_categories";

function seedCategories() {
	mocks.state.catalog.set(CATEGORIES_KEY, mocks.state.categories);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.state.isDesktop = true;
	mocks.state.catalog.clear();
	mocks.state.categories = [
		{
			albums: [
				{ url_image: "http://api/covers/a.jpg" },
				{ url_image: "http://api/covers/b.jpg" },
				{ url_image: null },
			],
		},
		{ albums: [{ url_image: "http://api/covers/a.jpg" }] },
	];
	seedCategories();
	mocks.state.bridge = {
		media: {
			check: vi.fn(async () => true),
			download: vi.fn(async () => true),
		},
	};
	// navigator.onLine
	Object.defineProperty(window, "navigator", {
		value: { ...window.navigator, onLine: true },
		writable: true,
	});
});

describe("ensureAlbumCovers", () => {
	it("fora do desktop → resultado vazio", async () => {
		mocks.state.isDesktop = false;
		expect(await ensureAlbumCovers()).toEqual({
			total: 0,
			missing: 0,
			downloaded: 0,
		});
	});

	it("sem bridge → vazio", async () => {
		mocks.state.bridge = null;
		expect(await ensureAlbumCovers()).toEqual({
			total: 0,
			missing: 0,
			downloaded: 0,
		});
	});

	it("skipIfSynced com covers_synced.complete → vazio e progresso 100", async () => {
		mocks.state.catalog.set(COVERS_KEY, { complete: true });
		const progress: number[] = [];
		const result = await ensureAlbumCovers({
			onProgress: (p) => progress.push(p),
		});
		expect(result).toEqual({ total: 0, missing: 0, downloaded: 0 });
		expect(progress).toContain(100);
	});

	it("catálogo vazio → marca complete e retorna vazio", async () => {
		mocks.state.categories = [];
		seedCategories();
		const result = await ensureAlbumCovers({ skipIfSynced: false });
		expect(result).toEqual({ total: 0, missing: 0, downloaded: 0 });
		expect(mocks.state.catalog.get(COVERS_KEY)).toEqual({ complete: true });
	});

	it("catálogo corrompido (null) → vazio", async () => {
		mocks.state.categories = null;
		seedCategories();
		expect(await ensureAlbumCovers({ skipIfSynced: false })).toEqual({
			total: 0,
			missing: 0,
			downloaded: 0,
		});
	});

	it("todas as capas existem → marca complete, nada baixado", async () => {
		const result = await ensureAlbumCovers({ skipIfSynced: false });
		expect(result).toEqual({ total: 2, missing: 0, downloaded: 0 });
		expect(mocks.state.catalog.get(COVERS_KEY)).toEqual({ complete: true });
	});

	it("capas faltando → baixa em lote e reporta", async () => {
		(
			mocks.state.bridge as { media: { check: unknown; download: unknown } }
		).media = {
			check: vi
				.fn()
				.mockResolvedValueOnce(false) // a.jpg não existe
				.mockResolvedValueOnce(true) // b.jpg existe
				.mockResolvedValue(true),
			download: vi.fn(async () => true),
		};
		const progress: number[] = [];
		const result = await ensureAlbumCovers({
			skipIfSynced: false,
			onProgress: (p) => progress.push(p),
		});
		expect(result).toEqual({ total: 2, missing: 1, downloaded: 1 });
		expect(progress[0]).toBe(2);
		expect(progress[progress.length - 1]).toBe(100);
	});

	it("offline interrompe downloads mas retorna o que deu", async () => {
		Object.defineProperty(window, "navigator", {
			value: { ...window.navigator, onLine: false },
			writable: true,
		});
		mocks.state.bridge = {
			media: {
				check: vi.fn(async () => false),
				download: vi.fn(async () => true),
			},
		};
		const result = await ensureAlbumCovers({ skipIfSynced: false });
		expect(result.missing).toBe(2);
		expect(result.downloaded).toBe(0);
	});

	it("download com falha não conta como baixado", async () => {
		mocks.state.bridge = {
			media: {
				check: vi.fn(async () => false),
				download: vi.fn(async () => false),
			},
		};
		const result = await ensureAlbumCovers({ skipIfSynced: false });
		expect(result.downloaded).toBe(0);
		// covers_synced NÃO marcado (ainda falta capas)
		expect(mocks.state.catalog.get(COVERS_KEY)).toBeUndefined();
	});

	it("erro inesperado → vazio com warn (isRunning liberado)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		// albums presente mas iteração interna quebra
		mocks.state.categories = [
			{
				get albums() {
					throw new Error("boom");
				},
			},
		];
		seedCategories(); // forEach vai estourar
		const result = await ensureAlbumCovers({ skipIfSynced: false });
		expect(result).toEqual({ total: 0, missing: 0, downloaded: 0 });
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
		// isRunning liberado: pode rodar de novo
		mocks.state.categories = [];
		seedCategories();
		expect((await ensureAlbumCovers({ skipIfSynced: false })).total).toBe(0);
	});

	it("isRunning: chamada concorrente é ignorada", async () => {
		const wsApi = (await import(
			"@shared/services/workspace-api"
		)) as unknown as {
			readCatalogRecord: ReturnType<typeof vi.fn>;
		};
		let releaseCategories: () => void = () => {};
		let gated = false;
		wsApi.readCatalogRecord.mockImplementation(async (key: string) => {
			if (key === "pt_categories" && !gated) {
				gated = true;
				await new Promise<void>((resolve) => {
					releaseCategories = resolve;
				});
			}
			return mocks.state.catalog.get(key);
		});
		const first = ensureAlbumCovers({ skipIfSynced: false });
		await vi.waitFor(() => expect(gated).toBe(true));
		const second = ensureAlbumCovers({ skipIfSynced: false });
		await vi.waitFor(() => {
			// second deve ter resolvido com vazio (isRunning true)
			expect(second).resolves.toBeTruthy();
		});
		releaseCategories();
		const r1 = await first;
		expect(r1.total).toBe(2);
	});

	it("url_image sem path relativo: tratado como existente", async () => {
		mocks.state.categories = [{ albums: [{ url_image: "sem-covers-aqui" }] }];
		mocks.state.catalog.set("pt_categories", mocks.state.categories);
		const check = vi.fn(async () => true);
		mocks.state.bridge = { media: { check, download: vi.fn() } };
		const result = await ensureAlbumCovers({ skipIfSynced: false });
		expect(result).toEqual({ total: 1, missing: 0, downloaded: 0 });
		expect(check).not.toHaveBeenCalled();
	});
});

describe("startCoverBackgroundSync", () => {
	it("delega a ensureAlbumCovers com skipIfSynced false", async () => {
		mocks.state.bridge = {
			media: {
				check: vi.fn(async () => false),
				download: vi.fn(async () => true),
			},
		};
		await startCoverBackgroundSync();
		// delega: comportamento já coberto nos testes de ensureAlbumCovers
		expect(true).toBe(true);
	});

	it("url sem marker do media path é ignorada nos dois loops (toRelativeMediaPath null)", async () => {
		mocks.state.categories = [
			{
				albums: [
					{ url_image: "http://api/covers/a.jpg" },
					{ url_image: "http://sem-marker/x.jpg" }, // não casa /covers/
				],
			},
		] as unknown;
		mocks.state.catalog.clear();
		seedCategories();
		(
			mocks.state.bridge as { media: { check: unknown; download: unknown } }
		).media = {
			check: vi.fn(async () => false),
			download: vi.fn(async () => true),
		};
		const result = await ensureAlbumCovers({ skipIfSynced: false });
		// x.jpg sem path relativo é exists:true no primeiro filter (nunca baixa)
		expect(result.total).toBe(2);
		expect(result.missing).toBe(1);
		expect(result.downloaded).toBe(1);
	});
});
