// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MultiScreenSelectCard — seleção de telas estendidas para projeção.
 * Mocka useProjectionSettings (fachada da store já coberta).
 */
const mocks = vi.hoisted(() => ({
  extendedMonitorOptions: null as unknown as { value: Array<{ id: number; label: string; isSelected: boolean }> },
  hasExtendedDisplays: null as unknown as { value: boolean },
  toggleExtendedMonitor: vi.fn(),
}));

vi.mock("../../composables/useProjectionSettings", async () => {
  const { ref } = await import("vue");
  mocks.extendedMonitorOptions = ref([
    { id: 1, label: "Monitor 1", isSelected: true },
    { id: 2, label: "Monitor 2", isSelected: false },
  ]);
  mocks.hasExtendedDisplays = ref(true);
  return {
    useProjectionSettings: vi.fn(() => ({
      extendedMonitorOptions: mocks.extendedMonitorOptions,
      hasExtendedDisplays: mocks.hasExtendedDisplays,
      toggleExtendedMonitor: mocks.toggleExtendedMonitor,
    })),
  };
});

vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: "<div class=\"glass-stub\"><slot /></div>",
  },
}));

import MultiScreenSelectCard from "../MultiScreenSelectCard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        projection: {
          slides: {
            title: "Telas",
            multiScreens: "Múltiplas telas",
            projectOn: "Projetar em",
            noExtended: "Nenhuma tela estendida detectada",
          },
          monitors: { extended: "Estendida" },
        },
      },
    },
  } as never,
});

function mountCard() {
  return mount(MultiScreenSelectCard, {
    global: { plugins: [i18n] },
  });
}

describe("MultiScreenSelectCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasExtendedDisplays.value = true;
    mocks.extendedMonitorOptions.value = [
      { id: 1, label: "Monitor 1", isSelected: true },
      { id: 2, label: "Monitor 2", isSelected: false },
    ];
  });

  it("renderiza título, label de seção e caption", () => {
    const wrapper = mountCard();
    expect(wrapper.find(".multi-screen__title").text()).toBe("Telas");
    expect(wrapper.find(".multi-screen__section-label").text()).toContain(
      "Múltiplas telas",
    );
    expect(wrapper.find(".multi-screen__caption").text()).toBe("Projetar em");
  });

  it("com telas estendidas: grid com um botão por monitor", () => {
    const wrapper = mountCard();
    const options = wrapper.findAll(".multi-screen__option");
    expect(options).toHaveLength(2);
    expect(options[0]!.text()).toContain("Monitor 1");
    expect(options[0]!.attributes("aria-pressed")).toBe("true");
    expect(options[1]!.attributes("aria-pressed")).toBe("false");
    expect(options[0]!.classes()).toContain("multi-screen__option--active");
  });

  it("click no monitor chama toggleExtendedMonitor com o id", async () => {
    const wrapper = mountCard();
    const options = wrapper.findAll(".multi-screen__option");
    await options[1]!.trigger("click");
    expect(mocks.toggleExtendedMonitor).toHaveBeenCalledWith(2);
  });

  it("sem telas estendidas: mostra empty state em vez do grid", () => {
    mocks.hasExtendedDisplays.value = false;
    const wrapper = mountCard();
    expect(wrapper.find(".multi-screen__grid").exists()).toBe(false);
    expect(wrapper.find(".multi-screen__empty").text()).toBe(
      "Nenhuma tela estendida detectada",
    );
  });

  it("icone reflete seleção (screen-share vs off)", () => {
    const wrapper = mountCard();
    const icons = wrapper.findAll(".multi-screen__option-icon");
    expect(icons[0]!.classes()).toContain("ti-screen-share");
    expect(icons[1]!.classes()).toContain("ti-device-desktop-off");
  });
});
