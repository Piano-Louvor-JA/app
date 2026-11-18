// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * AccentColorCard — swatches de cor de destaque.
 * Mocka useAppearanceSettings (fachada design-system já coberta).
 */
const mocks = vi.hoisted(() => ({
  accentKey: null as unknown as { value: string },
  customAccent: null as unknown as { value: string | null },
  setAccentColor: vi.fn(),
  setCustomAccent: vi.fn(),
  resetAccent: vi.fn(),
}));

vi.mock("../../composables/useAppearanceSettings", async () => {
  const { ref } = await import("vue");
  mocks.accentKey = ref("blue");
  mocks.customAccent = ref<string | null>(null);
  return {
    useAppearanceSettings: vi.fn(() => ({
      accents: {
        blue: { primary: "#2196f3", label: "Azul" },
        green: { primary: "#4caf50", label: "Verde" },
        amber: { primary: "#ffc107", label: "Âmbar" },
      },
      accentKey: mocks.accentKey,
      customAccent: mocks.customAccent,
      setAccentColor: mocks.setAccentColor,
      setCustomAccent: mocks.setCustomAccent,
      resetAccent: mocks.resetAccent,
    })),
  };
});

// GlassCard real puxa o design-system inteiro — stuba pra um container simples
vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: "<div class=\"glass-stub\"><slot /></div>",
  },
}));

import AccentColorCard from "../AccentColorCard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        appearance: { accentColor: "Cor de destaque" },
      },
    },
  } as never,
});

function mountCard() {
  return mount(AccentColorCard, {
    global: { plugins: [i18n] },
  });
}

describe("AccentColorCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accentKey.value = "blue";
    mocks.customAccent.value = null;
  });

  it("renderiza título e um swatch por accent", () => {
    const wrapper = mountCard();
    expect(wrapper.find(".accent-color__title").text()).toBe(
      "Cor de destaque",
    );
    const swatches = wrapper.findAll(".accent-color__swatch");
    // 3 prontos + o seletor de cor livre
    expect(swatches).toHaveLength(4);
    expect(swatches[3]!.classes()).toContain("accent-color__swatch--custom");
  });

  it("cor livre: o seletor aplica a cor e marca o swatch próprio", async () => {
    const wrapper = mountCard();
    const input = wrapper.find('input[type="color"]');
    (input.element as HTMLInputElement).value = "#123456";
    await input.trigger("input");
    expect(mocks.setCustomAccent).toHaveBeenCalledWith("#123456");
    mocks.customAccent.value = "#123456";
    await wrapper.vm.$nextTick();
    const swatches = wrapper.findAll(".accent-color__swatch");
    expect(swatches[0]!.classes()).not.toContain("accent-color__swatch--active");
    expect(swatches[3]!.classes()).toContain("accent-color__swatch--active");
  });

  it("restaurar padrão chama resetAccent", async () => {
    const wrapper = mountCard();
    await wrapper.find(".accent-color__restore").trigger("click");
    expect(mocks.resetAccent).toHaveBeenCalled();
  });

  it("swatch ativo reflete accentKey", () => {
    const wrapper = mountCard();
    const swatches = wrapper.findAll(".accent-color__swatch");
    expect(swatches[0]!.classes()).toContain("accent-color__swatch--active");
    expect(swatches[1]!.classes()).not.toContain(
      "accent-color__swatch--active",
    );
  });

  it("click no swatch chama setAccentColor com a key", async () => {
    const wrapper = mountCard();
    const swatches = wrapper.findAll(".accent-color__swatch");
    await swatches[2]!.trigger("click");
    expect(mocks.setAccentColor).toHaveBeenCalledWith("amber");
  });

  it("mudança reativa de accentKey move o swatch ativo", async () => {
    const wrapper = mountCard();
    mocks.accentKey.value = "green";
    await wrapper.vm.$nextTick();
    const swatches = wrapper.findAll(".accent-color__swatch");
    expect(swatches[0]!.classes()).not.toContain(
      "accent-color__swatch--active",
    );
    expect(swatches[1]!.classes()).toContain("accent-color__swatch--active");
  });

  it("radiogroup com aria-label", () => {
    const wrapper = mountCard();
    expect(wrapper.find('[role="radiogroup"]').attributes("aria-label")).toBe(
      "Cor de destaque",
    );
  });
});
