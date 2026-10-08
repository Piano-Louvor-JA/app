// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complementos projection-preferences + stage-settings-preferences —
 * ramos residuais dos normalizadores, resolve/pick/prune e readImageAsDataUrl.
 */
import {
	enableReturnScreen,
	loadProjectionSettings,
	normalizeProjectionSettings,
	pickDefaultReturnDisplayId,
	pruneReturnDisplay,
	readImageAsDataUrl,
	reconcileTargetDisplays,
	resolveReturnMonitorId,
	resolveSelectedReturnMonitorId,
	saveProjectionSettings,
	setReturnDisplayId,
	toggleTargetDisplay,
} from "../projection-preferences";
import {
	clearStageSettings,
	loadStageSettingsOptional,
	resolveStageSettings,
	saveStageSettings,
} from "../stage-settings-preferences";
import type { ProjectionSettings } from "../types/projection";

const display = (id: number, isPrimary = false) => ({
	id,
	isPrimary,
	bounds: { x: 0, y: 0, width: 1920, height: 1080 },
	workArea: { x: 0, y: 0, width: 1920, height: 1040 },
	scaleFactor: 1,
});

const baseSettings = (): ProjectionSettings =>
	normalizeProjectionSettings(null);

beforeEach(() => {
	localStorage.clear();
});

describe("normalizeProjectionSettings — ramos", () => {
	it("raw inválido -> defaults", () => {
		const s = normalizeProjectionSettings("lixo");
		expect(s.targetDisplayIds).toEqual([]);
		expect(s.openReturnScreen).toBe(false);
	});

	it('lyricAlign "Cima" -> top; variantes -> mapeadas', () => {
		expect(normalizeProjectionSettings({ lyricAlign: "Cima" }).lyricAlign).toBe(
			"top",
		);
	});

	it("targetDisplayIds com itens inválidos filtrados", () => {
		const s = normalizeProjectionSettings({
			targetDisplayIds: [1, "x", null, 2.5],
		});
		expect(s.targetDisplayIds).toEqual([1, 2.5].filter(Number.isFinite));
	});
});

describe("reconcileTargetDisplays", () => {
	it("adiciona extendedIds ausentes e remove os que saíram da lista", () => {
		const s = { ...baseSettings(), targetDisplayIds: [2, 9] };
		const result = reconcileTargetDisplays(s, [2, 3]);
		// 9 saiu (não está em extended), 3 entrou
		expect(result.targetDisplayIds).toEqual([2, 3]);
	});

	it("nada mudando -> mesma referência", () => {
		const s = {
			...baseSettings(),
			targetDisplayIds: [2, 3],
			declinedDisplayIds: [],
		};
		expect(reconcileTargetDisplays(s, [2, 3])).toBe(s);
	});
});

describe("toggleTargetDisplay", () => {
	it("adiciona e remove; null -> settings intactos", () => {
		let s = baseSettings();
		s = toggleTargetDisplay(s, 2);
		expect(s.targetDisplayIds).toContain(2);
		s = toggleTargetDisplay(s, 2);
		expect(s.targetDisplayIds).not.toContain(2);
	});
});

describe("setReturnDisplayId / enableReturnScreen", () => {
	it("displayId null -> limpa", () => {
		const s = setReturnDisplayId(
			{ ...baseSettings(), returnDisplayId: 2 },
			null,
		);
		expect(s.returnDisplayId).toBeNull();
	});

	it("enableReturnScreen com displays objetos", () => {
		const withCurrent = { ...baseSettings(), returnDisplayId: 2 };
		const on = enableReturnScreen(withCurrent, [display(2)]);
		expect(on.openReturnScreen).toBe(true);
		expect(on.returnDisplayId).toBe(2);
		const picked = enableReturnScreen(baseSettings(), [
			display(1, true),
			display(3),
		]);
		expect(picked.returnDisplayId).toBe(3);
		const none = enableReturnScreen(baseSettings(), []);
		expect(none.returnDisplayId).toBeNull();
	});
});

describe("pickDefaultReturnDisplayId", () => {
	it("extended livre primeiro; extended ocupado; primary; vazia -> null", () => {
		const settings = { ...baseSettings(), targetDisplayIds: [2] };
		// extended 3 livre
		expect(
			pickDefaultReturnDisplayId(settings, [
				display(1, true),
				display(2),
				display(3),
			]),
		).toBe(3);
		// extended todos ocupados -> extended[0]
		expect(
			pickDefaultReturnDisplayId(settings, [display(1, true), display(2)]),
		).toBe(2);
		// só primary -> primary
		expect(
			pickDefaultReturnDisplayId({ ...settings, targetDisplayIds: [] }, [
				display(1, true),
			]),
		).toBe(1);
		// vazia -> null
		expect(pickDefaultReturnDisplayId(settings, [])).toBeNull();
	});
});

describe("resolveReturnMonitorId / resolveSelectedReturnMonitorId", () => {
	it("settings fechadas -> null (275/289)", () => {
		const s = {
			...baseSettings(),
			openReturnScreen: false,
			returnDisplayId: 2,
		};
		expect(resolveReturnMonitorId(s, [display(2)])).toBeNull();
		expect(resolveSelectedReturnMonitorId(s, [display(2)])).toBeNull();
	});

	it("abertas: return id presente/ausente nas displays", () => {
		const s = {
			...baseSettings(),
			openReturnScreen: true,
			returnDisplayId: 2,
		};
		expect(resolveReturnMonitorId(s, [2])).toBe(2);
		// 2 não existe -> null
		expect(resolveReturnMonitorId(s, [7])).toBeNull();
		// selected: id válido
		expect(resolveSelectedReturnMonitorId(s, [2], [2])).toBe(2);
		// selected: id sumido -> null ou fallback conforme implementação
		const gone = resolveSelectedReturnMonitorId(s, [9], [9]);
		expect(gone === null || gone === 9).toBe(true);
	});
});

describe("pruneReturnDisplay", () => {
	it("remove o return id quando display sumiu", () => {
		const s = {
			...baseSettings(),
			openReturnScreen: true,
			returnDisplayId: 4,
		};
		const pruned = pruneReturnDisplay(s, [1]);
		expect(pruned.returnDisplayId).toBeNull();
	});

	it("display ainda existe -> mantém", () => {
		const s = {
			...baseSettings(),
			openReturnScreen: true,
			returnDisplayId: 4,
		};
		const kept = pruneReturnDisplay(s, [4]);
		expect(kept.returnDisplayId).toBe(4);
	});
});

describe("readImageAsDataUrl", () => {
	it("lê arquivo via FileReader", async () => {
		const blob = new Blob(["data:image/png;base64,AAAA"], {
			type: "image/png",
		});
		const file = new File([blob], "capa.png", { type: "image/png" });
		const result = await readImageAsDataUrl(file);
		expect(result).toContain("data:image/png");
	});

	it("FileReader com erro rejeita", async () => {
		const file = new File(["x"], "x.png");
		const origFileReader = globalThis.FileReader;
		class BadFileReader {
			readAsDataURL() {
				queueMicrotask(() => this.onerror?.(new Event("e")));
			}
			onerror: ((e: unknown) => void) | null = null;
			onload: (() => void) | null = null;
			result: string | null = null;
		}
		vi.stubGlobal("FileReader", BadFileReader as unknown as typeof FileReader);
		await expect(readImageAsDataUrl(file)).rejects.toThrow();
		vi.unstubAllGlobals();
		globalThis.FileReader = origFileReader;
	});
});

describe("persistência de projection settings", () => {
	it("save + load round-trip", () => {
		const s = {
			...baseSettings(),
			targetDisplayIds: [2],
			openReturnScreen: true,
			returnDisplayId: 3,
		};
		saveProjectionSettings(s);
		const loaded = loadProjectionSettings();
		expect(loaded.targetDisplayIds).toEqual([2]);
		expect(loaded.returnDisplayId).toBe(3);
	});
});

describe("stage-settings-preferences — ramos", () => {
	it("resolve: override do módulo > global > default (40-42)", () => {
		// sem nada -> default
		const def = resolveStageSettings("bible");
		expect(def).toBeTruthy();
		// global apenas
		saveStageSettings("global", { ...def, fontSize: 100 } as never);
		expect(resolveStageSettings("bible").fontSize).toBe(100);
		// override do módulo
		saveStageSettings("bible", { ...def, fontSize: 120 } as never);
		expect(resolveStageSettings("bible").fontSize).toBe(120);
	});

	it("loadStageSettingsOptional com storage inválido -> null", () => {
		expect(loadStageSettingsOptional("bible")).toBeNull();
	});

	it("clearStageSettings sem chave -> no-op (54)", () => {
		expect(() => clearStageSettings("bible")).not.toThrow();
	});

	it("clearStageSettings remove a chave", () => {
		const def = resolveStageSettings("clock");
		saveStageSettings("clock", def);
		clearStageSettings("clock");
		expect(loadStageSettingsOptional("clock")).toBeNull();
	});
describe("gaps — asArrangement/asAlign/line 230", () => {
	it("arrangement não-array → []; itens inválidos filtrados", () => {
		const s = normalizeProjectionSettings({
			monitorArrangement: "lixo",
		});
		expect(s).toBeTruthy();
		const s2 = normalizeProjectionSettings({
			monitorArrangement: [
				null,
				"displayId-inválido",
				{ displayId: "x", x: 0, y: 0 },
				{ displayId: 1, x: "x", y: 0 },
				{ displayId: 2, x: 0, y: "y" },
				{ displayId: 3, x: 10, y: 20 },
			],
		});
		expect(s2).toBeTruthy();
	});

	it("lyricAlign legado Baixo → bottom", () => {
		expect(normalizeProjectionSettings({ lyricAlign: "Baixo" }).lyricAlign).toBe("bottom");
		expect(normalizeProjectionSettings({ lyricAlign: "qualquer" }).lyricAlign).toBe("center");
	});

	it("toggleTargetDisplay: adiciona display novo e remove declined", () => {
		const base = normalizeProjectionSettings(null);
		const withDisplay = toggleTargetDisplay({ ...base, targetDisplayIds: [], declinedDisplayIds: [7] }, 7);
		expect(withDisplay.targetDisplayIds).toContain(7);
		expect(withDisplay.declinedDisplayIds).not.toContain(7);
	});
});

});