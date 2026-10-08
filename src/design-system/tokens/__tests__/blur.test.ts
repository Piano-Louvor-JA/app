import { describe, expect, it } from "vitest";

import {
	blur,
	blurPxFromIntensity,
	blurTokenFromIntensity,
	clampGlassIntensity,
	DEFAULT_GLASS_INTENSITY,
	glassFillFromIntensity,
	intensityFromBlurToken,
	resolveGlassIntensity,
} from "../blur";

describe("tokens blur", () => {
	it("expõe os valores esperados", () => {
		expect(blur.none).toBe("0px");
		expect(blur.default).toBe("16px");
		expect(DEFAULT_GLASS_INTENSITY).toBe(60);
	});
});

describe("clampGlassIntensity", () => {
	it.each([
		["NaN", Number.NaN, 60],
		["Infinity", 150, 100],
		["negativo", -5, 0],
		["acima do máximo", 250, 100],
		["intermediário arredondado", 60.4, 60],
	])("%s → %i", (_label, input, expected) => {
		expect(clampGlassIntensity(input)).toBe(expected);
	});
});

describe("resolveGlassIntensity", () => {
	it("número passa pelo clamp", () => {
		expect(resolveGlassIntensity(85)).toBe(85);
		expect(resolveGlassIntensity(-1)).toBe(0);
	});

	it("token legado mapeia para intensidade", () => {
		expect(resolveGlassIntensity("none")).toBe(0);
		expect(resolveGlassIntensity("low")).toBe(25);
		expect(resolveGlassIntensity("medium")).toBe(50);
		expect(resolveGlassIntensity("high")).toBe(85);
		expect(resolveGlassIntensity("glow")).toBe(100);
	});

	it("string desconhecida e tipos inválidos → default", () => {
		expect(resolveGlassIntensity("banana")).toBe(60);
		expect(resolveGlassIntensity(null)).toBe(60);
		expect(resolveGlassIntensity({})).toBe(60);
	});
});

describe("blurPxFromIntensity", () => {
	it("0 → 4px e 100 → 28px", () => {
		expect(blurPxFromIntensity(0)).toBe("4px");
		expect(blurPxFromIntensity(100)).toBe("28px");
	});

	it("60 → 18px (arredondado)", () => {
		expect(blurPxFromIntensity(60)).toBe("18px");
	});

	it("clamp aplicado antes do cálculo", () => {
		expect(blurPxFromIntensity(500)).toBe("28px");
	});
});

describe("glassFillFromIntensity", () => {
	it("0 → 42% e 100 → 82%", () => {
		expect(glassFillFromIntensity(0)).toBe("42%");
		expect(glassFillFromIntensity(100)).toBe("82%");
	});
});

describe("blurTokenFromIntensity", () => {
	it.each([
		[0, "none"],
		[12, "none"],
		[13, "low"],
		[35, "low"],
		[36, "medium"],
		[70, "medium"],
		[71, "high"],
		[100, "high"],
	])("%i → %s", (input, expected) => {
		expect(blurTokenFromIntensity(input)).toBe(expected);
	});
});

describe("intensityFromBlurToken", () => {
	it.each([
		["none" as const, 0],
		["low", 25],
		["medium", 50],
		["default", 60],
		["high", 85],
		["glow", 100],
	])("%s → %i", (token, expected) => {
		expect(intensityFromBlurToken(token)).toBe(expected);
	});

	it("token desconhecido → DEFAULT_GLASS_INTENSITY (branch ??)", () => {
		expect(intensityFromBlurToken("desconhecido" as never)).toBe(60);
	});
});
