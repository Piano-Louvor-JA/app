// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * bootstrap-service — pure functions + fluxo first-boot com progresso.
 */

const mocks = vi.hoisted(() => ({
	state: {
		bridge: null as unknown,
		catalog: new Map<string, unknown>(),
		remote: new Map<string, unknown>(),
		savedOk: true,
		lang: "pt",
	},
}));

vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: vi.fn(() => mocks.state.bridge),
}));

vi.mock("@shared/services/remote-catalog", () => ({
	fetchRemoteCatalogJson: vi.fn(async (key: string) => {
		const v = mocks.state.remote.get(key);
		if (v === undefined) throw new Error("Failed to fetch");
		return v;
	}),
}));

vi.mock("@shared/services/workspace-api", () => ({
	clearWorkspace: vi.fn(async () => undefined),
	readCatalogRecord: vi.fn(async (key: string) => mocks.state.catalog.get(key)),
	writeCatalogRecord: vi.fn(async (key: string, value: unknown) => {
		if (!mocks.state.savedOk) return false;
		mocks.state.catalog.set(key, value);
		return true;
	}),
}));

vi.mock("@modules/sync/services/library-catalog", () => ({
	getCurrentApiPrefix: vi.fn(() => mocks.state.lang),
}));

import { WORKSPACE_RECORD_KEYS } from "@shared/constants/storage-keys";
import { clearWorkspace } from "@shared/services/workspace-api";
import {
	isBootstrapComplete,
	mapBootstrapError,
	markBootstrapComplete,
	prepareFreshInstall,
	syncEssentialCatalogFromApi,
	syncRemoteConfig,
} from "../bootstrap-service";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.state.bridge = null;
	mocks.state.catalog.clear();
	mocks.state.remote.clear();
	mocks.state.savedOk = true;
	mocks.state.lang = "pt";
});

describe("mapBootstrapError", () => {
	it.each([
		["Failed to fetch", "starting.status.errorOffline"],
		["NetworkError ao contatar", "starting.status.errorOffline"],
		["HTTP 429 recebido", "starting.status.errorRateLimit"],
		["rate limit atingido", "starting.status.errorRateLimit"],
		["Bridge Electron ausente", "starting.status.bridgeMissing"],
		["serviço indisponível", "starting.status.bridgeMissing"],
		["Falha ao baixar banco", "starting.status.errorDownload"],
		["erro api-fallback", "starting.status.errorDownload"],
		["api-exhausted", "starting.status.errorDownload"],
		["Falha ao extrair pacote", "starting.status.errorExtract"],
		["Arquivo não encontrado no zip", "starting.status.errorExtract"],
		["Servidor retornou erro 500", "starting.status.errorServer"],
		["qualquer coisa", "starting.status.error"],
	])("%s → %s", (message, expected) => {
		expect(mapBootstrapError(new Error(message))).toBe(expected);
	});

	it("não-Error → String(value)", () => {
		expect(mapBootstrapError(42)).toBe("starting.status.error");
		expect(mapBootstrapError("Failed to fetch")).toBe(
			"starting.status.errorOffline",
		);
	});
});

describe("flags de bootstrap", () => {
	it("isBootstrapComplete false sem flag", async () => {
		expect(await isBootstrapComplete()).toBe(false);
	});

	it("isBootstrapComplete true com flag", async () => {
		mocks.state.catalog.set(WORKSPACE_RECORD_KEYS.bootstrapComplete, {
			complete: true,
		});
		expect(await isBootstrapComplete()).toBe(true);
	});

	it("markBootstrapComplete grava a flag", async () => {
		await markBootstrapComplete();
		expect(
			mocks.state.catalog.get(WORKSPACE_RECORD_KEYS.bootstrapComplete),
		).toEqual({
			complete: true,
		});
	});
});

describe("prepareFreshInstall / syncRemoteConfig", () => {
	it("prepareFreshInstall limpa preservando media", async () => {
		await prepareFreshInstall();
		expect(clearWorkspace).toHaveBeenCalledWith({ preserveMedia: true });
	});

	it("syncRemoteConfig baixa e grava config", async () => {
		mocks.state.remote.set(WORKSPACE_RECORD_KEYS.config, { version: 7 });
		await syncRemoteConfig();
		expect(mocks.state.catalog.get(WORKSPACE_RECORD_KEYS.config)).toEqual({
			version: 7,
		});
	});
});

describe("syncEssentialCatalogFromApi", () => {
	it("baixa e grava os 6 índices com progresso até 100", async () => {
		for (const f of [
			"pt_categories",
			"pt_hymnal",
			"pt_hymnal_1996",
			"pt_musics",
			"pt_bible_book",
			"pt_bible_version",
		]) {
			mocks.state.remote.set(f, { ok: true });
		}
		const progress: number[] = [];
		await syncEssentialCatalogFromApi((p) => progress.push(p));
		expect(progress).toEqual([17, 33, 50, 67, 83, 100]);
		expect(mocks.state.catalog.get("pt_categories")).toEqual({ ok: true });
		expect(mocks.state.catalog.get("pt_bible_version")).toEqual({ ok: true });
	});

	it("falha de rede propaga erro mapeável", async () => {
		await expect(syncEssentialCatalogFromApi(() => {})).rejects.toThrow(
			"Failed to fetch",
		);
	});

	it("gravação falha SEM bridge → Bridge Electron indisponível", async () => {
		mocks.state.remote.set("pt_categories", { ok: true });
		mocks.state.savedOk = false;
		await expect(syncEssentialCatalogFromApi(() => {})).rejects.toThrow(
			"Bridge Electron indisponível",
		);
	});

	it("gravação falha COM bridge → erro por arquivo", async () => {
		mocks.state.bridge = { some: true };
		mocks.state.remote.set("pt_categories", { ok: true });
		mocks.state.savedOk = false;
		await expect(syncEssentialCatalogFromApi(() => {})).rejects.toThrow(
				"pt_categories",
			);
		});
		});

		describe("downloadAndExtractCatalog", () => {
		it("deprecada: delega para syncEssentialCatalogFromApi preservando progresso", async () => {
			for (const f of [
				"pt_categories",
				"pt_hymnal",
				"pt_hymnal_1996",
				"pt_musics",
				"pt_bible_book",
				"pt_bible_version",
			]) {
				mocks.state.remote.set(f, { ok: true });
			}
			const { downloadAndExtractCatalog } = await import("../bootstrap-service");
			const progress: number[] = [];
			await downloadAndExtractCatalog(
				(p) => progress.push(p),
				() => {},
			);
			expect(progress).toEqual([17, 33, 50, 67, 83, 100]);
			expect(mocks.state.catalog.get("pt_musics")).toEqual({ ok: true });
		});
		});
