// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * ClockConfigDialog — dialog de configuração do relógio (palco).
 * Usa <Teleport to="body">: o DOM vai pro document.body, então as
 * interações são feitas via querySelector + dispatchEvent no body e as
 * emissões lidas pelo active!.emitted() (funciona mesmo com Teleport).
 */
import clockLocale from "../../locales/pt-BR";
import {
	CLOCK_BG_PRESETS,
	type ClockConfig,
	DEFAULT_CLOCK_CONFIG,
} from "../../types/clock";
import ClockConfigDialog from "../ClockConfigDialog.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": clockLocale },
});

const baseConfig: ClockConfig = { ...DEFAULT_CLOCK_CONFIG };

function mountDialog(
	over: Partial<{ open: boolean; config: ClockConfig }> = {},
) {
	return mount(ClockConfigDialog, {
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

function txt(b: Element): string {
	return (b.textContent ?? "").trim();
}

function clickEl(el: Element | undefined | null): void {
	if (!el) throw new Error("elemento não encontrado para click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function fireInput(el: HTMLInputElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ClockConfigDialog", () => {
	let active: ReturnType<typeof mountDialog> | null = null;

	afterEach(() => {
		active?.unmount();
		active = null;
		document.body.innerHTML = "";
	});

	it("open=false não renderiza nada", () => {
		active = mountDialog({ open: false });
		expect(document.body.querySelector(".clock-config")).toBeNull();
	});

	it("open=true renderiza dialog com aria-modal", () => {
		mountDialog();
		const dialog = q(".clock-config");
		expect(dialog.getAttribute("role")).toBe("dialog");
		expect(dialog.getAttribute("aria-modal")).toBe("true");
	});

	it("botão X emite close", async () => {
		active = mountDialog();
		clickEl(q(".clock-config__icon-btn"));
		await active.vm.$nextTick();
		expect(active!.emitted("close")).toHaveLength(1);
	});

	it("presets de bg: 1 clique por preset, todos emitem update:bgColor", async () => {
		active = mountDialog();
		const bgGroup = qa('[role="radiogroup"]')[0]!;
		const swatches = Array.from(
			bgGroup.querySelectorAll(".clock-config__swatch"),
		);
		expect(swatches.length).toBe(CLOCK_BG_PRESETS.length);
		for (const [i, swatch] of swatches.entries()) {
			clickEl(swatch);
			await active.vm.$nextTick();
			expect(active!.emitted("update:bgColor")?.[i]).toEqual([
				CLOCK_BG_PRESETS[i],
			]);
		}
	});

	it("swatch ativo reflete config.bgColor", () => {
		active = mountDialog({
			config: { ...baseConfig, bgColor: CLOCK_BG_PRESETS[2] },
		});
		const bgGroup = qa('[role="radiogroup"]')[0]!;
		const activeSwatches = Array.from(
			bgGroup.querySelectorAll(".clock-config__swatch--active"),
		);
		expect(activeSwatches).toHaveLength(1);
		expect(activeSwatches[0]!.getAttribute("aria-label")).toBe(
			CLOCK_BG_PRESETS[2],
		);
	});

	it("input color custom emite update:bgColor com o valor", async () => {
		active = mountDialog();
		fireInput(
			q<HTMLInputElement>(
				'input[type="color"][aria-label="Cor personalizada"]',
			),
			"#123456",
		);
		await active.vm.$nextTick();
		expect(active!.emitted("update:bgColor")?.[0]).toEqual(["#123456"]);
	});

	it("input color do texto emite update:textColor", async () => {
		active = mountDialog();
		const inputs = qa<HTMLInputElement>('input[type="color"]');
		expect(inputs.length).toBe(2);
		fireInput(inputs[1]!, "#abcdef");
		await active.vm.$nextTick();
		expect(active!.emitted("update:textColor")?.[0]).toEqual(["#abcdef"]);
	});

	it("estilo digital/analog emite update:style", async () => {
		active = mountDialog();
		const buttons = qa("button");
		const digital = buttons.find((b) => txt(b).includes("Digital"));
		const analog = buttons.find((b) => txt(b).includes("Anal\u00f3gico"));
		clickEl(digital!);
		clickEl(analog!);
		await active.vm.$nextTick();
		expect(active!.emitted("update:style")).toEqual([["digital"], ["analog"]]);
	});

	it("toggle segundos emite update:showSeconds invertido", async () => {
		active = mountDialog({
			config: { ...baseConfig, showSeconds: false },
		});
		const btn = qa("button.clock-config__switch").find(
			(b) => b.getAttribute("aria-label") === "Mostrar Segundos",
		);
		clickEl(btn!);
		await active.vm.$nextTick();
		expect(active!.emitted("update:showSeconds")).toEqual([[true]]);
	});

	it("toggle 24h emite update:format24h invertido", async () => {
		active = mountDialog({
			config: { ...baseConfig, format24h: true },
		});
		const btn = qa("button.clock-config__switch").find(
			(b) => b.getAttribute("aria-label") === "Formato 24h",
		);
		clickEl(btn!);
		await active.vm.$nextTick();
		expect(active!.emitted("update:format24h")).toEqual([[false]]);
	});

	it("botão reset emite reset", async () => {
		active = mountDialog();
		const btn = qa("button").find((b) =>
			txt(b).includes("Restaurar Padr\u00e3o"),
		);
		clickEl(btn!);
		await active.vm.$nextTick();
		expect(active!.emitted("reset")).toHaveLength(1);
	});

	it("botão Pronto emite close", async () => {
		active = mountDialog();
		const btn = qa("button").find((b) => txt(b).includes("Aplicar"));
		clickEl(btn!);
		await active.vm.$nextTick();
		expect(active!.emitted("close")).toHaveLength(1);
	});

  describe('swatches de texto (click)', () => {
    it('click no swatch emite update:textColor', async () => {
      const w = mountDialog()
      // Teleport → body: buscar swatches no document; último grupo = TEXTO
      const swatches = qa('[role="radio"].clock-config__swatch')
      expect(swatches.length).toBeGreaterThan(0)
      swatches[swatches.length - 1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(w.emitted('update:textColor')).toBeTruthy()
      w.unmount()
    })
  })
})
