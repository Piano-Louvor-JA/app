// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	loadRandomDisplayConfig,
	loadRandomSession,
	normalizeRandomDisplayConfig,
	normalizeRandomSession,
	RANDOM_CONFIG_CHANNEL,
	saveRandomDisplayConfig,
	saveRandomSession,
} from "../random-preferences";

const mocks = vi.hoisted(() => ({
	getUserPreference: vi.fn<() => unknown>(() => null),
	setUserPreference: vi.fn(),
}));

vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: mocks.getUserPreference,
	setUserPreference: mocks.setUserPreference,
}));

describe("normalizeRandomDisplayConfig", () => {
	it("null/inválido → defaults", () => {
		expect(normalizeRandomDisplayConfig(null)).toBeTruthy();
		expect(normalizeRandomDisplayConfig("x")).toBeTruthy();
	});

	it("normaliza campos válidos", () => {
		const config = normalizeRandomDisplayConfig({
			bgColor: "#112233",
			textColor: "#ffffff",
			fontSizePc: 5.4,
			textTransform: "uppercase",
			animationSpeed: "fast",
			audioSource: "custom",
			customAudioFiles: [" a.mp3 ", "b.mp3", "", 42, "../etc"],
			customAudioFile: "b.mp3",
			audioVolume: "0.5",
			audioMuted: true,
		});
		expect(config.bgColor).toBe("#112233");
		expect(config.textColor).toBe("#ffffff");
		expect(config.fontSizePc).toBe(5);
		expect(config.textTransform).toBe("uppercase");
		expect(config.animationSpeed).toBe("fast");
		expect(config.audioSource).toBe("custom");
		expect(config.customAudioFiles).toEqual(["a.mp3", "b.mp3"]);
		expect(config.customAudioFile).toBe("b.mp3");
		expect(config.audioVolume).toBe(0.5);
		expect(config.audioMuted).toBe(true);
	});

	it("valores inválidos caem nos defaults", () => {
		const config = normalizeRandomDisplayConfig({
			bgColor: 42,
			textColor: "",
			fontSizePc: 999,
			textTransform: "girar",
			animationSpeed: "warp",
			audioSource: "mp3",
			customAudioFile: "com/caminho.mp3",
			audioVolume: 5,
		});
		expect(config.fontSizePc).toBeLessThanOrEqual(14);
		expect(config.audioSource).toBe("default");
		expect(config.audioVolume).toBe(1);
		expect(config.customAudioFile).toBeNull();
	});

	it("legacy background/color são usados como fallback", () => {
		const config = normalizeRandomDisplayConfig({
			background: "#abc",
			color: "#def",
		});
		expect(config.bgColor).toBe("#abc");
		expect(config.textColor).toBe("#def");
	});

	it("customAudioFile legado entra na lista", () => {
		const config = normalizeRandomDisplayConfig({
			customAudioFile: "legado.mp3",
			customAudioFiles: ["novo.mp3"],
		});
		expect(config.customAudioFiles).toContain("legado.mp3");
		expect(config.customAudioFile).toBe("legado.mp3");
	});

	it("customAudioFile legado ausente da lista é adicionado e selecionado", () => {
		const config = normalizeRandomDisplayConfig({
			customAudioFile: "fantasma.mp3",
			customAudioFiles: ["real.mp3"],
		});
		// asCustomAudioFiles faz merge com o legado (unshift), então ele passa a existir
		expect(config.customAudioFiles).toEqual(["fantasma.mp3", "real.mp3"]);
		expect(config.customAudioFile).toBe("fantasma.mp3");
	});

	it("audioMuted só aceita true", () => {
		const off = normalizeRandomDisplayConfig({ audioMuted: false });
		const yes = normalizeRandomDisplayConfig({ audioMuted: true });
		expect(off.audioMuted).toBe(false);
		expect(yes.audioMuted).toBe(true);
	});
});

describe("normalizeRandomSession", () => {
	it("null → defaults com pools vazios", () => {
		const session = normalizeRandomSession(null);
		expect(session.names.available).toEqual([]);
		expect(session.numbers.available).toEqual([]);
	});

	it("formato novo (names/numbers)", () => {
		const session = normalizeRandomSession({
			mode: "numbers",
			names: { available: ["A"], drawn: ["B"], currentDisplay: "A" },
			numbers: { available: ["1"], drawn: [], currentDisplay: "" },
			numberMin: 5,
			numberMax: 50,
		});
		expect(session.mode).toBe("numbers");
		expect(session.names.available).toEqual(["A"]);
		expect(session.numberMin).toBe(5);
		expect(session.numberMax).toBe(50);
	});

	it("formato legado migra para o modo ativo", () => {
		const legacy = normalizeRandomSession({
			mode: "names",
			available: ["João", "Maria"],
			drawn: ["João"],
		});
		expect(legacy.names.available).toEqual(["João", "Maria"]);
		expect(legacy.names.drawn).toEqual(["João"]);
		expect(legacy.numbers.available).toEqual([]);
	});

	it("legado em modo números vai para o bucket numbers", () => {
		const legacy = normalizeRandomSession({
			mode: "numbers",
			available: ["7"],
			drawn: [],
		});
		expect(legacy.numbers.available).toEqual(["7"]);
		expect(legacy.names.available).toEqual([]);
	});

	it("mode inválido vira names", () => {
		const session = normalizeRandomSession({ mode: "letters" });
		expect(session.mode).toBe("names");
	});
});

describe("load/save display config", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("load lê preferência e normaliza", () => {
		mocks.getUserPreference.mockReturnValue({ bgColor: "#fff" });
		const config = loadRandomDisplayConfig();
		expect(config.bgColor).toBe("#fff");
	});

	it("save grava via setUserPreference e broadcasta", () => {
		const postMessage = vi.fn();
		const close = vi.fn();
		vi.stubGlobal(
			"BroadcastChannel",
			class {
				postMessage = postMessage;
				close = close;
			},
		);
		saveRandomDisplayConfig({} as never);
		expect(mocks.setUserPreference).toHaveBeenCalled();
		expect(postMessage).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("save sem BroadcastChannel não quebra", () => {
		vi.stubGlobal("BroadcastChannel", undefined);
		expect(() => saveRandomDisplayConfig({} as never)).not.toThrow();
		vi.unstubAllGlobals();
	});
});

describe("load/save session", () => {
	it("load lê preferência e normaliza", () => {
		mocks.getUserPreference.mockReturnValue({ mode: "numbers" });
		const session = loadRandomSession();
		expect(session.mode).toBe("numbers");
	});

	it("save clona os pools", () => {
		saveRandomSession({
			mode: "names",
			names: { available: ["A"], drawn: [], currentDisplay: "" },
			numbers: { available: [], drawn: [], currentDisplay: "" },
			numberMin: 1,
			numberMax: 10,
		} as never);
		const saved = mocks.setUserPreference.mock.lastCall![1] as {
			names: { available: string[] };
		};
		expect(saved.names.available).toEqual(["A"]);
	});

	it("exporta o nome do canal de broadcast", () => {
		expect(RANDOM_CONFIG_CHANNEL).toBe("louvorja-random-config");
	});
});

describe("normalizeRandomDisplayConfig — ramos residuais", () => {
	it("asModePool com raw inválido → pool vazio (via names inválido)", () => {
		const session = normalizeRandomSession({
			mode: "names",
			names: "corrompido",
			numbers: null,
		});
		expect(session.names.available).toEqual([]);
		expect(session.numbers.available).toEqual([]);
	});

	it("asModePool com currentDisplay não-string vira empty", () => {
		const session = normalizeRandomSession({
			names: { available: ["A"], drawn: [], currentDisplay: 42 },
		});
		expect(session.names.currentDisplay).toBe("");
	});

	it("asAudioVolume com NaN cai no default do config", () => {
		const config = normalizeRandomDisplayConfig({ audioVolume: "abc" });
		expect(config.audioVolume).toBeGreaterThan(0);
		expect(config.audioVolume).toBeLessThanOrEqual(1);
	});
});
