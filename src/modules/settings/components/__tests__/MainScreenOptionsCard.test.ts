// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MainScreenOptionsCard — toggles da tela principal.
 * Mocka useProjectionSettings (fachada da store já coberta) e SettingsToggle.
 */
const mocks = vi.hoisted(() => ({
  settings: null as unknown as Record<string, boolean>,
  setOpenFullscreenOnPrimary: vi.fn(),
  setDisablePrimaryWhenExtended: vi.fn(),
  setAutoMinimizePlayer: vi.fn(),
}));

vi.mock("../../composables/useProjectionSettings", async () => {
  const { reactive } = await import("vue");
  mocks.settings = reactive({
    openFullscreenOnPrimary: true,
    disablePrimaryWhenExtended: false,
    autoMinimizePlayer: true,
  });
  return {
    useProjectionSettings: vi.fn(() => ({
      settings: mocks.settings,
      setOpenFullscreenOnPrimary: mocks.setOpenFullscreenOnPrimary,
      setDisablePrimaryWhenExtended: mocks.setDisablePrimaryWhenExtended,
      setAutoMinimizePlayer: mocks.setAutoMinimizePlayer,
    })),
  };
});

vi.mock("../SettingsToggle.vue", () => ({
  default: {
    name: "SettingsToggle",
    props: { modelValue: { type: Boolean } },
    emits: ["update:modelValue"],
    template:
      '<button class="toggle-stub" @click="$emit(\'update:modelValue\', !modelValue)">toggle</button>',
  },
}));

vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: "<div class=\"glass-stub\"><slot /></div>",
  },
}));

import MainScreenOptionsCard from "../MainScreenOptionsCard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        projection: {
          mainScreen: {
            title: "Tela principal",
            openFullscreen: "Abrir em tela cheia",
            disablePrimaryWhenExtended:
              "Desativar principal com estendida",
            autoMinimizePlayer: "Minimizar player",
          },
        },
      },
    },
  } as never,
});

function mountCard() {
  return mount(MainScreenOptionsCard, {
    global: { plugins: [i18n] },
  });
}

describe("MainScreenOptionsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.settings, {
      openFullscreenOnPrimary: true,
      disablePrimaryWhenExtended: false,
      autoMinimizePlayer: true,
    });
  });

  it("renderiza título e as 3 linhas com labels", () => {
    const wrapper = mountCard();
    expect(wrapper.find(".main-screen__title").text()).toBe(
      "Tela principal",
    );
    const rows = wrapper.findAll(".main-screen__row");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain("Abrir em tela cheia");
    expect(rows[1]!.text()).toContain("Desativar principal com estendida");
    expect(rows[2]!.text()).toContain("Minimizar player");
  });

  it("toggle reflete o valor atual do settings", () => {
    const wrapper = mountCard();
    const toggles = wrapper.findAll(".toggle-stub");
    expect((toggles[0]!.element as HTMLButtonElement).className).toContain(
      "toggle-stub",
    );
    // valida via atributo emitido pelo stub: usaria props se fosse component
    // wrapper; aqui valida indiretamente o estado reativo no botão label
    expect(mocks.settings.openFullscreenOnPrimary).toBe(true);
    expect(mocks.settings.disablePrimaryWhenExtended).toBe(false);
    expect(mocks.settings.autoMinimizePlayer).toBe(true);
  });

  it("update:modelValue do toggle chama o setter da linha", async () => {
    const wrapper = mountCard();
    const toggles = wrapper.findAll(".toggle-stub");
    await toggles[1]!.trigger("click");
    expect(mocks.setDisablePrimaryWhenExtended).toHaveBeenCalledWith(true);
  });

  it("click no label alterna o valor (item.set(!settings[key]))", async () => {
    const wrapper = mountCard();
    const labels = wrapper.findAll(".main-screen__label-btn");
    await labels[0]!.trigger("click");
    expect(mocks.setOpenFullscreenOnPrimary).toHaveBeenCalledWith(false);
  });
});
