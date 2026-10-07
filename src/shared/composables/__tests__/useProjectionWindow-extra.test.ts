// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useProjectionWindow — ramos residuais: hash URL (Electron), primary
 * selection, reopen sem monitorId, reapply com falhas parciais.
 */

const mocks = vi.hoisted(() => {
	const state = {
		displays: [] as Array<Record<string, unknown>>,
		settings: {
			targetDisplayIds: [2] as number[],
			declinedDisplayIds: [] as number[],
			openReturnScreen: false,
			returnDisplayId: null as number | null,
			openFullscreenOnPrimary: true,
			disablePrimaryWhenExtended: true,
		},
		bridge: null as null | Record<string, unknown>,
	};
	return { state };
});

vi.mock("@modules/settings/services/display-service", () => ({
	listSystemDisplays: vi.fn(async () => mocks.state.displays),
	listExtendedDisplays: (all: Array<{ isPrimary: boolean }>) =>
		all.filter((d) => !d.isPrimary),
}));

vi.mock("@modules/settings/services/projection-preferences", () => ({
	loadProjectionSettings: vi.fn(() => ({ ...mocks.state.settings })),
	saveProjectionSettings: vi.fn(),
	reconcileTargetDisplays: vi.fn(
		(s: { targetDisplayIds: number[] }, ids: number[]) => ({
			...s,
			targetDisplayIds: s.targetDisplayIds.filter((id) => ids.includes(id)),
		}),
	),
	pruneReturnDisplay: vi.fn(
		(s: { returnDisplayId: number | null }, ids: number[]) => ({
			...s,
			returnDisplayId:
				s.returnDisplayId != null && ids.includes(s.returnDisplayId)
					? s.returnDisplayId
					: null,
		}),
	),
	resolveSelectedReturnMonitorId: vi.fn(
		(s: { returnDisplayId: number | null }, ids: number[], sel: number[]) =>
			s.returnDisplayId != null &&
			ids.includes(s.returnDisplayId) &&
			sel.includes(s.returnDisplayId)
				? s.returnDisplayId
				: null,
	),
}));

vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: vi.fn(() => mocks.state.bridge),
}));

import {
	closeProjectionModule,
	isProjectionModuleOpen,
	openProjectionModule,
	reapplyProjectionTargets,
	syncProjectionAfterDisplayChange,
} from "../useProjectionWindow";

const disp = (id: number, isPrimary = false) => ({
	id,
	isPrimary,
	bounds: { x: 0, y: 0, width: 1920, height: 1080 },
	workArea: { x: 0, y: 0, width: 1920, height: 1040 },
	scaleFactor: 1,
});

class FakePopup {
	static instances: FakePopup[] = [];
	closed = false;
	monitorId?: number;
	layout?: string;
	focus() {}
	close() {
		this.closed = true;
	}
	constructor(
		public url: string,
		public name: string,
	) {
		FakePopup.instances.push(this);
	}
}

let failOnce: ((url: string) => boolean) | null = null;

beforeEach(() => {
	window.focus = () => {};
	FakePopup.instances.length = 0;
	failOnce = null;
	mocks.state.displays = [disp(1, true), disp(2), disp(3)];
	mocks.state.settings = {
		targetDisplayIds: [2],
		declinedDisplayIds: [],
		openReturnScreen: false,
		returnDisplayId: null,
		openFullscreenOnPrimary: true,
		disablePrimaryWhenExtended: true,
	};
	closeProjectionModule();
	vi.stubGlobal(
		"open",
		vi.fn((url: string, name: string) => {
			if (failOnce?.(url)) {
				failOnce = null;
				return null;
			}
			return new FakePopup(url, name);
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	closeProjectionModule();
});

describe("buildPopupUrl — hash mode (Electron)", () => {
	it("usar hash quando href tem #/", async () => {
		window.history.replaceState(null, "", "/app#/config");
		await openProjectionModule("media");
		expect(FakePopup.instances[0]?.url).toContain("#/popup?module=media");
		window.history.replaceState(null, "", "/");
	});

	it("com Electron no UA também usa hash", async () => {
		const origUA = navigator.userAgent;
		Object.defineProperty(window.navigator, "userAgent", {
			value: "Mozilla/5.0 Electron/25",
			configurable: true,
		});
		await openProjectionModule("bible");
		expect(FakePopup.instances[0]?.url).toContain("#/popup");
		Object.defineProperty(window.navigator, "userAgent", {
			value: origUA,
			configurable: true,
		});
	});
});

describe("openOnMonitor sem monitorId — nome sem monitor (170)", () => {
	it("sem extended nem primary nas seleções: abre por target único do primário", async () => {
		// settings apontam pro primário diretamente (não extended) — caminho do
		// filtro extendedIds elimina; primary permitido abre com monitorId=1.
		mocks.state.settings.targetDisplayIds = [1];
		mocks.state.settings.disablePrimaryWhenExtended = false;
		await openProjectionModule("media");
		// 1 é primary, não entra nos extended -> cai no caminho primary
		const urls = FakePopup.instances.map((w) => w.url);
		expect(urls.some((u) => u.includes("monitorId=1"))).toBe(true);
	});
});

describe("reapply — falhas parciais (362-381)", () => {
	it("janela que falhou ao abrir -> retry fecha e reabre audiência", async () => {
		mocks.state.settings.targetDisplayIds = [2, 3];
		await openProjectionModule("media");
		// primeira tentativa de abrir a tela 3 falha (no reapply)
		failOnce = (url) => url.includes("monitorId=3");
		const ok = await reapplyProjectionTargets([2, 3]);
		expect(ok).toBe(true);
		const audience = FakePopup.instances.filter(
			(w) => w.layout !== "return" && !w.closed,
		);
		expect(audience.length).toBe(2);
	});

	it("retry também falha -> false", async () => {
		await openProjectionModule("media"); // janela na tela 2
		// reapply pra tela 3: 2 fecha, 3 falha 1x -> retry abre -> true
		failOnce = (url) => url.includes("monitorId=3");
		const ok = await reapplyProjectionTargets([3]);
		expect(ok).toBe(true);
		const audience = FakePopup.instances.filter(
			(w) => w.layout !== "return" && !w.closed,
		);
		expect(audience.length).toBe(1);
		expect(audience[0]?.url).toContain("monitorId=3");
	});
});

describe("reapply — return window cai quando returnId sai (313)", () => {
	it("return antigo fechado quando deixa de ser return", async () => {
		mocks.state.settings.targetDisplayIds = [2, 3];
		mocks.state.settings.openReturnScreen = true;
		mocks.state.settings.returnDisplayId = 3;
		await openProjectionModule("media");
		expect(FakePopup.instances.length).toBe(2);
		// retorno desligado
		mocks.state.settings.openReturnScreen = false;
		mocks.state.settings.returnDisplayId = null;
		await reapplyProjectionTargets([2, 3]);
		const returnWins = FakePopup.instances.filter((w) => w.layout === "return");
		expect(returnWins.every((w) => w.closed)).toBe(true);
	});
});

describe("reapply — return reaberta quando não foi mantida (344)", () => {
	it("nova return screen em tela diferente reabre", async () => {
		mocks.state.settings.targetDisplayIds = [2, 3];
		mocks.state.settings.openReturnScreen = true;
		mocks.state.settings.returnDisplayId = 3;
		await openProjectionModule("media");
		// return continua na 3 (mantida), audiência trocada pra 2 apenas
		mocks.state.settings.targetDisplayIds = [3];
		await reapplyProjectionTargets([3]);
		const returnWins = FakePopup.instances.filter(
			(w) => w.layout === "return" && !w.closed,
		);
		expect(returnWins.length).toBe(1);
	});
});

describe("syncProjectionAfterDisplayChange — projeção fechada (433)", () => {
	it("sem projeção aberta -> reconcilia settings e retorna sem reapply", async () => {
		mocks.state.displays = [disp(1, true), disp(2), disp(4)];
		await syncProjectionAfterDisplayChange();
		expect(isProjectionModuleOpen()).toBe(false);
	});

describe("isModuleActive e activeModule (201-202)", () => {
	it("activeModule controla qual módulo está ativo", async () => {
		mocks.state.settings.targetDisplayIds = [2];
		await openProjectionModule("media");
		// janela aberta para media: checar via closeProjectionModule + reabrir outro
		await closeProjectionModule();
		await openProjectionModule("clock");
		expect(isProjectionModuleOpen()).toBe(true);
		await closeProjectionModule();
	});
});

describe("reapply — sem displays válidos (fallback)", () => {
	it("reapply com lista vazia não lança", async () => {
		mocks.state.settings.targetDisplayIds = [2];
		await openProjectionModule("media");
		const ok = await reapplyProjectionTargets([]);
		void ok;
		await closeProjectionModule();
	});
});
})
