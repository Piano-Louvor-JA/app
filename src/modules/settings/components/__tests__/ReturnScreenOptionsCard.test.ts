// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * ReturnScreenOptionsCard — toggle + seleção do monitor de retorno.
 * Mocka useProjectionSettings (fachada da store já coberta) e SettingsToggle.
 */
const mocks = vi.hoisted(() => ({
  settings: null as unknown as Record<string, unknown>,
  monitorOptions: null as unknown as {
    value: Array<{ id: number; label: string; isPrimary: boolean }>
  },
  setOpenReturnScreen: vi.fn(),
  selectReturnDisplay: vi.fn(),
}));

vi.mock("../../composables/useProjectionSettings", async () => {
  const { reactive, ref } = await import("vue");
  mocks.settings = reactive({
    openReturnScreen: true,
    returnDisplayId: 2,
  });
  mocks.monitorOptions = ref([
    { id: 1, label: "Display 1", isPrimary: true },
    { id: 2, label: "Display 2", isPrimary: false },
  ]);
  return {
    useProjectionSettings: vi.fn(() => ({
      settings: mocks.settings,
      monitorOptions: mocks.monitorOptions,
      setOpenReturnScreen: mocks.setOpenReturnScreen,
      selectReturnDisplay: mocks.selectReturnDisplay,
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

import ReturnScreenOptionsCard from "../ReturnScreenOptionsCard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        projection: {
          returnScreen: {
            title: "Tela de retorno",
            enable: "Ativar tela de retorno",
            selectMonitor: "Selecionar monitor",
            empty: "Nenhum monitor disponível",
          },
          monitors: { primary: "Principal", extended: "Estendida" },
        },
      },
    },
  } as never,
});

function mountCard() {
  return mount(ReturnScreenOptionsCard, {
    global: { plugins: [i18n] },
  });
}

describe("ReturnScreenOptionsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.openReturnScreen = true;
    mocks.settings.returnDisplayId = 2;
    mocks.monitorOptions.value = [
      { id: 1, label: "Display 1", isPrimary: true },
      { id: 2, label: "Display 2", isPrimary: false },
    ];
  });

  it("renderiza título, row do toggle e caption", () => {
    const wrapper = mountCard();
    expect(wrapper.find(".return-screen__title").text()).toBe(
      "Tela de retorno",
    );
    expect(wrapper.find(".return-screen__label-btn").text()).toBe(
      "Ativar tela de retorno",
    );
    expect(wrapper.find(".return-screen__caption").text()).toBe(
      "Selecionar monitor",
    );
  });

  it("click no label alterna openReturnScreen", async () => {
    const wrapper = mountCard();
    await wrapper.find(".return-screen__label-btn").trigger("click");
    expect(mocks.setOpenReturnScreen).toHaveBeenCalledWith(false);
  });

  it("update do toggle chama setOpenReturnScreen com o valor", async () => {
    const wrapper = mountCard();
    await wrapper.find(".toggle-stub").trigger("click");
    expect(mocks.setOpenReturnScreen).toHaveBeenCalledWith(false);
  });

  it("lista monitores com radio, marca o selecionado e o meta primary/extended", () => {
    const wrapper = mountCard();
    const options = wrapper.findAll(".return-screen__option");
    expect(options).toHaveLength(2);
    expect(options[0]!.text()).toContain("Display 1");
    expect(options[0]!.text()).toContain("Principal");
    expect(options[1]!.text()).toContain("Estendida");
    expect(options[1]!.attributes("aria-checked")).toBe("true");
    expect(options[0]!.attributes("aria-checked")).toBe("false");
    expect(options[1]!.classes()).toContain("return-screen__option--active");
  });

  it("click no monitor chama selectReturnDisplay com o id", async () => {
    const wrapper = mountCard();
    const options = wrapper.findAll(".return-screen__option");
    await options[0]!.trigger("click");
    expect(mocks.selectReturnDisplay).toHaveBeenCalledWith(1);
  });

  it("sem monitores: empty state no lugar do grid", () => {
    mocks.monitorOptions.value = [];
    const wrapper = mountCard();
    expect(wrapper.find(".return-screen__grid").exists()).toBe(false);
    expect(wrapper.find(".return-screen__empty").text()).toBe(
      "Nenhum monitor disponível",
    );
  });
});
