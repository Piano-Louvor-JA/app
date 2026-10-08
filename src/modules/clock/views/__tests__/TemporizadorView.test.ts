// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

import TemporizadorView from "../TemporizadorView.vue";

const push = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
}));

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      utilities: {
        backToUtilities: "Voltar para utilitários",
        temporizador: "Temporizador",
        temporizadorSubtitle: "Hub de utilitários de tempo",
      },
    },
  },
});

const UtilitiesHubCardStub = {
  name: "UtilitiesHubCard",
  props: ["titleKey", "descriptionKey", "icon", "to", "available"],
  template: `<div class="stub-hub-card" :data-title="titleKey" :data-description="descriptionKey" :data-icon="icon" :data-to="String(to)" :data-available="String(available)" />`,
};

function mountView() {
  return mount(TemporizadorView, {
    global: {
      plugins: [i18n],
      stubs: { UtilitiesHubCard: UtilitiesHubCardStub },
    },
  });
}

describe("TemporizadorView.vue", () => {
  it("renderiza título e subtítulo e o botão de voltar com aria-label via i18n", () => {
    const wrapper = mountView();
    expect(wrapper.find(".temporizador-view__title").text()).toBe(
      "Temporizador",
    );
    expect(wrapper.find(".temporizador-view__subtitle").text()).toBe(
      "Hub de utilitários de tempo",
    );
    const back = wrapper.find(".temporizador-view__back");
    expect(back.attributes("aria-label")).toBe("Voltar para utilitários");
    expect(back.find("i.ti-arrow-left").exists()).toBe(true);
  });

  it("renderiza um UtilitiesHubCard para cada item do hub com os dados corretos", () => {
    const wrapper = mountView();
    const cards = wrapper.findAll(".stub-hub-card");
    expect(cards).toHaveLength(3);

    expect(cards[0].attributes("data-title")).toBe("utilities.clock");
    expect(cards[0].attributes("data-description")).toBe(
      "utilities.clockDescription",
    );
    expect(cards[0].attributes("data-icon")).toBe("ti-clock");
    expect(cards[0].attributes("data-to")).toBe("/utilities/clock");
    expect(cards[0].attributes("data-available")).toBe("true");

    expect(cards[1].attributes("data-title")).toBe("utilities.timer");
    expect(cards[1].attributes("data-description")).toBe(
      "utilities.timerDescription",
    );
    expect(cards[1].attributes("data-icon")).toBe("ti-clock");
    expect(cards[1].attributes("data-to")).toBe("/utilities/timer");
    expect(cards[1].attributes("data-available")).toBe("true");

    expect(cards[2].attributes("data-title")).toBe("utilities.countdown");
    expect(cards[2].attributes("data-description")).toBe(
      "utilities.countdownDescription",
    );
    expect(cards[2].attributes("data-icon")).toBe("ti-hourglass");
    expect(cards[2].attributes("data-to")).toBe("/utilities/countdown");
    expect(cards[2].attributes("data-available")).toBe("true");
  });

  it("cada card é chaveado pelo key do item", () => {
    const wrapper = mountView();
    const cards = wrapper.findAll(".stub-hub-card");
    expect(cards.map((c) => c.attributes("data-title"))).toEqual([
      "utilities.clock",
      "utilities.timer",
      "utilities.countdown",
    ]);
  });

  it("goBack navega para a rota nomeada 'utilities' ao clicar no botão de voltar", async () => {
    const wrapper = mountView();
    push.mockClear();
    await wrapper.find(".temporizador-view__back").trigger("click");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ name: "utilities" });
  });
});
