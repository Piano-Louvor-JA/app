import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	readCatalogRecordMock,
	writeCatalogRecordMock,
	fetchRemoteCatalogJsonMock,
	readDownloadedAlbumIdsMock,
	writeDownloadedAlbumIdsMock,
	getDesktopBridgeMock,
} = vi.hoisted(() => ({
	readCatalogRecordMock: vi.fn(),
	writeCatalogRecordMock: vi.fn(),
	fetchRemoteCatalogJsonMock: vi.fn(),
	readDownloadedAlbumIdsMock: vi.fn(),
	writeDownloadedAlbumIdsMock: vi.fn(),
	getDesktopBridgeMock: vi.fn(),
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
vi.mock("@shared/services/telemetry", () => ({ reportError: vi.fn() }));
vi.mock("../library-catalog", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../library-catalog")>();
	return {
		...actual,
		getCurrentApiPrefix: () => "pt",
		readDownloadedAlbumIds: readDownloadedAlbumIdsMock,
		writeDownloadedAlbumIds: writeDownloadedAlbumIdsMock,
	};
});
vi.mock("../media-paths", () => ({
	toRelativeMediaPath: (url: string) => url,
}));

import { downloadAlbumMedia } from "../library-download";

type Album = Parameters<typeof downloadAlbumMedia>[0];

const album = { id: "1", name: "Coletânea 1", isHymnal: false, status: "idle" } as Album;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const flush = async (rounds = 10) => {
	for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};

const hooks = () => ({
	onPrepareProgress: vi.fn(),
	onDownloadProgress: vi.fn(),
	shouldAbort: vi.fn(() => false),
});

/** Coletânea com N faixas, cada uma só com o áudio vocal `audio/{id}.mp3`. */
function catalogWithSongs(count: number) {
	const ids = Array.from({ length: count }, (_, i) => i + 1);
	readCatalogRecordMock.mockImplementation(async (filename: string) => {
		if (filename === "album_1") return { musics: ids.map((id) => ({ id_music: id })) };
		const id = Number(filename.replace(/^music_/, ""));
		return { id_music: id, url_music: `audio/${id}.mp3` };
	});
	return ids;
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.stubGlobal("navigator", { onLine: true });
	vi.stubGlobal("window", {});
	writeCatalogRecordMock.mockResolvedValue(true);
	readDownloadedAlbumIdsMock.mockResolvedValue([]);
	writeDownloadedAlbumIdsMock.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("downloadAlbumMedia — preparação em paralelo", () => {
	it("busca até 6 fichas de música ao mesmo tempo e mantém a ordem das faixas", async () => {
		const pending = new Map<string, ReturnType<typeof deferred<unknown>>>();
		readCatalogRecordMock.mockImplementation((filename: string) => {
			if (filename === "album_1") {
				return Promise.resolve({
					musics: Array.from({ length: 10 }, (_, i) => ({ id_music: i + 1 })),
				});
			}
			const d = deferred<unknown>();
			pending.set(filename, d);
			return d.promise;
		});
		const download = vi.fn(async () => true);
		getDesktopBridgeMock.mockReturnValue({
			media: { check: vi.fn(async () => false), download, delete: vi.fn() },
		});

		const run = downloadAlbumMedia(album, hooks());
		await flush();
		expect(pending.size).toBe(6);

		// responde na ordem inversa: a lista final continua na ordem das faixas
		const answered = new Set<string>();
		while (answered.size < 10) {
			const open = [...pending.keys()].filter((f) => !answered.has(f)).reverse();
			for (const filename of open) {
				const id = Number(filename.replace(/^music_/, ""));
				answered.add(filename);
				pending.get(filename)!.resolve({ id_music: id, url_music: `audio/${id}.mp3` });
			}
			await flush();
		}

		await expect(run).resolves.toMatchObject({ status: "downloaded" });
		expect(download.mock.calls.map((c) => c[0])).toEqual(
			Array.from({ length: 10 }, (_, i) => `audio/${i + 1}.mp3`),
		);
	});

	it("progresso de preparação vai de 0 a 10% conforme as fichas chegam", async () => {
		catalogWithSongs(4);
		getDesktopBridgeMock.mockReturnValue({
			media: { check: vi.fn(async () => true), download: vi.fn(), delete: vi.fn() },
		});
		const h = hooks();
		await downloadAlbumMedia(album, h);
		const values = h.onPrepareProgress.mock.calls.map((c) => c[0]);
		expect(values[0]).toBe(0);
		expect(values.at(-1)).toBe(10);
		expect(values).toEqual([...values].sort((a, b) => a - b));
	});
});

describe("downloadAlbumMedia — downloads contínuos", () => {
	it("mantém 5 downloads simultâneos e começa o próximo assim que um termina", async () => {
		catalogWithSongs(7);
		const inFlight = new Map<string, ReturnType<typeof deferred<boolean>>>();
		const download = vi.fn((url: string) => {
			const d = deferred<boolean>();
			inFlight.set(url, d);
			return d.promise;
		});
		getDesktopBridgeMock.mockReturnValue({
			media: { check: vi.fn(async () => false), download, delete: vi.fn() },
		});

		const run = downloadAlbumMedia(album, hooks());
		await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(5));
		await flush(30);
		expect(download).toHaveBeenCalledTimes(5);

		inFlight.get("audio/1.mp3")!.resolve(true);
		await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(6));
		expect(download.mock.calls.at(-1)![0]).toBe("audio/6.mp3");

		for (const d of inFlight.values()) d.resolve(true);
		await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(7));
		for (const d of inFlight.values()) d.resolve(true);

		await expect(run).resolves.toEqual({
			status: "downloaded",
			failureReason: null,
			totalErrors: 0,
		});
	});

	it("não inicia novos arquivos depois de 3 falhas seguidas", async () => {
		catalogWithSongs(12);
		const inFlight: Array<ReturnType<typeof deferred<boolean>>> = [];
		const download = vi.fn(() => {
			const d = deferred<boolean>();
			inFlight.push(d);
			return d.promise;
		});
		getDesktopBridgeMock.mockReturnValue({
			media: { check: vi.fn(async () => false), download, delete: vi.fn() },
		});

		const run = downloadAlbumMedia(album, hooks());
		await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(5));
		for (const d of inFlight.slice(0, 3)) d.resolve(false);
		await flush(30);
		for (const d of inFlight.slice(3)) d.resolve(false);

		await expect(run).resolves.toMatchObject({
			status: "error",
			failureReason: "server",
			totalErrors: 5,
		});
		expect(download).toHaveBeenCalledTimes(5);
	});

	it("offline conta um único erro mesmo com vários downloads em paralelo", async () => {
		catalogWithSongs(8);
		getDesktopBridgeMock.mockReturnValue({
			media: { check: vi.fn(async () => false), download: vi.fn(async () => true), delete: vi.fn() },
		});
		vi.stubGlobal("navigator", { onLine: false });

		await expect(downloadAlbumMedia(album, hooks())).resolves.toEqual({
			status: "error",
			failureReason: "offline",
			totalErrors: 1,
		});
	});
});

describe("downloadAlbumMedia — arquivos já no disco", () => {
	it("consulta o disco em lote e baixa só o que falta", async () => {
		catalogWithSongs(4);
		const check = vi.fn(async () => false);
		const checkMany = vi.fn(async (_type: string, names: string[]) =>
			Object.fromEntries(
				names.map((name) => [name, name === "audio/2.mp3" || name === "audio/4.mp3" ? `local://media/music/${name}` : false]),
			),
		);
		const download = vi.fn(async () => true);
		getDesktopBridgeMock.mockReturnValue({
			media: { check, checkMany, download, delete: vi.fn() },
		});
		const h = hooks();

		await expect(downloadAlbumMedia(album, h)).resolves.toMatchObject({ status: "downloaded" });

		expect(checkMany).toHaveBeenCalledTimes(1);
		expect(checkMany).toHaveBeenCalledWith("music", [
			"audio/1.mp3",
			"audio/2.mp3",
			"audio/3.mp3",
			"audio/4.mp3",
		]);
		expect(check).not.toHaveBeenCalled();
		expect(download.mock.calls.map((c) => c[0])).toEqual(["audio/1.mp3", "audio/3.mp3"]);
		expect(h.onDownloadProgress).toHaveBeenCalledWith(2, 4, 55);
		expect(h.onDownloadProgress).toHaveBeenLastCalledWith(4, 4, 100);
	});

	it("se a checagem em lote falhar, checa arquivo a arquivo", async () => {
		catalogWithSongs(2);
		const check = vi.fn(async (_type: string, name: string) => name === "audio/1.mp3");
		const download = vi.fn(async () => true);
		getDesktopBridgeMock.mockReturnValue({
			media: { check, checkMany: vi.fn(async () => { throw new Error("ipc"); }), download, delete: vi.fn() },
		});

		await expect(downloadAlbumMedia(album, hooks())).resolves.toMatchObject({ status: "downloaded" });
		expect(check).toHaveBeenCalledTimes(2);
		expect(download.mock.calls.map((c) => c[0])).toEqual(["audio/2.mp3"]);
	});

	it("tudo já no disco marca como baixada sem nenhum download", async () => {
		catalogWithSongs(3);
		const checkMany = vi.fn(async (_type: string, names: string[]) =>
			Object.fromEntries(names.map((name) => [name, `local://media/music/${name}`])),
		);
		const download = vi.fn(async () => true);
		getDesktopBridgeMock.mockReturnValue({
			media: { check: vi.fn(), checkMany, download, delete: vi.fn() },
		});

		await expect(downloadAlbumMedia(album, hooks())).resolves.toMatchObject({ status: "downloaded" });
		expect(download).not.toHaveBeenCalled();
		expect(writeDownloadedAlbumIdsMock).toHaveBeenCalledWith(["1"]);
	});
});
