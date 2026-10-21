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
      visualIdentity: { title: "Um visual para o seu culto", subtitle: "Preferências salvas automaticamente" },
      settings: {
        appearance: {
          experienceTitle: "Um visual para o seu culto",
          experienceSubtitle: "Preferências salvas automaticamente",
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
      "Um visual para o seu culto",
    );
    expect(wrapper.find(".appearance-experience__subtitle").text()).toBe(
      "Preferências salvas automaticamente",
    );
  });

  it("apresenta modos, paleta e prévia de estados", () => {
    const wrapper = mountView();
    expect(wrapper.findAll('.appearance-modes button')).toHaveLength(3);
    expect(wrapper.find('.appearance-experience__controls .stub-acc').exists()).toBe(true);
    expect(wrapper.find('.appearance-preview').exists()).toBe(true);
    expect(wrapper.findAll('.appearance-states span')).toHaveLength(4);
    wrapper.unmount();
  });

  it("SHOW_LYRIC_CUSTOMIZATION=false: seção de letra não renderiza", () => {
    const wrapper = mountView();
    expect(wrapper.find(".stub-lyr").exists()).toBe(false);
    expect(wrapper.find(".appearance-experience__lyrics").exists()).toBe(false);
    void nextTick;
  });

  it("VITE_SHOW_LYRIC_CUSTOMIZATION=1: seção de letra renderiza (feature flag ligada)", () => {
    vi.stubEnv("VITE_SHOW_LYRIC_CUSTOMIZATION", "1");
    const wrapper = mountView();
    expect(wrapper.find(".appearance-experience__lyrics").exists()).toBe(true);
    expect(wrapper.find(".stub-lyr").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllEnvs();
  });
});
