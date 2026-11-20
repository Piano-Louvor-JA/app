// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

/**
 * useBlurSystem — fachada fina do blur. Moca useThemeManager com refs reais
 * (import estático do vue é hoistado antes do vi.mock) e verifica o computed
 * de backdropFilter e a delegação de setters.
 */

const glassIntensity = ref(60);
const blurLevel = ref("medium");
const currentBlur = ref("18px");
const currentGlassFill = ref("62%");
const setGlassIntensity = vi.fn();
const setBlur = vi.fn();

vi.mock("../useThemeManager", () => ({
	useThemeManager: () => ({
		glassIntensity,
		blurLevel,
		currentBlur,
		currentGlassFill,
		setGlassIntensity,
		setBlur,
	}),
}));

import { useBlurSystem } from "../useBlurSystem";

beforeEach(() => {
	vi.clearAllMocks();
	currentBlur.value = "18px";
});

describe("useBlurSystem", () => {
	it("backdropFilter compõe blur + saturate", () => {
		const s = useBlurSystem();
		expect(s.backdropFilter.value).toBe("blur(18px) saturate(140%)");
	});

	it("backdropFilter reage a mudança do blur", () => {
		const s = useBlurSystem();
		currentBlur.value = "4px";
		expect(s.backdropFilter.value).toBe("blur(4px) saturate(140%)");
		currentBlur.value = "18px";
	});

	it("expõe tokens e estado do tema", () => {
		const s = useBlurSystem();
		expect(s.blurTokens).toBeTruthy();
		expect(s.glassIntensity.value).toBe(60);
		expect(s.blurLevel.value).toBe("medium");
		expect(s.currentGlassFill.value).toBe("62%");
	});

	it("setBlurLevel delega ao setBlur do tema", () => {
		const s = useBlurSystem();
		s.setBlurLevel("none");
		expect(setBlur).toHaveBeenCalledWith("none");
	});

	it("setGlassIntensity delega direto", () => {
		const s = useBlurSystem();
		s.setGlassIntensity(100);
		expect(setGlassIntensity).toHaveBeenCalledWith(100);
	});
});
