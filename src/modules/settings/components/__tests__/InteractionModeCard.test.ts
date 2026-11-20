// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * Cards de Appearance (InteractionModeCard) — mocka useAppearanceSettings
 * (fachada do design-system, já 100% coberta pelo teste do composable).
 */
const mocks = vi.hoisted(() => ({
  interactionKey: null as unknown as { value: string },
  setInteractionMode: vi.fn(),
}));

vi.mock("../../composables/useAppearanceSettings", async () => {
  const { ref } = await import("vue");
  mocks.interactionKey = ref("dynamic");
  return {
    useAppearanceSettings: vi.fn(() => ({
      interactionKey: mocks.interactionKey,
      setInteractionMode: mocks.setInteractionMode,
    })),
  };
});

import InteractionModeCard from "../InteractionModeCard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        appearance: {
          interactions: "Interações",
          interactionsHint: "Escolha o estilo das transições",
          interactionDynamic: "Dinâmico",
          interactionSoft: "Suave",
          interactionMist: "Névoa",
        },
      },
    },
  } as never,
});

function mountCard() {
  return mount(InteractionModeCard, {
    global: { plugins: [i18n] },
  });
}

describe("InteractionModeCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.interactionKey.value = "dynamic";
  });

  it("renderiza header, hint e os 3 chips", () => {
    const wrapper = mountCard();
    expect(wrapper.find(".interaction-card__title").text()).toBe("Interações");
    expect(wrapper.find(".interaction-card__hint").text()).toBe(
      "Escolha o estilo das transições",
    );
    const chips = wrapper.findAll(".interaction-card__chip");
    expect(chips).toHaveLength(3);
    expect(chips[0]!.text()).toBe("Dinâmico");
    expect(chips[1]!.text()).toBe("Suave");
    expect(chips[2]!.text()).toBe("Névoa");
  });

  it("chip ativo reflete interactionKey com aria-pressed", () => {
    const wrapper = mountCard();
    const chips = wrapper.findAll(".interaction-card__chip");
    expect(chips[0]!.classes()).toContain("interaction-card__chip--active");
    expect(chips[0]!.attributes("aria-pressed")).toBe("true");
    expect(chips[1]!.attributes("aria-pressed")).toBe("false");
  });

  it("click num chip chama setInteractionMode com o id", async () => {
    const wrapper = mountCard();
    const chips = wrapper.findAll(".interaction-card__chip");
    await chips[2]!.trigger("click");
    expect(mocks.setInteractionMode).toHaveBeenCalledWith("mist");
  });

  it("mudança reativa de interactionKey move o chip ativo", async () => {
    const wrapper = mountCard();
    mocks.interactionKey.value = "soft";
    await wrapper.vm.$nextTick();
    const chips = wrapper.findAll(".interaction-card__chip");
    expect(chips[0]!.attributes("aria-pressed")).toBe("false");
    expect(chips[1]!.classes()).toContain("interaction-card__chip--active");
  });
});
