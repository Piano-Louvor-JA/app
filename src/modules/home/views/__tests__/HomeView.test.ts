// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { h } from "vue";

vi.mock("vue", async () => {
  const actual = await vi.importActual<typeof import("vue")>("vue");
  return {
    ...actual,
    Teleport: {
      name: "Teleport",
      setup(
        _props: { to?: string; disabled?: boolean },
        { slots }: { slots: { default?: () => unknown } },
      ) {
        return () => h("div", { class: "teleport-stub" }, slots.default?.());
      },
    },
  };
});

// fns estáveis compartilhadas — o componente as recebe na 1a chamada e
// o teste afirma contra as MESMAS fns (nova chamada criaria vi.fn()s novos)
const setDistrictMock = vi.fn();
const setChurchMock = vi.fn();

vi.mock("@modules/home/composables/useHomeLocation", () => ({
  useHomeLocation: vi.fn(() => ({
    profile: { district: "Distrito X", church: "Igreja Y" },
    setDistrict: setDistrictMock,
    setChurch: setChurchMock,
  })),
}));

vi.mock("@modules/home/composables/useHomeClock", () => ({
  useHomeClock: vi.fn(() => ({
    formattedTime: "14:32",
  })),
}));

vi.mock("@assets/brand/logo-louvor-ja.svg", () => ({ default: "logo.svg" }));

import HomeView from "../HomeView.vue";

const homeLocale = (await import("../../locales/pt-BR")).default;

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      ...homeLocale,
      app: { name: "Louvor JA" },
    } as never,
  },
});

function mountView() {
  return mount(HomeView, {
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

describe("HomeView", () => {
  let active: ReturnType<typeof mountView> | null = null;

  afterEach(() => {
    active?.unmount();
    active = null;
    document.body.innerHTML = "";
  });

  it("renderiza logo com alt do app", () => {
    active = mountView();
    const logo = active.find("img.home-view__logo");
    expect(logo.exists()).toBe(true);
    expect(logo.attributes("alt")).toBe("Louvor JA");
    expect(logo.attributes("src")).toBe("logo.svg");
  });

  it("renderiza os dois campos com valores do profile", () => {
    active = mountView();
    const texts = active.findAll(".home-location-field__text");
    expect(texts).toHaveLength(2);
    expect(texts[0]!.text()).toBe("Distrito de Distrito X");
    expect(texts[1]!.text()).toBe("Igreja Igreja Y");
  });

  it("campo distrito salva via setDistrict; igreja via setChurch", async () => {
    active = mountView();

    // HomeLocationField real montado: emite save direto na instância do filho
    const child = active.findComponent({ name: "HomeLocationField" });
    expect(child.exists()).toBe(true);
    await child.vm.$emit("save", "Novo Distrito");

    const children = active.findAllComponents({ name: "HomeLocationField" });
    await children[1]!.vm.$emit("save", "Nova Igreja");

    expect(setDistrictMock).toHaveBeenCalledWith("Novo Distrito");
    expect(setChurchMock).toHaveBeenCalledWith("Nova Igreja");
  });

  it("relógio formata via useHomeClock e é aria-live", () => {
    active = mountView();
    const clock = active.find(".home-view__clock");
    expect(clock.text()).toBe("14:32");
    expect(clock.attributes("aria-live")).toBe("polite");
  });
});
