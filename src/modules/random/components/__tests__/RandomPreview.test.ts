// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

/**
 * RandomPreview — tela de exibição do sorteio (config legado + override Palco).
 * Branches: stage com/sem backgroundImage, textColor, fontSize, drawing
 * (fontSize/textShadow), textBox/boxBorder, currentDisplay → opacity.
 */
import type { StageSettings } from "../../../settings/types/stage-settings";
import type { RandomRuntimeState } from "../../types/random";
import { DEFAULT_RANDOM_DISPLAY_CONFIG } from "../../types/random";
import RandomPreview from "../RandomPreview.vue";

function runtime(over: Partial<RandomRuntimeState> = {}): RandomRuntimeState {
	return {
		mode: "names",
		isDrawing: false,
		currentDisplay: null,
		...over,
	} as RandomRuntimeState;
}

const stage = (over: Partial<StageSettings> = {}): StageSettings =>
	({
		backgroundImage: undefined,
		textColor: undefined,
		fontSize: 100,
		fontWeight: 700,
		textShadow: true,
		shadowBlur: 2,
		shadowIntensity: 0.5,
		textBox: false,
		boxOpacity: 0.5,
		boxBorder: false,
		...over,
	}) as StageSettings;

function mountPreview(
	r: RandomRuntimeState,
	stageSettings?: StageSettings,
	config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG },
) {
	return mount(RandomPreview, {
		props: {
			config,
			runtime: r,
			...(stageSettings ? { stage: stageSettings } : {}),
		},
	});
}

describe("RandomPreview", () => {
	it("sem stage: surface usa bgColor/textColor do config", () => {
		const config = {
			...DEFAULT_RANDOM_DISPLAY_CONFIG,
			bgColor: "#112233",
			textColor: "#aabbcc",
		};
		const w = mountPreview(runtime(), undefined, config);
		const surface = w.find(".random-preview");
		expect((surface.element as HTMLElement).style.background).toContain(
			"rgb(17, 34, 51)",
		);
		expect((surface.element as HTMLElement).style.color).toBe(
			"rgb(170, 187, 204)",
		);
	});

	it("stage com backgroundImage: background transparent", () => {
		const w = mountPreview(
			runtime(),
			stage({ backgroundImage: "img://bg.png" }),
		);
		const surface = w.find(".random-preview");
		expect((surface.element as HTMLElement).style.background).toBe(
			"transparent",
		);
	});

	it("currentDisplay nulo: opacity 0; com display: opacity 1 e texto renderizado", () => {
		const w0 = mountPreview(runtime({ currentDisplay: null }));
		expect(
			(w0.find(".random-preview__text").element as HTMLElement).style.opacity,
		).toBe("0");

		const w1 = mountPreview(runtime({ currentDisplay: "Maria" }));
		const text = w1.find(".random-preview__text");
		expect(text.text()).toContain("Maria");
		expect((text.element as HTMLElement).style.opacity).toBe("1");
	});

	it("drawing: fontSize reduzido e textShadow none", () => {
		const w = mountPreview(
			runtime({ isDrawing: true, currentDisplay: "João" }),
		);
		const style = (w.find(".random-preview__text").element as HTMLElement)
			.style;
		expect(style.fontSize).toBe(
			`${DEFAULT_RANDOM_DISPLAY_CONFIG.fontSizePc * 0.8}vw`,
		);
		expect(style.textShadow).toBe("none");
	});

	it("sem drawing (legado): textShadow com textColor translúcido", () => {
		const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, textColor: "#ffffff" };
		const w = mountPreview(
			runtime({ currentDisplay: "Ana" }),
			undefined,
			config,
		);
		const shadow = (w.find(".random-preview__text").element as HTMLElement)
			.style.textShadow;
		expect(shadow).toContain("10px");
		expect(shadow).toContain("40px");
		expect(shadow).toContain("ffffff"); // cor translúcida
	});

	it("stage: fontSize proporcional, uppercase, sombra do Palco", () => {
		const w = mountPreview(
			runtime({ currentDisplay: "Ana" }),
			stage({ fontSize: 96 }),
		);
		const style = (w.find(".random-preview__text").element as HTMLElement)
			.style;
		expect(style.fontSize).toBe(`${(96 / 1920) * 100}vw`);
		expect(style.textTransform).toBe("uppercase");
		expect(style.textShadow).toContain("rgba(0,0,0,0.5)");
	});

	it("stage textShadow false: sombra none mesmo sem drawing", () => {
		const w = mountPreview(
			runtime({ currentDisplay: "Ana" }),
			stage({ textShadow: false }),
		);
		expect(
			(w.find(".random-preview__text").element as HTMLElement).style.textShadow,
		).toBe("none");
	});

	it("stage textBox + boxBorder: caixa com fundo e borda; drawing remove", () => {
		const st = stage({ textBox: true, boxBorder: true, boxOpacity: 0.4 });
		const w1 = mountPreview(runtime({ currentDisplay: "Ana" }), st);
		const s1 = (w1.find(".random-preview__text").element as HTMLElement).style;
		expect(s1.background).toContain("rgba(0, 0, 0, 0.4)");
		expect(s1.border).toContain("1px solid");
		expect(s1.padding).toContain("2.5vmin");

		const w2 = mountPreview(
			runtime({ currentDisplay: "Ana", isDrawing: true }),
			st,
		);
		const s2 = (w2.find(".random-preview__text").element as HTMLElement).style;
		expect(s2.background).toBe("transparent");
		// jsdom retorna '' para border:none (shorthand não resolvido)
		expect(s2.border === "none" || s2.border === "").toBe(true);
	});

	it("stage textBox sem border: borda none", () => {
		const w = mountPreview(
			runtime({ currentDisplay: "Ana" }),
			stage({ textBox: true }),
		);
		const border = (w.find(".random-preview__text").element as HTMLElement)
			.style.border;
		// jsdom pode retornar '' para border:none (shorthand não resolvido)
		expect(border === "none" || border === "").toBe(true);
	});

	it("stage textColor override vence config", () => {
		const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, textColor: "#ffffff" };
		const w = mountPreview(runtime(), stage({ textColor: "#ff0000" }), config);
		expect((w.find(".random-preview").element as HTMLElement).style.color).toBe(
			"rgb(255, 0, 0)",
		);
	});

	it("transição troca a chave entre drawing e display", async () => {
		const w = mountPreview(
			runtime({ isDrawing: true, currentDisplay: "Sorteando..." }),
		);
		expect(w.find(".random-preview__text").text()).toContain("Sorteando...");
		await w.setProps({
			runtime: runtime({ isDrawing: false, currentDisplay: "Pedro" }),
		});
		expect(w.find(".random-preview__text").text()).toContain("Pedro");
	});
});
