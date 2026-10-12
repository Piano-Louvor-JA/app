// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

// useUiZoom é singleton de módulo (ref fora da função) — mockamos o composable
// inteiro; os refs reais são criados dentro da factory do mock (que roda async
// e pode importar o vue) e guardados neste holder visível aos testes
import type { Ref } from "vue";

const zoomState = vi.hoisted(() => ({
  zoomPercent: null as unknown as Ref<number>,
  canZoomIn: null as unknown as Ref<boolean>,
  canZoomOut: null as unknown as Ref<boolean>,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}));

vi.mock("@shared/composables/useUiZoom", async () => {
  const { ref } = await import("vue");
  zoomState.zoomPercent = ref(100);
  zoomState.canZoomIn = ref(true);
  zoomState.canZoomOut = ref(true);
  return {
    useUiZoom: vi.fn(() => zoomState),
  };
});

import UiZoomControls from "../UiZoomControls.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      uiZoom: {
        label: "Zoom da página",
        zoomIn: "Aumentar zoom",
        zoomOut: "Diminuir zoom",
      },
    },
  } as never,
});

function mountControls() {
  return mount(UiZoomControls, {
    global: { plugins: [i18n] },
  });
}

describe("UiZoomControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    zoomState.zoomPercent.value = 100;
    zoomState.canZoomIn.value = true;
    zoomState.canZoomOut.value = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renderiza grupo com aria-label, percentual e dois botões", () => {
    const wrapper = mountControls();
    expect(wrapper.find('[role="group"]').attributes("aria-label")).toBe(
      "Zoom da página",
    );
    expect(wrapper.find(".ui-zoom-controls__value").text()).toBe("100%");
    const btns = wrapper.findAll("button.ui-zoom-controls__btn");
    expect(btns).toHaveLength(2);
    expect(btns[0]!.attributes("aria-label")).toBe("Diminuir zoom");
    expect(btns[0]!.attributes("title")).toBe("Diminuir zoom");
    expect(btns[1]!.attributes("aria-label")).toBe("Aumentar zoom");
    expect(btns[1]!.attributes("title")).toBe("Aumentar zoom");
  });

  it("click em − chama zoomOut; click em + chama zoomIn", async () => {
    const wrapper = mountControls();
    const btns = wrapper.findAll("button.ui-zoom-controls__btn");
    await btns[0]!.trigger("click");
    await btns[1]!.trigger("click");
    expect(zoomState.zoomOut).toHaveBeenCalledTimes(1);
    expect(zoomState.zoomIn).toHaveBeenCalledTimes(1);
  });

  it("canZoomOut=false desabilita botão − e click não chama zoomOut", async () => {
    zoomState.canZoomOut.value = false;
    const wrapper = mountControls();
    const btns = wrapper.findAll("button.ui-zoom-controls__btn");
    expect(btns[0]!.attributes("disabled")).toBeDefined();
    await btns[0]!.trigger("click");
    expect(zoomState.zoomOut).not.toHaveBeenCalled();
    // + continua habilitado
    expect(btns[1]!.attributes("disabled")).toBeUndefined();
  });

  it("canZoomIn=false desabilita botão + e click não chama zoomIn", async () => {
    zoomState.canZoomIn.value = false;
    const wrapper = mountControls();
    const btns = wrapper.findAll("button.ui-zoom-controls__btn");
    expect(btns[1]!.attributes("disabled")).toBeDefined();
    await btns[1]!.trigger("click");
    expect(zoomState.zoomIn).not.toHaveBeenCalled();
    expect(btns[0]!.attributes("disabled")).toBeUndefined();
  });

  it("percentual é reativo: zoom muda, texto acompanha", async () => {
    const wrapper = mountControls();
    expect(wrapper.find(".ui-zoom-controls__value").text()).toBe("100%");
    zoomState.zoomPercent.value = 125;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".ui-zoom-controls__value").text()).toBe("125%");
  });

  it("ícones são decorativos (aria-hidden)", () => {
    const wrapper = mountControls();
    const icons = wrapper.findAll("i.ti");
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.attributes("aria-hidden")).toBe("true");
    }
  });
});
