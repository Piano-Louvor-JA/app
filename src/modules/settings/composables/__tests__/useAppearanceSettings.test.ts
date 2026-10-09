// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useAppearanceSettings — fachada sobre useThemeManager + useBlurSystem.
 * Moca os dois composables (dependências pesadas) e verifica o mapeamento
 * mode↔theme e a delegação dos setters.
 */

const mocks = vi.hoisted(() => {
	const state = {
		themeKey: { value: "luminousClarity" as string },
		currentTheme: { value: { mode: "light", id: "luminous-clarity" } },
		setTheme: (key: string) => {
			state.themeKey.value = key;
			state.currentTheme.value = {
				mode: key === "etherealLumens" ? "dark" : "light",
				id: key,
			};
		},
		accentKey: { value: "blue" as string },
		currentAccent: { value: { id: "blue" } },
		setAccent: vi.fn(),
		interactionKey: { value: "smooth" as string },
		currentInteraction: { value: { id: "smooth" } },
		setInteraction: vi.fn(),
		autoBrightness: { value: false },
		setAutoBrightness: vi.fn(),
		glassIntensity: { value: 60 },
		blurLevel: { value: "medium" as string },
		currentBlur: { value: "18px" },
		currentGlassFill: { value: "62%" },
		backdropFilter: { value: "blur(18px)" },
		setBlurLevel: vi.fn(),
		setGlassIntensity: vi.fn((v: number) => {
			state.glassIntensity.value = v;
		}),
	};
	return { state };
});

vi.mock("@design-system/composables", () => ({
	useThemeManager: () => ({
		themeKey: mocks.state.themeKey,
		currentTheme: mocks.state.currentTheme,
		setTheme: mocks.state.setTheme,
		accentKey: mocks.state.accentKey,
		currentAccent: mocks.state.currentAccent,
		accents: { blue: {}, green: {} },
		setAccent: mocks.state.setAccent,
		interactionKey: mocks.state.interactionKey,
		currentInteraction: mocks.state.currentInteraction,
		interactions: { smooth: {}, snappy: {} },
		setInteraction: mocks.state.setInteraction,
		autoBrightness: mocks.state.autoBrightness,
		setAutoBrightness: mocks.state.setAutoBrightness,
	}),
	useBlurSystem: () => ({
		glassIntensity: mocks.state.glassIntensity,
		blurLevel: mocks.state.blurLevel,
		currentBlur: mocks.state.currentBlur,
		currentGlassFill: mocks.state.currentGlassFill,
		backdropFilter: mocks.state.backdropFilter,
		blurTokens: ["none", "low", "medium", "high"],
		setBlurLevel: mocks.state.setBlurLevel,
		setGlassIntensity: mocks.state.setGlassIntensity,
	}),
}));

import { useAppearanceSettings } from "../useAppearanceSettings";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.state.themeKey.value = "luminousClarity";
	mocks.state.currentTheme.value = { mode: "light", id: "luminous-clarity" };
	mocks.state.glassIntensity.value = 60;
});

describe("useAppearanceSettings — mapeamento tema↔modo", () => {
	it("tema claro → mode light e isDark false", () => {
		const s = useAppearanceSettings();
		expect(s.themeMode.value).toBe("light");
		expect(s.isDark.value).toBe(false);
	});

	it("tema escuro → mode dark e isDark true", () => {
		mocks.state.themeKey.value = "etherealLumens";
		mocks.state.currentTheme.value = { mode: "dark", id: "ethereal-lumens" };
		const s = useAppearanceSettings();
		expect(s.themeMode.value).toBe("dark");
		expect(s.isDark.value).toBe(true);
	});

	it("themeKey desconhecida → mode default dark", () => {
		mocks.state.themeKey.value = "desconhecido";
		const s = useAppearanceSettings();
		expect(s.themeMode.value).toBe("dark");
	});

	it("setThemeMode light/dark delegam com a key certa", () => {
		const s = useAppearanceSettings();
		s.setThemeMode("dark");
		expect(s.themeKey.value).toBe("etherealLumens");
		s.setThemeMode("light");
		expect(s.themeKey.value).toBe("luminousClarity");
	});
});

describe("useAppearanceSettings — blur e delegações", () => {
	it("blurSlider get/set ligam glassIntensity ao setGlassIntensity", () => {
		const s = useAppearanceSettings();
		expect(s.blurSlider.value).toBe(60);
		s.blurSlider.value = 85;
		expect(mocks.state.setGlassIntensity).toHaveBeenCalledWith(85);
	});

	it("setBlurLevel (alias) delega ao useBlurSystem", () => {
		const s = useAppearanceSettings();
		s.setBlurLevel("high");
		expect(mocks.state.setBlurLevel).toHaveBeenCalledWith("high");
	});

	it("setAccentColor e setInteractionMode delegam", () => {
		const s = useAppearanceSettings();
		s.setAccentColor("green" as never);
		expect(mocks.state.setAccent).toHaveBeenCalledWith("green");
		s.setInteractionMode("snappy" as never);
		expect(mocks.state.setInteraction).toHaveBeenCalledWith("snappy");
	});

	it("expõe coleções e observáveis do design-system", () => {
		const s = useAppearanceSettings();
		expect(Object.keys(s.accents)).toContain("blue");
		expect(Object.keys(s.interactions)).toContain("smooth");
		expect(s.blurTokens).toContain("medium");
		expect(s.backdropFilter.value).toBe("blur(18px)");
		expect(s.currentGlassFill.value).toBe("62%");
		expect(s.autoBrightness.value).toBe(false);
		s.setAutoBrightness(true);
		expect(mocks.state.setAutoBrightness).toHaveBeenCalledWith(true);
	});
});
