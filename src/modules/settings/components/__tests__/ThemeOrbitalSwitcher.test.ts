// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * ThemeOrbitalSwitcher — seletor orbital de tema claro/escuro.
 * Mocka useAppearanceSettings (fachada design-system já coberta).
 */
const mocks = vi.hoisted(() => ({
  isDark: null as unknown as { value: boolean },
  setThemeMode: vi.fn(),
}));

vi.mock("../../composables/useAppearanceSettings", async () => {
  const { ref } = await import("vue");
  mocks.isDark = ref(false);
  return {
    useAppearanceSettings: vi.fn(() => ({
      isDark: mocks.isDark,
      setThemeMode: mocks.setThemeMode,
    })),
  };
});

vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: "<div class=\"glass-stub\"><slot /></div>",
  },
}));

import ThemeOrbitalSwitcher from "../ThemeOrbitalSwitcher.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        appearance: {
          lightMode: "Modo claro",
          darkMode: "Modo escuro",
          changeTheme: "Alterar tema",
        },
      },
    },
  } as never,
});

function mountCard() {
  return mount(ThemeOrbitalSwitcher, {
    global: { plugins: [i18n] },
  });
}

describe("ThemeOrbitalSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDark.value = false;
  });

  it("tema claro: sol ativo, lua oculta, switch desmarcado", () => {
    const wrapper = mountCard();
    const sun = wrapper.find(".theme-orbital__glyph--sun");
    const moon = wrapper.find(".theme-orbital__glyph--moon");
    expect(sun.classes()).not.toContain("theme-orbital__glyph--hidden");
    expect(moon.classes()).toContain("theme-orbital__glyph--hidden");
    expect(wrapper.find(".theme-orbital__glow").classes()).toContain(
      "theme-orbital__glow--light",
    );
    const modeBtns = wrapper.findAll(".theme-orbital__mode-btn");
    expect(modeBtns[0]!.classes()).toContain("theme-orbital__mode-btn--active");
    expect(modeBtns[1]!.classes()).not.toContain(
      "theme-orbital__mode-btn--active",
    );
  });

  it("tema escuro: esfera dark, lua visível, track do switch on", async () => {
    mocks.isDark.value = true;
    const wrapper = mountCard();
    expect(wrapper.find(".theme-orbital__sphere").classes()).toContain(
      "theme-orbital__sphere--dark",
    );
    expect(
      wrapper.find(".theme-orbital__switch-track").classes(),
    ).toContain("theme-orbital__switch-track--on");
    const modeBtns = wrapper.findAll(".theme-orbital__mode-btn");
    expect(modeBtns[1]!.classes()).toContain("theme-orbital__mode-btn--active");
    // thumb só renderiza ícone conforme isDark: v-if="!isDark" (sol) —
    // no escuro o v-if some, então não há ícone no thumb
    expect(
      wrapper.find(".theme-orbital__switch-thumb-icon").exists(),
    ).toBe(false);
  });

  it("botão claro chama setThemeMode('light'); escuro chama 'dark'", async () => {
    const wrapper = mountCard();
    const modeBtns = wrapper.findAll(".theme-orbital__mode-btn");
    await modeBtns[0]!.trigger("click");
    expect(mocks.setThemeMode).toHaveBeenCalledWith("light");
    await modeBtns[1]!.trigger("click");
    expect(mocks.setThemeMode).toHaveBeenCalledWith("dark");
  });

  it("switch alterna: claro -> dark, escuro -> light", async () => {
    const wrapper = mountCard();
    const sw = wrapper.find(".theme-orbital__switch");
    await sw.trigger("click");
    expect(mocks.setThemeMode).toHaveBeenLastCalledWith("dark");

    mocks.isDark.value = true;
    await wrapper.vm.$nextTick();
    await sw.trigger("click");
    expect(mocks.setThemeMode).toHaveBeenLastCalledWith("light");
  });

  it("switch tem role/aria-checked refletindo isDark e label do tema", async () => {
    const wrapper = mountCard();
    const sw = wrapper.find(".theme-orbital__switch");
    expect(sw.attributes("role")).toBe("switch");
    expect(sw.attributes("aria-checked")).toBe("false");
    expect(sw.attributes("aria-label")).toBe("Alterar tema");

    mocks.isDark.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".theme-orbital__switch").attributes("aria-checked")).toBe(
      "true",
    );
  });

  it("label inferior mostra changeTheme", () => {
    const wrapper = mountCard();
    expect(wrapper.find(".theme-orbital__label").text()).toBe("Alterar tema");
  });
});
