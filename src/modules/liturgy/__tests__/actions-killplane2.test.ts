// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kill plane 2 de liturgy-actions — mutantes de trim em labels e paths.
 * Técnica: fixture name/path com whitespace + asserts no valor EXATO repassado.
 * Import estático + vi.spyOn nos mocks — cada describe seta o mock que precisa.
 */

vi.mock("../../../shared/services/desktop-bridge", () => ({
	getDesktopBridge: vi.fn(() => null),
}));

const openPdf = vi.fn();
const openSite = vi.fn();
const openVideo = vi.fn();
const openImages = vi.fn();

vi.mock("../services/liturgy-web-projection", () => ({
	openLiturgyLocalPdfControl: (...a: unknown[]) => openPdf(...a),
	openLiturgySiteControl: (...a: unknown[]) => openSite(...a),
	openLiturgyVideoControl: (...a: unknown[]) => openVideo(...a),
	openLiturgyLocalImageControl: (...a: unknown[]) => openImages(...a),
}));

vi.mock("./liturgy-web-runtime", () => ({
	publishLiturgyWebRuntime: vi.fn(),
	readLiturgyWebRuntimeFromStorage: vi.fn(() => null),
	parseLiturgyWebTarget: vi.fn(() => ({ kind: "site", url: "u", videoId: "" })),
}));

const mockStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: (key: string) => mockStorage.get(key) ?? null,
		setItem: (key: string, value: string) => void mockStorage.set(key, value),
		removeItem: (key: string) => void mockStorage.delete(key),
		clear: () => void mockStorage.clear(),
	},
	writable: true,
	configurable: true,
});

let originalWindow: Window & typeof globalThis;

const baseMock = () => ({
	platform: "linux",
	isElectron: true,
	externalPlayer: {
		get: vi.fn().mockResolvedValue("vlc"),
		play: vi.fn().mockResolvedValue({ ok: true, player: "vlc" }),
	},
	presentation: {
		getEngine: vi.fn().mockResolvedValue("auto"),
		openExternal: vi.fn().mockResolvedValue({ ok: true }),
		detectOffice: vi.fn().mockResolvedValue(true),
	},
	projection: {
		openUrl: vi.fn().mockResolvedValue(true),
	},
});

async function withBridge(bridge: unknown, fn: () => Promise<void>) {
	const { getDesktopBridge } = await import(
		"../../../shared/services/desktop-bridge"
	);
	vi.mocked(getDesktopBridge).mockReturnValue(bridge as never);
	try {
		await fn();
	} finally {
		vi.mocked(getDesktopBridge).mockReturnValue(null);
	}
}

beforeEach(() => {
	originalWindow = global.window;
	mockStorage.clear();
	vi.clearAllMocks();
	openPdf.mockResolvedValue(true);
	openSite.mockResolvedValue(true);
	openVideo.mockResolvedValue(true);
	openImages.mockResolvedValue(true);
});

afterEach(() => {
	global.window = originalWindow;
});

describe("liturgy-actions kill plane 2 — trim de labels e paths", () => {
	it("pdf: name whitespace-trimado vira label; path trimado (#237/#225)", {
		timeout: 60_000,
	}, async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const item = {
				type: "pdf",
				filePath: "  /docs/Arquivo.pdf  ",
				name: "  PDF Nome  ",
			} as any;
			await executeLiturgyItem(item);
			expect(openPdf).toHaveBeenCalledWith("/docs/Arquivo.pdf", "PDF Nome");
		});
	});

	it("pdf: name whitespace-only cai no filePath (#237 falsy)", async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const item = { type: "pdf", filePath: "/docs/A.pdf", name: "   " } as any;
			await executeLiturgyItem(item);
			expect(openPdf).toHaveBeenCalledWith("/docs/A.pdf", "/docs/A.pdf");
		});
	});

	it("site: name trimado vira label; url trimada (#326-329/#317)", async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const item = {
				type: "site",
				url: "  https://x.com  ",
				name: "  Meu Site  ",
			} as any;
			await executeLiturgyItem(item);
			expect(openSite).toHaveBeenCalledWith("https://x.com", "Meu Site");
		});
	});

	it("site: name whitespace-only cai no rawUrl (#326)", async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const item = { type: "site", url: "https://x.com", name: "   " } as any;
			await executeLiturgyItem(item);
			expect(openSite).toHaveBeenCalledWith("https://x.com", "https://x.com");
		});
	});

	it("online_video: name trimado vira label (#317)", async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const item = {
				type: "online_video",
				url: "  https://y.com/watch?v=1  ",
				name: "  Vídeo  ",
			} as any;
			await executeLiturgyItem(item);
			expect(openVideo).toHaveBeenCalledWith(
				"https://y.com/watch?v=1",
				"Vídeo",
			);
		});
	});

	it("images: filePath única trimada vira paths; name trimado (#23/#211)", async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const item = {
				type: "images",
				filePath: "  /img/A.png  ",
				name: "  Foto  ",
			} as any;
			await executeLiturgyItem(item);
			expect(openImages).toHaveBeenCalledWith(["/img/A.png"], "Foto");
		});
	});

	it("images: sem paths válidos -> erro (#23 trim)", async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const item = { type: "images", filePath: "   " } as any;
			const r = await executeLiturgyItem(item);
			expect(r.ok).toBe(false);
		});
	});

	it("verse: book ou chapter null não navega (#69-75)", async () => {
		await withBridge(baseMock(), async () => {
			const { executeLiturgyItem } = await import(
				"../services/liturgy-actions"
			);
			const router = { push: vi.fn().mockResolvedValue(true) };
			const r1 = await executeLiturgyItem(
				{ type: "verse", verseBookId: null, verseChapter: 2 } as any,
				router as any,
			);
			expect(r1.ok).toBe(true);
			expect(router.push).not.toHaveBeenCalled();
			const r2 = await executeLiturgyItem(
				{ type: "verse", verseBookId: 1, verseChapter: null } as any,
				router as any,
			);
			expect(r2.ok).toBe(true);
			expect(router.push).not.toHaveBeenCalled();
		});
	});
});
