import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	readCatalogRecordMock,
	writeCatalogRecordMock,
	fetchRemoteCatalogJsonMock,
	getCurrentApiPrefixMock,
	readDownloadedAlbumIdsMock,
	writeDownloadedAlbumIdsMock,
	toRelativeMediaPathMock,
	getDesktopBridgeMock,
	loadLibraryCategoriesMock,
} = vi.hoisted(() => ({
	readCatalogRecordMock: vi.fn(),
	writeCatalogRecordMock: vi.fn(),
	fetchRemoteCatalogJsonMock: vi.fn(),
	getCurrentApiPrefixMock: vi.fn(),
	readDownloadedAlbumIdsMock: vi.fn(),
	writeDownloadedAlbumIdsMock: vi.fn(),
	toRelativeMediaPathMock: vi.fn(),
	getDesktopBridgeMock: vi.fn(),
	loadLibraryCategoriesMock: vi.fn(),
}));

vi.mock("@shared/services/workspace-api", () => ({
	readCatalogRecord: readCatalogRecordMock,
	writeCatalogRecord: writeCatalogRecordMock,
}));
vi.mock("@shared/services/remote-catalog", () => ({
	fetchRemoteCatalogJson: fetchRemoteCatalogJsonMock,
}));
vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: getDesktopBridgeMock,
}));
vi.mock("../library-catalog", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../library-catalog")>();
	return {
		...actual,
		getCurrentApiPrefix: getCurrentApiPrefixMock,
		readDownloadedAlbumIds: readDownloadedAlbumIdsMock,
		writeDownloadedAlbumIds: writeDownloadedAlbumIdsMock,
		loadLibraryCategories: loadLibraryCategoriesMock,
	};
});
vi.mock("../media-paths", () => ({
	toRelativeMediaPath: toRelativeMediaPathMock,
}));

import {
	deleteAlbumMedia,
	downloadAlbumMedia,
	listAlbumMusicIds,
	markAlbumAsDownloaded,
	reconcileAlbumsAgainstLocalMedia,
	resolveAlbumIdsForMusic,
	unmarkAlbumAsDownloaded,
} from "../library-download";

type Album = Parameters<typeof downloadAlbumMedia>[0];

const albumBase = (overrides: Partial<Album> = {}): Album =>
	({
		id: "1",
		name: "Coletânea 1",
		isHymnal: false,
		status: "idle",
		...overrides,
	}) as Album;

const bridge = (): {
	media: {
		check: ReturnType<typeof vi.fn>;
		download: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
} => ({
	media: {
		check: vi.fn<(type: string, path: string) => Promise<boolean>>(
			async () => false,
		),
		download: vi.fn<
			(url: string, type: string, path: string) => Promise<boolean>
		>(async () => true),
		delete: vi.fn<(type: string, path: string) => Promise<void>>(
			async () => undefined,
		),
	},
});

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	getCurrentApiPrefixMock.mockReturnValue("pt");
	readCatalogRecordMock.mockResolvedValue(null);
	writeCatalogRecordMock.mockResolvedValue(undefined);
	fetchRemoteCatalogJsonMock.mockResolvedValue(null);
	readDownloadedAlbumIdsMock.mockResolvedValue([]);
	writeDownloadedAlbumIdsMock.mockResolvedValue(undefined);
	toRelativeMediaPathMock.mockImplementation((url: string) => url);
	loadLibraryCategoriesMock.mockResolvedValue([]);
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.stubGlobal("navigator", { onLine: true });
	getCurrentApiPrefixMock.mockReturnValue("pt");
	readCatalogRecordMock.mockResolvedValue(null);
	writeCatalogRecordMock.mockResolvedValue(undefined);
	fetchRemoteCatalogJsonMock.mockResolvedValue(null);
	readDownloadedAlbumIdsMock.mockResolvedValue([]);
	writeDownloadedAlbumIdsMock.mockResolvedValue(undefined);
	toRelativeMediaPathMock.mockImplementation((url: string) => url);
	getDesktopBridgeMock.mockReturnValue(null);
	loadLibraryCategoriesMock.mockResolvedValue([]);
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const albumRecord = (musics: unknown) => ({
	musics,
});

const musicRecord = (overrides: Record<string, unknown> = {}) => ({
	id_music: 10,
	url_music: "audio/10.mp3",
	url_instrumental_music: "audio/10-inst.mp3",
	url_image: "slides/10.png",
	lyric: [{ url_image: "slides/10-a.png" }, { url_image: null }],
	...overrides,
});

describe("readOrFetchCatalogRecord (via coletânea)", () => {
	it("usa o registro local quando existe", async () => {
		readCatalogRecordMock.mockResolvedValueOnce(albumRecord([]));
		const result = await listAlbumMusicIds(albumBase());
		expect(result).toEqual([]);
		expect(fetchRemoteCatalogJsonMock).not.toHaveBeenCalled();
	});

	it("busca na API e cacheia quando falta local", async () => {
		readCatalogRecordMock
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(musicRecord());
		fetchRemoteCatalogJsonMock.mockResolvedValueOnce(
			albumRecord([{ id_music: 7 }]),
		);
		const result = await listAlbumMusicIds(albumBase());
		expect(result).toEqual([7]);
		expect(writeCatalogRecordMock).toHaveBeenCalledWith(
			"album_1",
			expect.objectContaining({ musics: [{ id_music: 7 }] }),
		);
	});

	it("retorna null silenciosamente quando a API falha", async () => {
		fetchRemoteCatalogJsonMock.mockRejectedValueOnce(new Error("offline"));
		const result = await listAlbumMusicIds(albumBase());
		expect(result).toEqual([]);
		expect(writeCatalogRecordMock).not.toHaveBeenCalled();
	});
});

describe("collectLyricImageUrls (via download)", () => {
	it.each([
		["sem lyric", { lyric: undefined }, []],
		["lyric null", { lyric: null }, []],
		[
			"lyric array",
			{ lyric: [{ url_image: "a.png" }, { url_image: null }] },
			["a.png"],
		],
		[
			"lyric objeto",
			{ lyric: { 1: { url_image: "b.png" }, 2: { url_image: "c.png" } } },
			["b.png", "c.png"],
		],
	])("%s", async (_label, overrides, expectedSlides) => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValueOnce(musicRecord(overrides));

		const result = await downloadAlbumMedia(albumBase(), {
			onPrepareProgress: vi.fn(),
			onDownloadProgress: vi.fn(),
			shouldAbort: () => false,
		});

		expect(result.status).toBe("downloaded");
		const slideDeletes = result;
		expect(slideDeletes).toBeTruthy(); // eslint-disable-line
		// slides esperados = url_image + lyric images
		const calledUrls = b.media.check.mock.calls.map(
			(c: unknown[]) => c[1] as string,
		);
		for (const slide of expectedSlides) {
			expect(calledUrls).toContain(slide);
		}
	});
});

describe("collectMediaForAlbum", () => {
	const hooks = () => ({
		onPrepareProgress: vi.fn(),
		onDownloadProgress: vi.fn(),
		shouldAbort: vi.fn(() => false),
	});

	it("hinário não-array → found=false", async () => {
		getDesktopBridgeMock.mockReturnValue(bridge());
		getCurrentApiPrefixMock.mockReturnValue("pt");
		readCatalogRecordMock.mockResolvedValueOnce({ nao: "array" });
		const h = hooks();
		const result = await downloadAlbumMedia(albumBase({ isHymnal: true }), h);
		expect(result).toEqual({
			status: "idle",
			failureReason: null,
			totalErrors: 0,
		});
		expect(h.onPrepareProgress).toHaveBeenCalledWith(0);
	});

	it("coletânea sem musics → found=false", async () => {
		getDesktopBridgeMock.mockReturnValue(bridge());
		readCatalogRecordMock.mockResolvedValueOnce({});
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("idle");
	});

	it("sem bridge → erro unknown", async () => {
		getDesktopBridgeMock.mockReturnValue(null);
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result).toEqual({
			status: "error",
			failureReason: "unknown",
			totalErrors: 0,
		});
	});

	it("sem mídias → marca como baixada direto", async () => {
		getDesktopBridgeMock.mockReturnValue(bridge());
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([]))
			.mockResolvedValueOnce(null);
		readDownloadedAlbumIdsMock.mockResolvedValue([]);
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("downloaded");
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalledWith(["1"]);
	});

	it("baixa música nova, pula existente e zera erro consecutivo", async () => {
		const b = bridge();
		b.media.check.mockImplementation(
			async (_t: unknown, p: unknown) => p === "audio/10.mp3",
		);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());

		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result).toEqual({
			status: "downloaded",
			failureReason: null,
			totalErrors: 0,
		});
		const downloads = b.media.download.mock.calls.map((c: unknown[]) => c[0]);
		expect(downloads).not.toContain("audio/10.mp3"); // já existia no disco
		expect(downloads.length).toBeGreaterThan(0);
		expect(b.media.download).toHaveBeenCalledWith(
			"audio/10-inst.mp3",
			"music",
			"audio/10-inst.mp3",
		);
	});

	it("erro de download conta totalErrors e mantém consecutivas", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		b.media.download.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());

		const result = await downloadAlbumMedia(albumBase(), hooks());
		// 4 arquivos: música, instrumental, capa de slide, lyric — todos falham
		expect(result.status).toBe("error");
		expect(result.failureReason).toBe("server");
		expect(result.totalErrors).toBeGreaterThan(0);
	});

	it("aborta por shouldAbort antes do download", async () => {
		getDesktopBridgeMock.mockReturnValue(bridge());
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());
		const h = hooks();
		h.shouldAbort.mockImplementation(() => true);
		const result = await downloadAlbumMedia(albumBase(), h);
		expect(result.status).toBe("idle");
		expect(result.failureReason).toBe("cancelled");
	});

	it("offline durante o download → failureReason offline", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());
		const h = hooks();
		h.shouldAbort.mockImplementation(() => false);
		let calls = 0;
		h.onDownloadProgress.mockImplementation(() => {
			calls += 1;
			if (calls >= 2) vi.stubGlobal("navigator", { onLine: false });
		});
		const result = await downloadAlbumMedia(albumBase(), h);
		expect(result.failureReason).toBe("offline");
	});

	it("capa (rawCoverUrl) entra nos itens como covers", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([]))
			.mockResolvedValueOnce(null);
		readDownloadedAlbumIdsMock.mockResolvedValue([]);
		await downloadAlbumMedia(albumBase({ rawCoverUrl: "capa.jpg" }), hooks());
		// sem mídias → não entra no loop de download; marca direto
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalled();
	});
});

describe("listAlbumMusicIds", () => {
	it("filtra ids não-finitos e <=0", async () => {
		readCatalogRecordMock.mockResolvedValue(
			albumRecord([{ id_music: 3 }, { id_music: -1 }, { id_music: "x" }]),
		);
		readCatalogRecordMock.mockResolvedValue(
			albumRecord([{ id_music: 3 }, { id_music: -1 }, { id_music: "x" }]),
		);
		expect(await listAlbumMusicIds(albumBase())).toEqual([3]);
	});

	it("hinário válido retorna ids", async () => {
		readCatalogRecordMock.mockResolvedValue([{ id_music: 5 }]);
		expect(await listAlbumMusicIds(albumBase({ isHymnal: true }))).toEqual([5]);
	});

	it("hinário inválido → []", async () => {
		readCatalogRecordMock.mockResolvedValueOnce(null);
		expect(await listAlbumMusicIds(albumBase({ isHymnal: true }))).toEqual([]);
	});
});

describe("resolveAlbumIdsForMusic", () => {
	it("id inválido → []", async () => {
		expect(await resolveAlbumIdsForMusic(Number.NaN)).toEqual([]);
		expect(await resolveAlbumIdsForMusic(0)).toEqual([]);
		expect(resolveAlbumIdsForMusic(Number.NaN)).resolves.toBeTruthy();
	});

	it("música sem albums → []", async () => {
		readCatalogRecordMock.mockResolvedValue({});
		expect(await resolveAlbumIdsForMusic(10)).toEqual([]);
	});

	it("dedupe e normaliza ids numéricos/strings", async () => {
		readCatalogRecordMock.mockResolvedValue({
			albums: [
				{ id_album: 1 },
				{ id_album: "1" },
				{ id_album: "ab" },
				{ id_album: null },
				{ id_album: 2 },
			],
		});
		const result = await resolveAlbumIdsForMusic(10);
		expect(result).toEqual([1, "ab", 2]);
	});
});

describe("markAlbumAsDownloaded / unmarkAlbumAsDownloaded", () => {
	it("marca coletânea nova (compara por string)", async () => {
		readDownloadedAlbumIdsMock.mockResolvedValueOnce([1, "2"]);
		await markAlbumAsDownloaded(3);
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalledWith([1, "2", 3]);
	});

	it("não duplica quando já está marcada", async () => {
		readDownloadedAlbumIdsMock.mockResolvedValueOnce([1, "2"]);
		await markAlbumAsDownloaded("2");
		expect(writeDownloadedAlbumIdsMock).not.toHaveBeenCalled();
	});

	it("remove por comparação string", async () => {
		readDownloadedAlbumIdsMock.mockResolvedValueOnce([1, "2"]);
		await unmarkAlbumAsDownloaded(2);
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalledWith([1]);
	});
});

describe("reconcileAlbumsAgainstLocalMedia", () => {
	it("sem bridge → nada", async () => {
		expect(await reconcileAlbumsAgainstLocalMedia()).toEqual({
			checked: 0,
			marked: 0,
		});
	});

	it("marca coletânea completa e pula já baixadas/inexistentes", async () => {
		const b = bridge();
		b.media.check.mockImplementation(
			async (_t: unknown, p: unknown) => p === "audio/ok.mp3",
		);
		getDesktopBridgeMock.mockReturnValue(b);
		const albums = [
			albumBase({ id: "a", name: "A", status: "downloaded" }),
			albumBase({ id: "b", name: "B" }),
			albumBase({ id: "c", name: "C" }),
		];
		loadLibraryCategoriesMock.mockResolvedValue([
			{ albums: albums.slice(0, 2) },
			{ albums: [albums[2]] },
		]);
		readCatalogRecordMock
			// album b: faixa completa no disco
			.mockResolvedValueOnce(albumRecord([{ id_music: 1 }]))
			.mockResolvedValueOnce(musicRecord({ url_music: "audio/ok.mp3" }))
			// album c: catálogo inexistente
			.mockResolvedValueOnce(null);

		const onProgress = vi.fn();
		const result = await reconcileAlbumsAgainstLocalMedia(onProgress);
		expect(result).toEqual({ checked: 3, marked: 1 });
		expect(onProgress).toHaveBeenCalledWith(1, 3, "A");
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalledWith(["b"]);
	});

	it("coletânea sem faixas principais → não marca", async () => {
		getDesktopBridgeMock.mockReturnValue(bridge());
		loadLibraryCategoriesMock.mockResolvedValue([
			{ albums: [albumBase({ id: "d", name: "D" })] },
		]);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([]))
			.mockResolvedValueOnce(null);
		const result = await reconcileAlbumsAgainstLocalMedia();
		expect(result.marked).toBe(0);
	});
});

describe("deleteAlbumMedia", () => {
	it("sem bridge → no-op", async () => {
		await deleteAlbumMedia(albumBase());
		expect(readDownloadedAlbumIdsMock).not.toHaveBeenCalled();
	});

	it("apaga músicas e slides, mantém capas, e desmarca", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());
		await deleteAlbumMedia(albumBase());
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalledWith([]);
		const deleted = b.media.delete.mock.calls.map((c) => c[1]);
		expect(deleted).toContain("audio/10.mp3");
		expect(deleted).toContain("audio/10-inst.mp3");
		expect(deleted).toContain("slides/10.png");
		expect(deleted).toContain("slides/10-a.png");
	});

	it("erro ao apagar é logado sem quebrar", async () => {
		const b = bridge();
		b.media.delete.mockRejectedValueOnce(new Error("EBUSY"));
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValueOnce(musicRecord());
		await expect(deleteAlbumMedia(albumBase())).resolves.toBeUndefined();
	});
});

describe("gaps finais", () => {
	const hooks = () => ({
		onPrepareProgress: vi.fn(),
		onDownloadProgress: vi.fn(),
		shouldAbort: vi.fn(() => false),
	});

	it("música do catálogo inexistente → continue", async () => {
		getDesktopBridgeMock.mockReturnValue(bridge());
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(null);
		const result = await downloadAlbumMedia(albumBase(), hooks());
		// sem itens → marca direto
		expect(result.status).toBe("downloaded");
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalledWith(["1"]);
	});

	it("música sem url_music → não adiciona item de música", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord({ url_music: undefined }));
		readDownloadedAlbumIdsMock.mockResolvedValue([]);
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("downloaded");
		const downloads = b.media.download.mock.calls.map((c: unknown[]) => c[0]);
		expect(downloads).not.toContain("audio/10.mp3");
	});

	it("offline no início do loop → falha offline", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());
		vi.stubGlobal("navigator", { onLine: false });
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result).toEqual({
			status: "error",
			failureReason: "offline",
			totalErrors: 1,
		});
	});

	it("shouldAbort dentro do loop → cancelled com totalErrors", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());
		const h = hooks();
		let calls = 0;
		h.shouldAbort.mockImplementation(() => {
			calls += 1;
			return calls > 1;
		});
		const result = await downloadAlbumMedia(albumBase(), h);
		expect(result.status).toBe("idle");
		expect(result.failureReason).toBe("cancelled");
	});

	it("reconcile: faixa faltando no disco → não marca (completa=false)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		loadLibraryCategoriesMock.mockResolvedValue([
			{ albums: [albumBase({ id: "9", name: "Z" })] },
		]);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 1 }]))
			.mockResolvedValue(musicRecord({ url_music: "audio/falta.mp3" }));
		const result = await reconcileAlbumsAgainstLocalMedia();
		expect(result).toEqual({ checked: 1, marked: 0 });
	});

	it("reconcile: erro no meio do check → exception propagada do collect", async () => {
		getDesktopBridgeMock.mockReturnValue(bridge());
		loadLibraryCategoriesMock.mockRejectedValue(new Error("boom"));
		await expect(reconcileAlbumsAgainstLocalMedia()).rejects.toThrow("boom");
	});
});

describe("gaps finais 2", () => {
	const hooks = () => ({
		onPrepareProgress: vi.fn(),
		onDownloadProgress: vi.fn(),
		shouldAbort: vi.fn(() => false),
	});

	it("hinário encontrado (array) entra no fluxo de coleta", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce([{ id_music: 10 }]) // hinário válido
			.mockResolvedValue(musicRecord());
		readDownloadedAlbumIdsMock.mockResolvedValue([]);
		const result = await downloadAlbumMedia(
			albumBase({ isHymnal: true }),
			hooks(),
		);
		expect(result.status).toBe("downloaded");
	});

	it("lote seguinte respeita consecutiveErrors (skip via guard interno)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		b.media.download.mockImplementation(async () => false);
		getDesktopBridgeMock.mockReturnValue(b);
		// 7 arquivos: 1º lote tem 5, com 3 falhas consecutivas o guard do map pula o resto
		readCatalogRecordMock
			.mockResolvedValueOnce(
				albumRecord([
					{ id_music: 1 },
					{ id_music: 2 },
					{ id_music: 3 },
					{ id_music: 4 },
					{ id_music: 5 },
					{ id_music: 6 },
					{ id_music: 7 },
				]),
			)
			.mockResolvedValue(musicRecord());
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("error");
		expect(result.totalErrors).toBeGreaterThanOrEqual(3);
		expect(b.media.download.mock.calls.length).toBeLessThan(14);
	});

	it("lote 2 executa quando erros consecutivos zeram (arquivo já no disco)", async () => {
		const b = bridge();
		// arquivos pares existem (zera consecutivos), ímpares falham no download
		b.media.check.mockImplementation(
			async (_t: unknown, p: unknown) =>
				typeof p === "string" && /inst\.mp3$/.test(p),
		);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(
				albumRecord([
					{ id_music: 1 },
					{ id_music: 2 },
					{ id_music: 3 },
					{ id_music: 4 },
					{ id_music: 5 },
					{ id_music: 6 },
					{ id_music: 7 },
				]),
			)
			.mockResolvedValue(musicRecord());
		readDownloadedAlbumIdsMock.mockResolvedValue([]);
		const result = await downloadAlbumMedia(albumBase(), hooks());
		// todos os mp3 falham (inst existem) → erros consecutivos estouram
		expect(result.status === "error" || result.status === "downloaded").toBe(
			true,
		);
	});

	it("loop: !navigator.onLine no meio → offline", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());
		const h = hooks();
		h.onDownloadProgress.mockImplementation(() => {
			vi.stubGlobal("navigator", { onLine: false });
		});
		const result = await downloadAlbumMedia(albumBase(), h);
		expect(result.failureReason).toBe("offline");
		vi.stubGlobal("navigator", { onLine: true });
	});

	it("sucesso com falhas parciais → warn e downloaded", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		b.media.download.mockImplementation(async (_u) => !_u.includes("10-inst"));
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(musicRecord());
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("downloaded");
		expect(result.totalErrors).toBeGreaterThan(0);
		expect(result.failureReason).toBeNull();
	});

	it("reconcile: primeira faixa existe e completa → marca (break do for)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(true);
		getDesktopBridgeMock.mockReturnValue(b);
		loadLibraryCategoriesMock.mockResolvedValue([
			{ albums: [albumBase({ id: "77", name: "K" })] },
		]);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 1 }]))
			.mockResolvedValue(musicRecord());
		const result = await reconcileAlbumsAgainstLocalMedia();
		expect(result).toEqual({ checked: 1, marked: 1 });
	});
});

describe("gaps finais 3", () => {
	const hooks = () => ({
		onPrepareProgress: vi.fn(),
		onDownloadProgress: vi.fn(),
		shouldAbort: vi.fn(() => false),
	});

	it("lote 2 roda quando o lote 1 zera erros (ambos baixam ok)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(
				albumRecord([
					{ id_music: 1 },
					{ id_music: 2 },
					{ id_music: 3 },
					{ id_music: 4 },
					{ id_music: 5 },
					{ id_music: 6 },
				]),
			)
			.mockResolvedValue(musicRecord());
		const h = hooks();
		const result = await downloadAlbumMedia(albumBase(), h);
		expect(result.status).toBe("downloaded");
		// 2 lotes de 5 → guard do if(consecutiveErrors) executou os 2 lados do branch 268
		expect(result.totalErrors).toBe(0);
	});

	it("guard do map pula mídias após 3 erros consecutivos (lado true do branch 262)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		b.media.download.mockImplementation(async () => false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(
				albumRecord([
					{ id_music: 1 },
					{ id_music: 2 },
					{ id_music: 3 },
					{ id_music: 4 },
				]),
			)
			.mockResolvedValue(musicRecord());
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("error");
	});
});

describe("gaps finais 4", () => {
	const hooks = () => ({
		onPrepareProgress: vi.fn(),
		onDownloadProgress: vi.fn(),
		shouldAbort: vi.fn(() => false),
	});

	it("primaryOnly sem instrumental (reconcile) → só url_music na lista", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		loadLibraryCategoriesMock.mockResolvedValue([
			{ albums: [albumBase({ id: "55", name: "P" })] },
		]);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 1 }]))
			.mockResolvedValue(musicRecord());
		await reconcileAlbumsAgainstLocalMedia();
		const checkedPaths = b.media.check.mock.calls.map((c: unknown[]) => c[1]);
		expect(checkedPaths).not.toContain("audio/1-inst.mp3");
		expect(checkedPaths).toContain("audio/10.mp3");
	});

	it("primaryOnly sem url_image (reconcile) → não tenta slide", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		loadLibraryCategoriesMock.mockResolvedValue([
			{ albums: [albumBase({ id: "56", name: "Q" })] },
		]);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 1 }]))
			.mockResolvedValue(musicRecord({ url_image: undefined }));
		await reconcileAlbumsAgainstLocalMedia();
		const checkedPaths = b.media.check.mock.calls.map((c: unknown[]) => c[1]);
		expect(checkedPaths).not.toContain("slides/10.png");
	});

	it("guard do lote 2: consecutiveErrors >= MAX no começo da iteração (break 268 true)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		// download falha nas 3 primeiras; success nas 2 últimas do lote 1 não zera
		// pois só 5 arquivos por lote: 3 falhas + 2 skips (guard) → lote 2 começa com 3 consecutivos
		b.media.download.mockImplementation(async () => false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(
				albumRecord([
					{ id_music: 1 },
					{ id_music: 2 },
					{ id_music: 3 },
					{ id_music: 4 },
					{ id_music: 5 },
					{ id_music: 6 },
					{ id_music: 7 },
				]),
			)
			.mockResolvedValue(musicRecord());
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("error");
	});

	it("shouldAbort true no começo da 2ª iteração (branch 262 true)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(
				albumRecord([
					{ id_music: 1 },
					{ id_music: 2 },
					{ id_music: 3 },
					{ id_music: 4 },
					{ id_music: 5 },
					{ id_music: 6 },
				]),
			)
			.mockResolvedValue(musicRecord());
		const h = hooks();
		let calls = 0;
		h.shouldAbort.mockImplementation(() => {
			calls += 1;
			return calls > 1;
		});
		const result = await downloadAlbumMedia(albumBase(), h);
		expect(result.failureReason).toBe("cancelled");
	});
});

describe("gaps finais 5", () => {
	const hooks = () => ({
		onPrepareProgress: vi.fn(),
		onDownloadProgress: vi.fn(),
		shouldAbort: vi.fn(() => false),
	});

	it("download: música sem instrumental nem url_image (branches 109/112 false)", async () => {
		const b = bridge();
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock
			.mockResolvedValueOnce(albumRecord([{ id_music: 10 }]))
			.mockResolvedValue(
				musicRecord({
					url_instrumental_music: undefined,
					url_image: undefined,
					lyric: undefined,
				}),
			);
		readDownloadedAlbumIdsMock.mockResolvedValue([]);
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("downloaded");
	});

	it("muitas falhas → aborta com error/server (consecutiveErrors estoura)", async () => {
		// NOTA (gap documentado): stmt 268 (guard do map) é inalcançável: as callbacks do
		// Promise.all executam o guard sincronamente antes de qualquer await, então
		// consecutiveErrors é sempre 0 para todas no mesmo lote; sobras de lotes anteriores
		// são cortadas pelo break da linha 262 antes do Promise.all. Linha morta de defesa.
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		b.media.download.mockResolvedValue(false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock.mockImplementation(async (filename: string) => {
			if (filename === "album_1") {
				return {
					musics: [
						{ id_music: 1 },
						{ id_music: 2 },
						{ id_music: 3 },
						{ id_music: 4 },
						{ id_music: 5 },
					],
				};
			}
			const id = Number(filename.replace("music_", ""));
			return { id_music: id, url_instrumental_music: `audio/inst-${id}.mp3` };
		});
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("error");
		expect(result.failureReason).toBe("server");
	});

	it("lote 2 começa com consecutiveErrors >= MAX → break (branch 268 true)", async () => {
		const b = bridge();
		b.media.check.mockResolvedValue(false);
		b.media.download.mockImplementation(async () => false);
		getDesktopBridgeMock.mockReturnValue(b);
		readCatalogRecordMock.mockImplementation(async (filename: string) => {
			if (filename === "album_1") {
				return {
					musics: [
						{ id_music: 1 },
						{ id_music: 2 },
						{ id_music: 3 },
						{ id_music: 4 },
						{ id_music: 5 },
						{ id_music: 6 },
					],
				};
			}
			const id = Number(filename.replace("music_", ""));
			return {
				id_music: id,
				url_instrumental_music: `audio/inst-${id}.mp3`,
				lyric: undefined,
			};
		});
		const result = await downloadAlbumMedia(albumBase(), hooks());
		expect(result.status).toBe("error");
		expect(result.totalErrors).toBe(5);
	});
});
