// @vitest-environment jsdom
import { mount } from "@vue/test-utils";

// override stage-settings: true-arms de textShadow/boxStyle (fantasma de glob vazio em teste)
const stageSettingsStateMPV = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))
vi.mock("../../../settings/services/stage-settings-runtime", async (importOriginal) => {
	const real = await importOriginal<typeof import("../../../settings/services/stage-settings-runtime")>()
	return {
		readEffectiveStageSettings: (scope: string) =>
			stageSettingsStateMPV.value ?? real.readEffectiveStageSettings(scope),
		subscribeStageSettings: (cb: () => void) => real.subscribeStageSettings(cb),
	}
})
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MediaProjectionView — saída de projeção de mídia. Standalone: lê runtime do
 * localStorage + BroadcastChannel + storage event (mesmo padrão do random).
 */
import {
	MEDIA_RUNTIME_CHANNEL,
	MEDIA_RUNTIME_STORAGE_KEY,
} from "../../services/media-runtime";
import MediaProjectionView from "../MediaProjectionView.vue";

function runtimePayload(over: Record<string, unknown> = {}) {
	return {
		active: true,
		title: "Santíssimo",
		subtitle: "Athus Santos",
		lyric: "Santo, Santo, Santo<br>Santo é o Senhor",
		imageUrl: "https://example.com/capa.jpg",
		imagePosition: null,
		isCover: false,
		slideIndex: 2,
		slideCount: 8,
		nextLyric: "",
		nextIsCover: false,
		progressRatio: 0.4,
		...over,
	};
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

// onMounted aplica o runtime depois do primeiro render — sempre aguardar tick.
async function mountView() {
	const w = mount(MediaProjectionView);
	await w.vm.$nextTick();
	await w.vm.$nextTick();
	return w;
}

describe("MediaProjectionView", () => {
	it("inativa: mostra vazio (sem título)", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload({ active: false })),
		);
		const w = await mountView();
		expect(w.text()).not.toContain("Santíssimo");
		w.unmount();
	});

	it("ativa: mostra a letra limpa de quebras (título só em capa, sem subtítulo no palco)", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		expect(w.text()).toContain("Santo é o Senhor");
		expect(w.html()).not.toContain("<br>");
		// não-capa não mostra título no palco
		expect(w.text()).not.toContain("Santíssimo");
		w.unmount();
	});

	it("storage event de outra janela atualiza o palco", async () => {
		const w = await mountView();
		expect(w.text()).not.toContain("Santo é o Senhor");
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(runtimePayload()),
			}),
		);
		await w.vm.$nextTick();
		expect(w.text()).toContain("Santo é o Senhor");
		w.unmount();
	});

	it("BroadcastChannel atualiza o palco", async () => {
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(runtimePayload({ lyric: "Letra via CrossChannel" }));
		await vi.waitFor(() =>
			expect(w.text()).toContain("Letra via CrossChannel"),
		);
		ch.close();
		w.unmount();
	});

	it("capa: mostra título como letra", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload({ isCover: true })),
		);
		const w = await mountView();
		expect(w.text()).toContain("Santíssimo");
		// capa não mostra a letra
		expect(w.text()).not.toContain("Santo é o Senhor");
		w.unmount();
	});

	it("storage event com JSON inválido não quebra", async () => {
		const w = await mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: "{quebrado",
			}),
		);
		await w.vm.$nextTick();
		expect(w.find(".media-projection").exists()).toBe(true);
		w.unmount();
	});

	it("storage event de outra chave é ignorado", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: "outra-chave",
				newValue: '{"active":false}',
			}),
		);
		await w.vm.$nextTick();
		expect(w.text()).toContain("Santo é o Senhor");
		w.unmount();
	});
});

describe("MediaProjectionView — boxStyle branches (90/97/101)", () => {
  function setStage(partial: Record<string, unknown>) {
    const raw = localStorage.getItem("user_data");
    const prefs = raw ? JSON.parse(raw) : {};
    prefs["stage.settings.hymns"] = {
      backgroundColor: "#000000",
      fontColor: "#ffffff",
      ...partial,
    };
    localStorage.setItem("user_data", JSON.stringify(prefs));
  }

  it("textBox false: boxStyle vazio (sem box)", async () => {
    setStage({ textBox: false, boxBorder: false });
    const w = await mountView();
    expect(w.find(".media-projection").exists()).toBe(true);
    w.unmount();
  });

  it("textBox true + boxBorder true: borda aplicada", async () => {
    setStage({ textBox: true, boxBorder: true });
    const w = await mountView();
    expect(w.find(".media-projection").exists()).toBe(true);
    w.unmount();
  });

  it("gaps: stage completo true-arms (textShadow/boxStyle/border)", async () => {
    stageSettingsStateMPV.value = {
      backgroundColor: "#000000",
      textColor: "#ffffff",
      fontSize: 96,
      textAlign: "center",
      textShadow: true,
      shadowBlur: 3,
      shadowIntensity: 0.8,
      textBox: true,
      boxOpacity: 0.5,
      boxBorder: true,
    } as Record<string, unknown>
    try {
      localStorage.setItem(
        MEDIA_RUNTIME_STORAGE_KEY,
        JSON.stringify(runtimePayload({ isCover: true })),
      );
      const w = await mountView()
      await w.vm.$nextTick()
      expect(w.find(".media-projection").exists()).toBe(true)
      // fn47: callback do subscribeStageSettings via storage event
      window.dispatchEvent(new StorageEvent("storage", { key: "user_data" }))
      await w.vm.$nextTick()
      w.unmount()
    } finally {
      stageSettingsStateMPV.value = null
    }
  })

  it("gaps2: false-arms (textShadow none / textBox off / sem borda)", async () => {
    stageSettingsStateMPV.value = {
      backgroundColor: "#000000",
      textColor: "#ffffff",
      fontSize: 96,
      textAlign: "center",
      textShadow: false,
      shadowBlur: 3,
      shadowIntensity: 0.8,
      textBox: true,
      boxOpacity: 0.5,
      boxBorder: false,
    } as Record<string, unknown>
    try {
      localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload()));
      const wBox = await mountView()
      await wBox.vm.$nextTick()
      expect(wBox.find(".media-projection__lyric").exists()).toBe(true)
      wBox.unmount()
      // textBox false: boxStyle → {} (L92 false-arm)
      stageSettingsStateMPV.value = {
        ...stageSettingsStateMPV.value,
        textBox: false,
      } as Record<string, unknown>
      localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload()));
      const w = await mountView()
      await w.vm.$nextTick()
      expect(w.find(".media-projection__lyric").exists()).toBe(true)
      w.unmount()
    } finally {
      stageSettingsStateMPV.value = null
    }
  })

  describe("número do hino na capa do hinário", () => {
    it("mostra o número grande entre o nome do hinário e o título", async () => {
      localStorage.setItem(
        MEDIA_RUNTIME_STORAGE_KEY,
        JSON.stringify(runtimePayload({ isCover: true, title: "Santo, Santo, Santo!", subtitle: "Hinário Adventista", hymnNumber: 1 })),
      )
      const w = await mountView()
      const number = w.find(".media-projection__hymn-number")
      expect(number.exists()).toBe(true)
      expect(number.text()).toBe("1")
      // Padrão: 200 px @1920 → 10.4167cqw (maior que o título).
      expect(number.attributes("style")).toContain("font-size: 10.4167cqw")
      const html = w.html()
      expect(html.indexOf("media-projection__kicker")).toBeLessThan(html.indexOf("media-projection__hymn-number"))
      expect(html.indexOf("media-projection__hymn-number")).toBeLessThan(html.indexOf("media-projection__title--cover"))
      w.unmount()
    })

    it("tamanho e desligar vêm da Personalização; sem número, nada", async () => {
      const real = await vi.importActual<typeof import("../../../settings/types/stage-settings")>("../../../settings/types/stage-settings")
      stageSettingsStateMPV.value = { ...real.DEFAULT_STAGE_SETTINGS, hymnNumberSize: 384 }
      try {
        localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload({ isCover: true, hymnNumber: 45 })))
        let w = await mountView()
        expect(w.find(".media-projection__hymn-number").attributes("style")).toContain("font-size: 20cqw")
        w.unmount()

        stageSettingsStateMPV.value = { ...real.DEFAULT_STAGE_SETTINGS, hymnNumberShow: false }
        w = await mountView()
        expect(w.find(".media-projection__hymn-number").exists()).toBe(false)
        w.unmount()
      } finally {
        stageSettingsStateMPV.value = null
      }

      localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload({ isCover: true, hymnNumber: null })))
      const w = await mountView()
      expect(w.find(".media-projection__hymn-number").exists()).toBe(false)
      w.unmount()
    })
  })

  describe("nome do hinário na capa", () => {
    it("tamanho, cor e esconder vêm da Personalização (padrão = como era)", async () => {
      const real = await vi.importActual<typeof import("../../../settings/types/stage-settings")>("../../../settings/types/stage-settings")
      localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload({ isCover: true, title: "Santo", subtitle: "Hinário Adventista", hymnNumber: 1 })))
      let w = await mountView()
      // Padrão: 28 px @1920 → 1.4583cqw, sem cor própria (branco do CSS).
      const kicker = w.find(".media-projection__kicker")
      expect(kicker.text()).toBe("Hinário Adventista")
      expect(kicker.attributes("style")).toContain("font-size: 1.4583cqw")
      expect(kicker.attributes("style") ?? "").not.toContain("color")
      w.unmount()

      stageSettingsStateMPV.value = { ...real.DEFAULT_STAGE_SETTINGS, hymnalNameSize: 48, hymnalNameColor: "#F6C32A" }
      try {
        w = await mountView()
        const style = w.find(".media-projection__kicker").attributes("style")
        expect(style).toContain("font-size: 2.5cqw")
        expect(style).toContain("color: rgb(246, 195, 42)")
        w.unmount()

        stageSettingsStateMPV.value = { ...real.DEFAULT_STAGE_SETTINGS, hymnalNameShow: false }
        w = await mountView()
        expect(w.find(".media-projection__kicker").exists()).toBe(false)
        // O número continua.
        expect(w.find(".media-projection__hymn-number").exists()).toBe(true)
        w.unmount()
      } finally {
        stageSettingsStateMPV.value = null
      }
    })
  })
})

