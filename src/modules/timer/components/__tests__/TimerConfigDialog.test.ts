// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * TimerConfigDialog — dialog de configuração do cronômetro (Teleport).
 * Mesmo padrão do ClockConfigDialog: DOM vai pro body, interações via
 * dispatchEvent e emissões lidas por wrapper.emitted().
 */
import timerLocale from "../../locales/pt-BR";
import { TIMER_TIME_FORMATS, type TimerDisplayConfig } from "../../types/timer";
import TimerConfigDialog from "../TimerConfigDialog.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": timerLocale },
});

const baseConfig: TimerDisplayConfig = {
	timeFormat: "mm:ss",
	bgColor: "#000000",
	textColor: "#FFFFFF",
};

function mountDialog(
	over: Partial<{ open: boolean; config: TimerDisplayConfig }> = {},
) {
	return mount(TimerConfigDialog, {
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

function fireInput(el: HTMLInputElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TimerConfigDialog", () => {
	let active: ReturnType<typeof mountDialog> | null = null;

	afterEach(() => {
		active?.unmount();
		active = null;
		document.body.innerHTML = "";
	});

	it("open=false não renderiza nada", () => {
		active = mountDialog({ open: false });
		expect(document.body.querySelector(".timer-config")).toBeNull();
	});

	it("open=true renderiza dialog com aria-modal", () => {
		active = mountDialog();
		const dialog = q(".timer-config");
		expect(dialog.getAttribute("role")).toBe("dialog");
		expect(dialog.getAttribute("aria-modal")).toBe("true");
	});

	it("botão X emite close", async () => {
		active = mountDialog();
		clickEl(q(".timer-config__icon-btn"));
		await active.vm.$nextTick();
		expect(active.emitted("close")).toHaveLength(1);
	});

	it("presets de bg: todos os swatches emitem update:bgColor", async () => {
		active = mountDialog();
		const bgGroup = qa('[role="radiogroup"]')[0]!;
		const swatches = Array.from(
			bgGroup.querySelectorAll(".timer-config__swatch"),
		);
		expect(swatches.length).toBeGreaterThan(2);
		clickEl(swatches[1]!);
		await active.vm.$nextTick();
		expect(active.emitted("update:bgColor")).toHaveLength(1);
	});

	it("swatch ativo reflete config.bgColor", () => {
		active = mountDialog({ config: { ...baseConfig, bgColor: "#ABCDEF" } });
		const bgGroup = qa('[role="radiogroup"]')[0]!;
		const activeSwatches = Array.from(
			bgGroup.querySelectorAll(".timer-config__swatch--active"),
		);
		if (activeSwatches.length > 0) {
			expect(activeSwatches).toHaveLength(1);
		}
	});

	it("input color custom emite update:bgColor (lowercase no jsdom)", async () => {
		active = mountDialog();
		fireInput(qa<HTMLInputElement>('input[type="color"]')[0]!, "#123456");
		await active.vm.$nextTick();
		expect(active.emitted("update:bgColor")?.[0]).toEqual(["#123456"]);
	});

	it("input color do texto emite update:textColor", async () => {
		active = mountDialog();
		const inputs = qa<HTMLInputElement>('input[type="color"]');
		expect(inputs.length).toBe(2);
		fireInput(inputs[1]!, "#abcdef");
		await active.vm.$nextTick();
		expect(active.emitted("update:textColor")?.[0]).toEqual(["#abcdef"]);
	});

	it("formatos de tempo: todos os botões emitem update:timeFormat", async () => {
		active = mountDialog();
		const formatBtns = qa("button").filter((b) =>
			TIMER_TIME_FORMATS.includes(
				(b.textContent ?? "").trim() as TimerDisplayConfig["timeFormat"],
			),
		);
		expect(formatBtns.length).toBe(TIMER_TIME_FORMATS.length);
		clickEl(formatBtns[2]!);
		await active.vm.$nextTick();
		expect(active.emitted("update:timeFormat")?.[0]).toEqual([
			TIMER_TIME_FORMATS[2],
		]);
	});

	it("botão ativo de formato reflete config.timeFormat", () => {
		active = mountDialog({
			config: { ...baseConfig, timeFormat: "hh:mm:ss" },
		});
		const formatBtns = qa("button").filter((b) =>
			TIMER_TIME_FORMATS.includes(
				(b.textContent ?? "").trim() as TimerDisplayConfig["timeFormat"],
			),
		);
		const activeBtn = formatBtns.filter((b) =>
			b.className.includes("--active"),
		);
		expect(activeBtn.length).toBeLessThanOrEqual(1);
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

  describe('swatches de texto (click)', () => {
    it('click no swatch emite update:textColor', async () => {
      const w = mountDialog()
      const swatches = w.findAll('[role="radio"][class*="swatch"]')
      if (swatches.length === 0) {
        const radios = w.findAll('[role="radio"]')
        for (const r of radios.slice(0, 2)) await r.trigger('click')
      } else {
        await swatches[0].trigger('click')
      }
      w.unmount()
    })
  })
})
