// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * RandomStage — palco do sorteio: orbe com partículas, celebração
 * (fireworks ao terminar o draw), toolbar preview (config), botão Sortear,
 * lista de sorteados na projeção, estilos display/preview/projection.
 *
 * Element.animate não existe no jsdom → partículas ficam estáticas
 * (guard `typeof Element.prototype.animate !== 'function'` coberta).
 * Celebrate usa timers reais controlados com vi.useFakeTimers.
 */
import randomLocale from "../../locales/pt-BR";
import type { RandomRuntimeState } from "../../types/random";
import { DEFAULT_RANDOM_DISPLAY_CONFIG } from "../../types/random";
import RandomStage from "../RandomStage.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": randomLocale },
});

type Props = InstanceType<typeof RandomStage>["$props"];

function runtime(over: Partial<RandomRuntimeState> = {}): RandomRuntimeState {
	return {
		mode: "names",
		isDrawing: false,
		currentDisplay: "",
		drawn: [],
		...over,
	} as RandomRuntimeState;
}

function mountStage(over: Partial<Props> = {}) {
	return mount(RandomStage, {
		props: {
			config: { ...DEFAULT_RANDOM_DISPLAY_CONFIG },
			runtime: runtime(),
			...over,
		},
		global: { plugins: [i18n] },
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	// jsdom não implementa matchMedia; stub da propriedade (nunca o window inteiro)
	vi.stubGlobal(
		"matchMedia",
		vi.fn().mockReturnValue({
			matches: false,
			addListener: vi.fn(),
			removeListener: vi.fn(),
		}),
	);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("RandomStage — render básico", () => {
	it("monta com orbe e partículas estáticas (jsdom sem animate)", () => {
		const w = mountStage();
		expect(w.find(".random-stage__orb").exists()).toBe(true);
		expect(w.findAll(".random-stage__particle").length).toBeGreaterThan(0);
		w.unmount();
	});

	it("sem resultado e sem canDraw: caminho idle com readyToDraw", () => {
		const w = mountStage({ preview: true });
		expect(w.find(".random-stage__idle-text").text()).toContain(
			randomLocale.random.readyToDraw,
		);
		w.unmount();
	});

	it("sem display mas com isDrawing: mostra placeholder com opacity 0.55", () => {
		const w = mountStage({
			runtime: runtime({ isDrawing: true, currentDisplay: "" }),
		});
		const text = w.find(".random-stage__display");
		expect(text.text()).toContain(randomLocale.random.placeholderDisplay);
		expect((text.element as HTMLElement).style.opacity).toBe("0.55");
		w.unmount();
	});

	it("com resultado: mostra o nome com opacity 1", () => {
		const w = mountStage({ runtime: runtime({ currentDisplay: "Maria" }) });
		const text = w.find(".random-stage__display");
		expect(text.text()).toContain("Maria");
		expect((text.element as HTMLElement).style.opacity).toBe("1");
		w.unmount();
	});

	it("statusLabel: drawing > canDraw > empty", () => {
		const w1 = mountStage({
			preview: true,
			runtime: runtime({ isDrawing: true }),
		});
		expect(w1.text()).toContain(randomLocale.random.drawing);
		w1.unmount();

		const w2 = mountStage({ preview: true, canDraw: true });
		expect(w2.text()).toContain(randomLocale.random.readyToDraw);
		w2.unmount();

		const w3 = mountStage({ preview: true });
		expect(w3.text()).toContain(randomLocale.random.emptyList);
		w3.unmount();
	});

	it("drawing: cor variant e textShadow none", () => {
		const w = mountStage({
			runtime: runtime({ isDrawing: true, currentDisplay: "..." }),
		});
		const style = w.find(".random-stage__display").element as HTMLElement;
		expect(style.getAttribute("style")).toContain(
			"--ds-color-on-surface-variant",
		);
		expect(style.style.textShadow).toBe("none");
		w.unmount();
	});
});

describe("RandomStage — preview e controles", () => {
	it("preview: toolbar com botão config emite openConfig", async () => {
		const w = mountStage({ preview: true });
		expect(w.find(".random-stage__toolbar").exists()).toBe(true);
		await w.find(".random-stage__tool").trigger("click");
		expect(w.emitted("openConfig")).toHaveLength(1);
		w.unmount();
	});

	it("showDraw + canDraw: botão Sortear emite draw", async () => {
		const w = mountStage({ showDraw: true, canDraw: true });
		const btn = w.find(".random-stage__draw");
		expect(btn.exists()).toBe(true);
		await btn.trigger("click");
		expect(w.emitted("draw")).toHaveLength(1);
		w.unmount();
	});

	it("sem preview/showDraw: sem botão Sortear", () => {
		const w = mountStage();
		expect(w.find(".random-stage__draw").exists()).toBe(false);
		w.unmount();
	});

	it("preview + isProjecting: mostra selo 'Em projeção'", () => {
		const w = mountStage({ preview: true, isProjecting: true });
		expect(w.text()).toContain(randomLocale.random.projecting);
		w.unmount();
	});
});

describe("RandomStage — celebração", () => {
	it("isDrawing true→false com resultado: dispara fireworks e limpa após CELEBRATE_MS", async () => {
		const w = mountStage({ runtime: runtime({ currentDisplay: "" }) });
		expect(w.findAll(".random-stage__firework").length).toBe(0);

		await w.setProps({ runtime: runtime({ isDrawing: true }) });
		await w.setProps({
			runtime: runtime({ isDrawing: false, currentDisplay: "João" }),
		});

		expect(w.findAll(".random-stage__firework").length).toBeGreaterThan(0);
		expect(w.find(".random-stage__orb--pulse").exists()).toBe(true);

		vi.advanceTimersByTime(3000);
		await w.vm.$nextTick();
		expect(w.findAll(".random-stage__firework").length).toBe(0);
		expect(w.find(".random-stage__orb--pulse").exists()).toBe(false);
		w.unmount();
	});

	it("isDrawing true→false sem resultado: não celebra", async () => {
		const w = mountStage({ runtime: runtime({ isDrawing: true }) });
		await w.setProps({
			runtime: runtime({ isDrawing: false, currentDisplay: "" }),
		});
		expect(w.findAll(".random-stage__firework").length).toBe(0);
		w.unmount();
	});

	it("novo draw durante celebração: limpa fireworks imediatamente", async () => {
		const w = mountStage();
		await w.setProps({ runtime: runtime({ isDrawing: true }) });
		await w.setProps({
			runtime: runtime({ isDrawing: false, currentDisplay: "Ana" }),
		});
		expect(w.findAll(".random-stage__firework").length).toBeGreaterThan(0);

		await w.setProps({
			runtime: runtime({ isDrawing: true, currentDisplay: "Ana" }),
		});
		expect(w.findAll(".random-stage__firework").length).toBe(0);
		w.unmount();
	});

	it("unmount durante celebração não vaza timer", async () => {
		const w = mountStage();
		await w.setProps({ runtime: runtime({ isDrawing: true }) });
		await w.setProps({
			runtime: runtime({ isDrawing: false, currentDisplay: "Ana" }),
		});
		w.unmount();
		// não deve lançar erro de timer órfão
		vi.advanceTimersByTime(3000);
	});
});

describe("RandomStage — projeção", () => {
	it("projection: fundo do config quando sem imagem do Palco", () => {
		const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, bgColor: "#123456" };
		const w = mountStage({ projection: true, config });
		const surface = w.find(".random-stage");
		expect((surface.element as HTMLElement).style.backgroundColor).toBe(
			"rgb(18, 52, 86)",
		);
		w.unmount();
	});

	it("projection + stage com imagem: sem backgroundColor", () => {
		const stage = { backgroundImage: "img://bg.png" };
		const w = mountStage({ projection: true, stage } as Partial<Props>);
		const surface = w.find(".random-stage");
		expect((surface.element as HTMLElement).style.backgroundColor).toBe("");
		w.unmount();
	});

	it("showDrawnList: projection com sorteados renderiza lista rankeada", () => {
		const w = mountStage({
			projection: true,
			runtime: runtime({
				drawn: ["Ana", "Bruno", "Carla"],
				currentDisplay: "Carla",
			}),
		});
		const items = w.findAll(".random-stage__drawn-item");
		expect(items.length).toBe(3);
		expect(items[0]?.text()).toContain("1");
		expect(items[0]?.text()).toContain("Ana");
		expect(items[2]?.text()).toContain("3");
		w.unmount();
	});

	it("fora da projection: sem lista de sorteados", () => {
		const w = mountStage({ runtime: runtime({ drawn: ["Ana"] }) });
		expect(w.find(".random-stage__drawn").exists()).toBe(false);
		w.unmount();
	});
});

describe("RandomStage — estilos por contexto", () => {
	it("fontSize: projection usa vw; preview clamp em rem", () => {
		const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, fontSizePc: 10 };
		const wp = mountStage({
			projection: true,
			config,
			runtime: runtime({ currentDisplay: "X" }),
		});
		const fsP = (wp.find(".random-stage__display").element as HTMLElement).style
			.fontSize;
		expect(Number.parseFloat(fsP)).toBeCloseTo(7.2, 5);
		expect(fsP.endsWith("vw")).toBe(true);
		wp.unmount();

		const wv = mountStage({
			preview: true,
			config,
			runtime: runtime({ currentDisplay: "X" }),
		});
		const fs = (wv.find(".random-stage__display").element as HTMLElement).style
			.fontSize;
		expect(fs).toBe("2.2rem"); // clamp máx: 10*0.22=2.2
		wv.unmount();
	});

	it("fontSize preview: clamp mínimo 1.1rem", () => {
		const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, fontSizePc: 2 };
		const w = mountStage({
			preview: true,
			config,
			runtime: runtime({ currentDisplay: "X" }),
		});
		expect(
			(w.find(".random-stage__display").element as HTMLElement).style.fontSize,
		).toBe("1.1rem");
		w.unmount();
	});

	it("modo numbers: fontSize sem o fator 0.72", () => {
		const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, fontSizePc: 10 };
		const w = mountStage({
			projection: true,
			config,
			runtime: runtime({ mode: "numbers", currentDisplay: "42" }),
		});
		expect(
			(w.find(".random-stage__display").element as HTMLElement).style.fontSize,
		).toBe("10vw");
		w.unmount();
	});

	it("drawing na projection: fontSize reduzido (0.82)", () => {
		const config = { ...DEFAULT_RANDOM_DISPLAY_CONFIG, fontSizePc: 10 };
		const w = mountStage({
			projection: true,
			config,
			runtime: runtime({ isDrawing: true, currentDisplay: "..." }),
		});
		const fsD = (w.find(".random-stage__display").element as HTMLElement).style
			.fontSize;
		expect(Number.parseFloat(fsD)).toBeCloseTo(10 * 0.72 * 0.82, 5);
		expect(fsD.endsWith("vw")).toBe(true);
		w.unmount();
	});

  describe("celebrate + partículas animadas", () => {
    function fakeAnimation() {
      return {
        onfinish: null as null | (() => void),
        cancel: vi.fn(),
        finished: Promise.resolve(),
      } as unknown as Animation
    }

    it("triggerCelebrate: fireworks aparecem e somem após CELEBRATE_MS", async () => {
      vi.useFakeTimers()
      const rt = runtime({ isDrawing: false, currentDisplay: "João" })
      const wrapper = mountStage({ runtime: rt })
      // simula transição drawing→done com display
      await wrapper.setProps({ runtime: { ...rt, isDrawing: true } })
      await wrapper.setProps({ runtime: { ...rt, isDrawing: false } })
      await nextTick()
      expect((wrapper.vm as any).fireworks.length).toBeGreaterThan(0)
      vi.advanceTimersByTime(3000 + 50)
      await nextTick()
      expect((wrapper.vm as any).fireworks.length).toBe(0)
      wrapper.unmount()
      vi.useRealTimers()
    })

    it("prefersReducedMotion: celebrate bloqueado", async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
      const rt = runtime({ isDrawing: false, currentDisplay: "João" })
      const wrapper = mountStage({ runtime: rt })
      await wrapper.setProps({ runtime: { ...rt, isDrawing: true } })
      await wrapper.setProps({ runtime: { ...rt, isDrawing: false } })
      await nextTick()
      expect((wrapper.vm as any).fireworks.length).toBe(0)
      wrapper.unmount()
    })

    it("animate disponível: partículas iniciam e cancelam no unmount", async () => {
      const anims: any[] = []
      const origAnimate = Element.prototype.animate
      Element.prototype.animate = function (this: HTMLElement) {
        const a = fakeAnimation()
        anims.push(a)
        return a
      } as any
      const wrapper = mountStage({})
      await nextTick()
      expect(anims.length).toBeGreaterThan(0)
      wrapper.unmount()
      expect(anims.every(a => a.cancel.mock !== undefined)).toBe(true)
      Element.prototype.animate = origAnimate
    })

    it("onfinish: partícula reposiciona e re-anima", async () => {
      const anims: any[] = []
      const origAnimate = Element.prototype.animate
      Element.prototype.animate = function (this: HTMLElement) {
        const a = fakeAnimation()
        anims.push(a)
        return a
      } as any
      const wrapper = mountStage({})
      await nextTick()
      const first = anims[0]
      first.onfinish?.()
      expect(anims.length).toBeGreaterThan(1)
      wrapper.unmount()
      Element.prototype.animate = origAnimate
    })
  })
})
