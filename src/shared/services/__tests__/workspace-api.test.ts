// @vitest-environment jsdom
/// <reference types="vitest" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getBrowserItem: vi.fn<(...args: unknown[]) => unknown>(() => null),
	setBrowserItem: vi.fn(),
	getDesktopBridge: vi.fn(),
	isDesktopApp: vi.fn(() => false),
}));

vi.mock("@shared/services/browser-storage", () => ({
	getBrowserItem: mocks.getBrowserItem,
	setBrowserItem: mocks.setBrowserItem,
}));
vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: mocks.getDesktopBridge,
	isDesktopApp: mocks.isDesktopApp,
}));

import {
	clearWorkspace,
	readCatalogRecord,
	resolveDatabaseUrl,
	resolveMediaUrl,
	writeCatalogRecord,
} from "../workspace-api";

const bridge = () => ({
	workspace: {
		getRecord: vi.fn(async () => null),
		saveRecord: vi.fn(async () => true),
		clear: vi.fn(async () => true),
	},
});

describe("readCatalogRecord", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.getBrowserItem.mockReturnValue(null);
		mocks.getDesktopBridge.mockReturnValue(null);
	});

	it("sem cache e sem bridge → null", async () => {
		expect(await readCatalogRecord("album_1")).toBeNull();
	});

	it("cache hit não consulta o bridge", async () => {
		mocks.getBrowserItem.mockReturnValue({ cached: true });
		const result = await readCatalogRecord("album_1");
		expect(result).toEqual({ cached: true });
		expect(mocks.getDesktopBridge).not.toHaveBeenCalled();
	});

	it("lê do bridge e cacheia quando data não é null", async () => {
		const b = bridge();
		b.workspace.getRecord.mockResolvedValue({ music: "data" });
		mocks.getDesktopBridge.mockReturnValue(b);
		const result = await readCatalogRecord("music_10");
		expect(result).toEqual({ music: "data" });
		expect(mocks.setBrowserItem).toHaveBeenCalled();
	});

	it("não cacheia quando o bridge retorna null", async () => {
		const b = bridge();
		mocks.getDesktopBridge.mockReturnValue(b);
		const result = await readCatalogRecord("music_404");
		expect(result).toBeNull();
		expect(mocks.setBrowserItem).not.toHaveBeenCalled();
	});
});

describe("writeCatalogRecord", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("sem bridge → false", async () => {
		expect(await writeCatalogRecord("album_1", { a: 1 })).toBe(false);
	});

	it("grava via bridge e cacheia", async () => {
		const b = bridge();
		mocks.getDesktopBridge.mockReturnValue(b);
		expect(await writeCatalogRecord("album_1", { a: 1 })).toBe(true);
		expect(mocks.setBrowserItem).toHaveBeenCalled();
	});

	it("falha de gravação não cacheia e retorna false", async () => {
		const b = bridge();
		b.workspace.saveRecord.mockResolvedValue(false);
		mocks.getDesktopBridge.mockReturnValue(b);
		expect(await writeCatalogRecord("album_1", { a: 1 })).toBe(false);
		expect(mocks.setBrowserItem).not.toHaveBeenCalled();
	});
});

describe("clearWorkspace", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("sem bridge → false", async () => {
		expect(await clearWorkspace()).toBe(false);
	});

	it("com bridge delega a chamada", async () => {
		const b = bridge();
		mocks.getDesktopBridge.mockReturnValue(b);
		expect(await clearWorkspace({ preserveMedia: true })).toBe(true);
		expect(b.workspace.clear).toHaveBeenCalledWith({ preserveMedia: true });
	});
});

describe("resolveMediaUrl", () => {
	it("desktop usa protocolo local://", () => {
		mocks.isDesktopApp.mockReturnValue(true);
		expect(resolveMediaUrl("audio/10.mp3")).toBe("local://media/audio/10.mp3");
	});

	it("desktop normaliza barra inicial", () => {
		mocks.isDesktopApp.mockReturnValue(true);
		expect(resolveMediaUrl("/audio/10.mp3")).toBe("local://media/audio/10.mp3");
	});

	it("web usa base da API", () => {
		mocks.isDesktopApp.mockReturnValue(false);
		expect(resolveMediaUrl("slides/1.png")).toBe(
			"https://api.pianolouvorja.com.br/file/slides/1.png",
		);
	});

	it("web respeita VITE_URL_FILES definido", () => {
		mocks.isDesktopApp.mockReturnValue(false);
		(import.meta.env as Record<string, string>).VITE_URL_FILES =
			"https://cdn.test/file";
		expect(resolveMediaUrl("/slides/1.png")).toBe(
			"https://cdn.test/file/slides/1.png",
		);
		delete (import.meta.env as Record<string, string>).VITE_URL_FILES;
	});
});

describe("resolveDatabaseUrl", () => {
	it("usa default da API", () => {
		expect(resolveDatabaseUrl("album_1.json")).toBe(
			"https://api.pianolouvorja.com.br/json_db/album_1.json",
		);
	});

	it("normaliza barra inicial duplicada", () => {
		expect(resolveDatabaseUrl("/album_1.json")).toBe(
			"https://api.pianolouvorja.com.br/json_db/album_1.json",
		);
	});

	it("VITE_URL_DATABASE com barra final é normalizada", () => {
		(import.meta.env as Record<string, string>).VITE_URL_DATABASE =
			"https://cdn.test/db/";
		expect(resolveDatabaseUrl("/album_1.json")).toBe(
			"https://cdn.test/db/album_1.json",
		);
		delete (import.meta.env as Record<string, string>).VITE_URL_DATABASE;
	});
});

describe("resolveMediaUrl — ramos VITE_URL_FILES", () => {
	it("web sem VITE_URL_FILES usa default", () => {
		mocks.isDesktopApp.mockReturnValue(false);
		delete (import.meta.env as Record<string, unknown>).VITE_URL_FILES;
		expect(resolveMediaUrl("slides/2.png")).toBe(
			"https://api.pianolouvorja.com.br/file/slides/2.png",
		);
	});

	it("desktop sem barra inicial", () => {
		mocks.isDesktopApp.mockReturnValue(true);
		expect(resolveMediaUrl("slides/2.png")).toBe("local://media/slides/2.png");
	});
});

describe("resolveDatabaseUrl — sem barra final", () => {
	it("base sem barra final normaliza path com barra", () => {
		delete (import.meta.env as Record<string, unknown>).VITE_URL_DATABASE;
		expect(resolveDatabaseUrl("x.json")).toBe(
			"https://api.pianolouvorja.com.br/json_db/x.json",
		);
	});
});
