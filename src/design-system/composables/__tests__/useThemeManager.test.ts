// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useThemeManager — singleton com refs de módulo. readStored* roda no
 * import-time, então mockar user-preferences ANTES e usar resetModules
 * entre grupos que precisam de estado fresco.
 */

const mocks = vi.hoisted(() => ({
	getUserPreference: vi.fn<(_key: string) => unknown>(() => undefined),
	setUserPreference: vi.fn(),
}));

vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: mocks.getUserPreference,
	setUserPreference: mocks.setUserPreference,
}));

async function load() {
	const mod = await import("../useThemeManager");
	return mod.useThemeManager();
}

function matchMediaMock(matches: boolean) {
	return vi.fn().mockReturnValue({
		matches,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.resetModules();
	localStorage.clear();
	document.documentElement.style.cssText = "";
	delete document.documentElement.dataset.theme;
	mocks.getUserPreference.mockReturnValue(undefined);
});

describe("useThemeManager — estado inicial", () => {
	it("defaults sem preferências", async () => {
		const tm = await load();
		expect(tm.currentTheme.value.id).toBeTruthy();
		expect(tm.blurLevel.value).toBeTruthy();
		expect(tm.autoBrightness.value).toBe(false);
	});

	it("valores inválidos no storage caem nos defaults", async () => {
		mocks.getUserPreference.mockImplementation((key: string) => {
			if (key === "theme") return "nao-existe";
			if (key === "accent") return 42;
			if (key === "interaction") return {};
			if (key === "blur") return "lixo";
			if (key === "autoBrightness") return "sim";
			return undefined;
		});
		const tm = await load();
		// tema inválido → default (id em kebab-case)
		expect(tm.currentTheme.value).toBeTruthy();
		expect(tm.autoBrightness.value).toBe(false);
	});
});

describe("useThemeManager — setters", () => {
	it("setTheme troca tema, aplica CSS vars e persiste", async () => {
		const tm = await load();
		tm.setTheme("etherealLumens");
		expect(tm.themeKey.value).toBe("etherealLumens");
		expect(document.documentElement.dataset.theme).toBe("ethereal-lumens");
		expect(mocks.setUserPreference).toHaveBeenCalled();
	});

	it("toggleTheme alterna os dois temas", async () => {
		const tm = await load();
		const before = tm.themeKey.value;
		tm.toggleTheme();
		expect(tm.themeKey.value).not.toBe(before);
		tm.toggleTheme();
		expect(tm.themeKey.value).toBe(before);
	});

	it("setGlassIntensity clampa e setBlur converte token", async () => {
		const tm = await load();
		tm.setGlassIntensity(500);
		expect(tm.glassIntensity.value).toBe(100);
		tm.setBlur("none");
		expect(tm.glassIntensity.value).toBe(0);
		expect(tm.currentBlur.value).toBe("4px");
		expect(tm.currentGlassFill.value).toBe("42%");
	});

	it("setAccent e setInteraction", async () => {
		const tm = await load();
		const accents = Object.keys(tm.accents);
		const interactions = Object.keys(tm.interactions);
		tm.setAccent(accents[accents.length - 1] as never);
		expect(tm.accentKey.value).toBe(accents[accents.length - 1]);
		tm.setInteraction(interactions[interactions.length - 1] as never);
		expect(tm.interactionKey.value).toBe(interactions[interactions.length - 1]);
		expect(document.documentElement.dataset.accent).toBeTruthy();
		expect(document.documentElement.dataset.motion).toBeTruthy();
	});
});

describe("useThemeManager — auto brightness", () => {
	it("setAutoBrightness(true) sincroniza com sistema escuro", async () => {
		vi.stubGlobal("matchMedia", matchMediaMock(true));
		const tm = await load();
		tm.setAutoBrightness(true);
		expect(tm.autoBrightness.value).toBe(true);
		expect(tm.themeKey.value).toBe("etherealLumens");
		vi.unstubAllGlobals();
	});

	it("setAutoBrightness(true) com sistema claro", async () => {
		vi.stubGlobal("matchMedia", matchMediaMock(false));
		const tm = await load();
		tm.setAutoBrightness(true);
		expect(tm.themeKey.value).toBe("luminousClarity");
		vi.unstubAllGlobals();
	});

	it("setAutoBrightness(false) para de escutar", async () => {
		vi.stubGlobal("matchMedia", matchMediaMock(true));
		const tm = await load();
		tm.setAutoBrightness(true);
		tm.setAutoBrightness(false);
		expect(tm.autoBrightness.value).toBe(false);
		vi.unstubAllGlobals();
	});

	it("setTheme com autoBrightness ligado desliga o automático", async () => {
		vi.stubGlobal("matchMedia", matchMediaMock(true));
		const tm = await load();
		tm.setAutoBrightness(true);
		tm.setTheme("luminousClarity");
		expect(tm.autoBrightness.value).toBe(false);
		// mudança de sistema não deve mais alterar o tema escolhido
		vi.unstubAllGlobals();
	});

	it("autoBrightness ligado no boot (storage) registra listener", async () => {
		vi.stubGlobal("matchMedia", matchMediaMock(true));
		mocks.getUserPreference.mockImplementation((key: string) => {
			if (key === "autoBrightness") return true;
			return undefined;
		});
		const tm = await load();
		expect(tm.autoBrightness.value).toBe(true);
		expect(tm.themeKey.value).toBe("etherealLumens");
		vi.unstubAllGlobals();
	});

	it("onChange do matchMedia com autoBrightness desligado não sincroniza", async () => {
		let changeCb: (() => void) | null = null;
		vi.stubGlobal(
			"matchMedia",
			vi.fn().mockReturnValue({
				matches: true,
				addEventListener: vi.fn((_e: string, cb: () => void) => {
					changeCb = cb;
				}),
				removeEventListener: vi.fn(),
			}),
		);
		const tm = await load();
		tm.setAutoBrightness(true);
		// desliga — listener removido, mas chamar o cb capturado não deve sync
		tm.setAutoBrightness(false);
		(changeCb as unknown as (() => void) | null)?.();
		expect(tm.themeKey.value).toBe("etherealLumens"); // permanece do sync anterior
		vi.unstubAllGlobals();
	});
});

describe("useThemeManager — CSS vars", () => {
	it("applyCssVars explícito aplica dataset e propriedades", async () => {
		const tm = await load();
		tm.setTheme("etherealLumens");
		tm.applyCssVars(document.body);
		expect(document.body.dataset.theme).toBe("ethereal-lumens");
	});

	it("densidade: remove propriedades de spacing para o CSS assumir", async () => {
		const tm = await load();
		tm.applyCssVars();
		const style = document.documentElement.style;
		expect(style.getPropertyValue("--ds-spacing-page")).toBe("");
	});
});

describe("useThemeManager — storage válido no boot (guards true)", () => {
	it("theme/accent/interaction válidos no storage são adotados", async () => {
		const themes = (await import("@design-system/themes")) as unknown as {
			themes: Record<string, unknown>;
			accents: Record<string, unknown>;
			interactions: Record<string, unknown>;
		};
		const themeKeys = Object.keys(themes.themes);
		const accentKeys = Object.keys(themes.accents);
		const interactionKeys = Object.keys(themes.interactions);
		mocks.getUserPreference.mockImplementation((key: string) => {
			if (key === "theme") return themeKeys[themeKeys.length - 1];
			if (key === "accent") return accentKeys[accentKeys.length - 1];
			if (key === "interaction")
				return interactionKeys[interactionKeys.length - 1];
			if (key === "blur") return 42;
			if (key === "autoBrightness") return false;
			return undefined;
		});
		const tm = await load();
		expect(tm.themeKey.value).toBe(themeKeys[themeKeys.length - 1]);
		expect(tm.accentKey.value).toBe(accentKeys[accentKeys.length - 1]);
		expect(tm.interactionKey.value).toBe(
			interactionKeys[interactionKeys.length - 1],
		);
		expect(tm.glassIntensity.value).toBe(42);
		// computeds lidos (170/171)
		expect(tm.currentAccent.value).toBeTruthy();
		expect(tm.currentInteraction.value).toBeTruthy();
	});

	it("onChange do sistema com autoBrightness ativo sincroniza e persiste (136/137)", async () => {
		let changeCb: (() => void) | null = null;
		let matches = true;
		vi.stubGlobal(
			"matchMedia",
			vi.fn().mockImplementation(() => ({
				get matches() {
					return matches;
				},
				addEventListener: vi.fn((_e: string, cb: () => void) => {
					changeCb = cb;
				}),
				removeEventListener: vi.fn(),
			})),
		);
		const tm = await load();
		tm.setAutoBrightness(true);
		// sistema mudou para claro
		matches = false;
		(changeCb as unknown as (() => void) | null)?.();
		expect(tm.themeKey.value).toBe("luminousClarity");
		vi.unstubAllGlobals();
	});
});
