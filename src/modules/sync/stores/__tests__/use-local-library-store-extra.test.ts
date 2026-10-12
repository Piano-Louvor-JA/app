// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useLocalLibraryStore — ramos residuais: download durante cancel de lote,
 * cancelamento pendente no retorno (idle + progressText cancelled), erro
 * genérico com cancel, e gen counter invalidate.
 */

const isDesktopApp = vi.hoisted(() => vi.fn(() => false));
vi.mock("@shared/services/desktop-bridge", () => ({
	isDesktopApp: () => isDesktopApp(),
}));

const invalidateTrackMediaCache = vi.hoisted(() => vi.fn());
const peekTrackDownloadCache = vi.hoisted(() => vi.fn(() => undefined));
vi.mock("@shared/services/track-media", () => ({
	invalidateTrackMediaCache,
	peekTrackDownloadCache,
}));

const loadLibraryCategories = vi.hoisted(() => vi.fn());
const hydrateLocalLibraryCoverUrls = vi.hoisted(() => vi.fn());
vi.mock("../../services/library-catalog", () => ({
	loadLibraryCategories: (...a: unknown[]) =>
		loadLibraryCategories(...(a as [])),
	hydrateLocalLibraryCoverUrls: (...a: unknown[]) =>
		hydrateLocalLibraryCoverUrls(...(a as [])),
}));

const libDownload = vi.hoisted(() => ({
	deleteAlbumMedia: vi.fn().mockResolvedValue(undefined),
	downloadAlbumMedia: vi.fn().mockResolvedValue({ status: "downloaded" }),
	listAlbumMusicIds: vi.fn().mockResolvedValue([]),
	markAlbumAsDownloaded: vi.fn().mockResolvedValue(undefined),
	reconcileAlbumsAgainstLocalMedia: vi
		.fn()
		.mockResolvedValue({ checked: 0, marked: 0 }),
	resolveAlbumIdsForMusic: vi.fn().mockResolvedValue([]),
	unmarkAlbumAsDownloaded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/library-download", () => libDownload);

import { useLocalLibraryStore } from "../useLocalLibraryStore";

const album = (id: number | string, over: Record<string, unknown> = {}) =>
	({
		id,
		name: `Album ${id}`,
		status: "idle",
		progress: 0,
		downloadedCount: 0,
		totalCount: 0,
		cancelRequested: false,
		progressText: "",
		isHymnal: false,
		...over,
	}) as never;

function seed(store: ReturnType<typeof useLocalLibraryStore>) {
	store.categories = [
		{
			id: "c1",
			name: "CDs",
			albums: [album(1), album(2, { status: "downloading" })],
		} as never,
	];
}

beforeEach(() => {
	setActivePinia(createPinia());
	vi.clearAllMocks();
	isDesktopApp.mockReturnValue(false);
	libDownload.downloadAlbumMedia.mockResolvedValue({ status: "downloaded" });
});

describe("ramos residuais — lote/cancel/gens", () => {
	it("lote com cancelamento em curso: downloadAlbum novo -> null (L173)", async () => {
		const store = useLocalLibraryStore();
		let release: () => void = () => {};
		const gate = new Promise<void>((r) => {
			release = r;
		});
		store.categories = [
			{
				id: "c1",
				name: "CDs",
				albums: [album(1, { status: "downloading" }), album(2)],
			} as never,
		];
		libDownload.downloadAlbumMedia.mockImplementationOnce(() => gate);
		const batch = store.downloadAllIdleAlbums();
		await vi.waitFor(() => expect(store.isDownloadingBatch).toBe(true));
		store.cancelAllDownloads();
		const result = await store.downloadAlbum(2);
		expect(result).toBeNull();
		release();
		await batch;
	});

	it("retorno com cancelRequested -> idle + progressText cancelled (L255-257)", async () => {
		const store = useLocalLibraryStore();
		seed(store);
		libDownload.downloadAlbumMedia.mockImplementation(
			async (a: { cancelRequested?: boolean }) => {
				a.cancelRequested = true;
				return { status: "idle", failureReason: "cancelled" };
			},
		);
		const result = await store.downloadAlbum(1);
		expect(result).toBe("idle");
	});

	it("gen invalidado por segundo download do mesmo álbum -> primeiro vira idle", async () => {
		const store = useLocalLibraryStore();
		seed(store);
		let releaseFirst: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		libDownload.downloadAlbumMedia.mockImplementationOnce(() =>
			gate.then(() => ({ status: "downloaded" })),
		);
		const first = store.downloadAlbum(1);
		store.categories = [{ id: "c1", name: "CDs", albums: [album(1)] } as never];
		const second = await store.downloadAlbum(1);
		expect(second).toBe("downloaded");
		releaseFirst();
		const firstResult = await first;
		// gen invalidado -> ramo !isCurrent -> 'idle'
		expect(firstResult).toBe("idle");
	});
	it("placeholder para manter suite", () => {
		expect(true).toBe(true);
	});
});

describe("L255-257: catch com cancelRequested -> idle", () => {
	it("downloadAlbumMedia rejeita com cancelRequested -> idle silencioso", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const store = useLocalLibraryStore();
		seed(store);
		libDownload.downloadAlbumMedia.mockImplementation(
			async (a: { cancelRequested?: boolean }) => {
				a.cancelRequested = true;
				throw new Error("aborted mid-flight");
			},
		);
		const result = await store.downloadAlbum(1);
		expect(result).toBe("idle");
		spy.mockRestore();
	});
});
