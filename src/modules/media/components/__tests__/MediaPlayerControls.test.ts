// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { useProjectionStore } from "../../../settings/stores/useProjectionStore";
/**
 * MediaPlayerControls — transport (prev/play/next), timeline seek, volume,
 * projetar (gated por audiência), minimizar. Props in, emits out; store de
 * projeção real (Pinia) com estado manipulado por teste.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaPlayerControls from "../MediaPlayerControls.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

function baseProps(
	over: Partial<InstanceType<typeof MediaPlayerControls>["$props"]> = {},
) {
	return {
		isPlaying: false,
		hasAudio: true,
		currentTimeLabel: "1:23",
		durationLabel: "4:56",
		progressRatio: 0.5,
		slideIndex: 1,
		slideCount: 5,
		volume: 0.7,
		projecting: false,
		...over,
	};
}

function mountControls(props = baseProps()) {
	const pinia = createPinia();
	setActivePinia(pinia);
	return {
		w: mount(MediaPlayerControls, {
			props,
			global: { plugins: [i18n, pinia] },
		}),
		pinia,
	};
}

beforeEach(() => {
	localStorage.clear();
});

describe("MediaPlayerControls — render", () => {
	it("mostra tempos e contador de slides", () => {
		const { w } = mountControls();
		expect(w.text()).toContain("1:23");
		expect(w.text()).toContain("4:56");
		expect(w.text()).toContain("Slide 2 de 5");
		w.unmount();
	});
});

describe("MediaPlayerControls — transport", () => {
	it("anterior habilitado quando slideIndex > 0 e emite previousSlide", async () => {
		const { w } = mountControls();
		const btns = w.findAll(".media-player-controls__btn");
		expect(btns[0].attributes("disabled")).toBeUndefined();
		await btns[0].trigger("click");
		expect(w.emitted("previousSlide")).toHaveLength(1);
		w.unmount();
	});

	it("anterior desabilitado no primeiro slide", () => {
		const { w } = mountControls(baseProps({ slideIndex: 0 }));
		expect(
			w.findAll(".media-player-controls__btn")[0].attributes("disabled"),
		).toBeDefined();
		w.unmount();
	});

	it("próximo desabilitado no último slide", () => {
		const { w } = mountControls(baseProps({ slideIndex: 4, slideCount: 5 }));
		expect(
			w.findAll(".media-player-controls__btn")[2].attributes("disabled"),
		).toBeDefined();
		w.unmount();
	});

	it("play/pause desabilitado sem áudio e habilitado com áudio", async () => {
		const { w } = mountControls(baseProps({ hasAudio: false }));
		expect(
			w.findAll(".media-player-controls__btn")[1].attributes("disabled"),
		).toBeDefined();
		w.unmount();

		const { w: w2 } = mountControls();
		await w2.findAll(".media-player-controls__btn")[1].trigger("click");
		expect(w2.emitted("togglePlay")).toHaveLength(1);
		w2.unmount();
	});
});

describe("MediaPlayerControls — seek e volume", () => {
	it("seek emite seekRatio normalizado 0..1", async () => {
		const { w } = mountControls();
		const seek = w.find(".media-player-controls__seek");
		await seek.setValue("50");
		expect(w.emitted("seekRatio")?.[0]).toEqual([0.5]);
		w.unmount();
	});

	it("seek desabilitado sem áudio", () => {
		const { w } = mountControls(baseProps({ hasAudio: false }));
		expect(
			w.find(".media-player-controls__seek").attributes("disabled"),
		).toBeDefined();
		w.unmount();
	});

	it("volume emite update:volume normalizado 0..1", async () => {
		const { w } = mountControls();
		const vol = w.find(".media-player-controls__volume input");
		await vol.setValue("70");
		expect(w.emitted("update:volume")?.[0]).toEqual([0.7]);
		w.unmount();
	});
});

describe("MediaPlayerControls — projeção", () => {
	it("sem targets de audiência: botão projetar desabilitado com aria de aviso", () => {
		const { w } = mountControls();
		const projBtn = w.findAll(".media-player-controls__btn")[3];
		expect(projBtn.attributes("disabled")).toBeDefined();
		expect(projBtn.attributes("aria-label")).toContain("projectNeedsScreens");
		w.unmount();
	});

	it("projetando: botão habilitado mesmo sem targets (pra poder retirar)", async () => {
		const { w } = mountControls(baseProps({ projecting: true }));
		const projBtn = w.findAll(".media-player-controls__btn")[3];
		expect(projBtn.attributes("disabled")).toBeUndefined();
		await projBtn.trigger("click");
		expect(w.emitted("toggleProjection")).toHaveLength(1);
		w.unmount();
	});
});

describe("MediaPlayerControls — minimizar", () => {
	it("emite minimize", async () => {
		const { w } = mountControls();
		const minimizeBtn = w
			.findAll("button")
			.find((b) => b.find(".ti-arrows-minimize").exists());
		expect(minimizeBtn).toBeDefined();
		await minimizeBtn?.trigger("click");
		expect(w.emitted("minimize")).toHaveLength(1);
		w.unmount();
	});

  describe('nextSlide e close (92/172)', () => {
    it('botão nextSlide emite', async () => {
      const { w } = mountControls()
      const btn = w.findAll('button').find(b => b.find('i.ti-player-skip-forward').exists())
      expect(btn).toBeTruthy()
      await btn!.trigger('click')
      expect(w.emitted('nextSlide')).toBeTruthy()
      w.unmount()
    })

    it('botão close emite close', async () => {
      const { w } = mountControls()
      const btn = w.findAll('button').find(b => b.find('i.ti-x').exists())
      expect(btn).toBeTruthy()
      await btn!.trigger('click')
      expect(w.emitted('close')).toBeTruthy()
      w.unmount()
    })
  })
})
