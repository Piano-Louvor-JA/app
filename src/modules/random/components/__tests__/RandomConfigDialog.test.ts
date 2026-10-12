// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * RandomConfigDialog — dialog de configuração do sorteio (Teleport).
 * Cores (presets+custom), fonte (slider + bump), transform, velocidade,
 * reset/apply. Mesmo harness Teleport de Clock/TimerConfigDialog.
 */
import randomLocale from "../../locales/pt-BR";
import {
	DEFAULT_RANDOM_DISPLAY_CONFIG,
	RANDOM_ANIMATION_SPEEDS,
	RANDOM_BG_PRESETS,
	RANDOM_TEXT_PRESETS,
	RANDOM_TEXT_TRANSFORMS,
	type RandomAnimationSpeed,
	type RandomDisplayConfig,
	type RandomTextTransform,
} from "../../types/random";
import RandomConfigDialog from "../RandomConfigDialog.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": randomLocale },
});

const baseConfig: RandomDisplayConfig = {
	...DEFAULT_RANDOM_DISPLAY_CONFIG,
};

function mountDialog(
	over: Partial<{ open: boolean; config: RandomDisplayConfig }> = {},
) {
	return mount(RandomConfigDialog, {
		props: {
			open: true,
			config: { ...baseConfig },
			...over,
		},
		global: { plugins: [i18n] },
		attachTo: document.body,
	});
}

function q<T extends Element = HTMLElement>(sel: string): T {
	const el = document.body.querySelector<T>(sel);
	if (!el) throw new Error(`não achou ${sel}`);
	return el;
}

function qa<T extends Element = HTMLElement>(sel: string): T[] {
	return Array.from(document.body.querySelectorAll<T>(sel));
}

function clickEl(el: Element | undefined | null): void {
	if (!el) throw new Error("elemento não encontrado para click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function fireInput(el: HTMLInputElement, value: string, type = "input"): void {
	el.value = value;
	el.dispatchEvent(new Event(type, { bubbles: true }));
}

describe("RandomConfigDialog", () => {
	let active: ReturnType<typeof mountDialog> | null = null;

	afterEach(() => {
		active?.unmount();
		active = null;
		document.body.innerHTML = "";
	});

	it("open=false não renderiza nada", () => {
		active = mountDialog({ open: false });
		expect(document.body.querySelector(".random-config")).toBeNull();
	});

	it("open=true renderiza dialog com aria-modal", () => {
		active = mountDialog();
		const dialog = q(".random-config");
		expect(dialog.getAttribute("role")).toBe("dialog");
		expect(dialog.getAttribute("aria-modal")).toBe("true");
	});

	it("botão X emite close", async () => {
		active = mountDialog();
		clickEl(q(".random-config__icon-btn:not(.random-config__icon-btn--tonal)"));
		await active.vm.$nextTick();
		expect(active.emitted("close")).toHaveLength(1);
	});

	it("presets de bg: 1 clique emite update:bgColor com o preset", async () => {
		active = mountDialog();
		const bgGroup = qa('[role="radiogroup"]')[0]!;
		const swatches = Array.from(
			bgGroup.querySelectorAll(".random-config__swatch"),
		);
		expect(swatches.length).toBe(RANDOM_BG_PRESETS.length);
		clickEl(swatches[1]!);
		await active.vm.$nextTick();
		expect(active.emitted("update:bgColor")?.[0]).toEqual([
			RANDOM_BG_PRESETS[1],
		]);
	});

	it("presets de texto: clique emite update:textColor", async () => {
		active = mountDialog();
		const groups = qa('[role="radiogroup"]');
		const textGroup = groups[1]!;
		const swatches = Array.from(
			textGroup.querySelectorAll(".random-config__swatch"),
		);
		expect(swatches.length).toBe(RANDOM_TEXT_PRESETS.length);
		clickEl(swatches[0]!);
		await active.vm.$nextTick();
		expect(active.emitted("update:textColor")?.[0]).toEqual([
			RANDOM_TEXT_PRESETS[0],
		]);
	});

	it("input color custom emite update:bgColor", async () => {
		active = mountDialog();
		fireInput(qa<HTMLInputElement>('input[type="color"]')[0]!, "#112233");
		await active.vm.$nextTick();
		expect(active.emitted("update:bgColor")?.[0]).toEqual(["#112233"]);
	});

	it("input color custom emite update:textColor", async () => {
		active = mountDialog();
		fireInput(qa<HTMLInputElement>('input[type="color"]')[1]!, "#aabbcc");
		await active.vm.$nextTick();
		expect(active.emitted("update:textColor")?.[0]).toEqual(["#aabbcc"]);
	});

	it("slider de fonte emite update:fontSizePc com Number", async () => {
		active = mountDialog();
		const slider = q<HTMLInputElement>('input[type="range"]');
		fireInput(slider, "10");
		await active.vm.$nextTick();
		expect(active.emitted("update:fontSizePc")?.[0]).toEqual([10]);
	});

	it("botão + emite fontSizePc + 1", async () => {
		active = mountDialog({
			config: { ...baseConfig, fontSizePc: 8 },
		});
		clickEl(
			qa("button").find(
				(b) => b.getAttribute("aria-label") === "Aumentar fonte",
			),
		);
		await active.vm.$nextTick();
		expect(active.emitted("update:fontSizePc")?.[0]).toEqual([9]);
	});

	it("botão − emite fontSizePc − 1", async () => {
		active = mountDialog({
			config: { ...baseConfig, fontSizePc: 8 },
		});
		clickEl(
			qa("button").find(
				(b) => b.getAttribute("aria-label") === "Diminuir fonte",
			),
		);
		await active.vm.$nextTick();
		expect(active.emitted("update:fontSizePc")?.[0]).toEqual([7]);
	});

	it("textTransform: todos os botões emitem com o valor", async () => {
		active = mountDialog();
		// usa os toggles .random-config__toggle com textos do i18n
		const transformLabelMap: Record<RandomTextTransform, string> = {
			none: "transformNone", // "Aa (Normal)"
			uppercase: "transformUpper", // "AA (Maiúsculo)"
			lowercase: "transformLower", // "aa (Minúsculo)"
		};
		for (const value of RANDOM_TEXT_TRANSFORMS) {
			const expectedLabel = randomLocale.random[transformLabelMap[value]];
			const toggles = qa(".random-config__toggle");
			const btn = toggles.find((b: HTMLElement) =>
				(b.textContent ?? "").trim().includes(expectedLabel),
			);
			clickEl(btn);
			await active.vm.$nextTick();
		}
		const evts = active.emitted("update:textTransform");
		expect(evts?.length).toBe(RANDOM_TEXT_TRANSFORMS.length);
	});

	it("animationSpeed: botões emitem com o valor", async () => {
		active = mountDialog();
		const speedLabelMap: Record<RandomAnimationSpeed, string> = {
			fast: "speedFast", // "Rápido"
			normal: "speedNormal", // "Normal"
			slow: "speedSlow", // "Lento"
		};
		for (const speed of RANDOM_ANIMATION_SPEEDS) {
			const expectedLabel = randomLocale.random[speedLabelMap[speed]];
			// só os toggles do grupo de animação (o grupo de transform tem "Normal" em "Aa (Normal)")
			const speedGroup = qa('[role="radiogroup"]').find(
				(g) => g.getAttribute("aria-label") === randomLocale.random.animation,
			);
			const btn = Array.from(
				speedGroup?.querySelectorAll<HTMLElement>(".random-config__toggle") ??
					[],
			).find((b) => (b.textContent ?? "").trim().includes(expectedLabel));
			clickEl(btn);
			await active.vm.$nextTick();
		}
		const evts = active.emitted("update:animationSpeed");
		expect(evts?.length).toBe(RANDOM_ANIMATION_SPEEDS.length);
	});

	it("botão Restaurar Padrão emite reset", async () => {
		active = mountDialog();
		const btn = qa("button").find((b) =>
			(b.textContent ?? "").includes("Restaurar Padrão"),
		);
		clickEl(btn);
		await active.vm.$nextTick();
		expect(active.emitted("reset")).toHaveLength(1);
	});

	it("botão Aplicar emite close", async () => {
		active = mountDialog();
		const btn = qa("button").find((b) =>
			(b.textContent ?? "").includes("Aplicar"),
		);
		clickEl(btn);
		await active.vm.$nextTick();
		expect(active.emitted("close")).toHaveLength(1);
	});
});
