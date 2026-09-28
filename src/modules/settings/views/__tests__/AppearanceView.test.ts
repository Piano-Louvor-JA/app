// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { nextTick } from "vue";

/**
 * AppearanceView — layout da aba Aparência (hero + 3 colunas).
 * Filhos mockados (cada um já tem teste próprio); valida hydrate on mount,
 * layout e o gate SHOW_LYRIC_CUSTOMIZATION=false.
 */
const hydrateMock = vi.fn();

vi.mock("../../composables/useProjectionSettings", () => ({
  useProjectionSettings: vi.fn(() => ({
    hydrate: hydrateMock,
  })),
}));

vi.mock("../InteractionModeCard.vue", () => ({
  default: { name: "InteractionModeCard", template: "<div class='stub-imc' />" },
}));
vi.mock("../ThemeOrbitalSwitcher.vue", () => ({
  default: { name: "ThemeOrbitalSwitcher", template: "<div class='stub-tos' />" },
}));
vi.mock("../AccentColorCard.vue", () => ({
  default: { name: "AccentColorCard", template: "<div class='stub-acc' />" },
}));
vi.mock("../LyricCustomizationCard.vue", () => ({
  default: { name: "LyricCustomizationCard", template: "<div class='stub-lyr' />" },
}));
vi.mock("../../components/InteractionModeCard.vue", () => ({
  default: { name: "InteractionModeCard", template: "<div class='stub-imc' />" },
}));
vi.mock("../../components/ThemeOrbitalSwitcher.vue", () => ({
  default: { name: "ThemeOrbitalSwitcher", template: "<div class='stub-tos' />" },
}));
vi.mock("../../components/AccentColorCard.vue", () => ({
  default: { name: "AccentColorCard", template: "<div class='stub-acc' />" },
}));
vi.mock("../../components/LyricCustomizationCard.vue", () => ({
  default: { name: "LyricCustomizationCard", template: "<div class='stub-lyr' />" },
}));

import AppearanceView from "../AppearanceView.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        appearance: {
          experienceTitle: "Personalize sua experiência",
          experienceSubtitle: "Ajuste tema, cores e interações",
        },
      },
    },
  } as never,
});

function mountView() {
  return mount(AppearanceView, {
    global: { plugins: [i18n] },
  });
}

describe("AppearanceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("monta e chama hydrate uma vez", async () => {
    const wrapper = mountView();
    await wrapper.vm.$nextTick();
    expect(hydrateMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("renderiza hero com título e subtítulo", () => {
    const wrapper = mountView();
    expect(wrapper.find(".appearance-experience__title").text()).toBe(
      "Personalize sua experiência",
    );
    expect(wrapper.find(".appearance-experience__subtitle").text()).toBe(
      "Ajuste tema, cores e interações",
    );
  });

  it("layout com 3 colunas: interações à esquerda, tema no centro, accent à direita", () => {
    const wrapper = mountView();
    const left = wrapper.find(".appearance-experience__col--left");
    const center = wrapper.find(".appearance-experience__center");
    const right = wrapper.find(".appearance-experience__col--right");
    expect(left.exists()).toBe(true);
    expect(center.exists()).toBe(true);
    expect(right.exists()).toBe(true);
    expect(left.html()).toContain("stub-imc");
    expect(center.html()).toContain("stub-tos");
    expect(right.html()).toContain("stub-acc");
  });

  it("SHOW_LYRIC_CUSTOMIZATION=false: seção de letra não renderiza", () => {
    const wrapper = mountView();
    expect(wrapper.find(".stub-lyr").exists()).toBe(false);
    expect(wrapper.find(".appearance-experience__lyrics").exists()).toBe(false);
    void nextTick;
  });
});
