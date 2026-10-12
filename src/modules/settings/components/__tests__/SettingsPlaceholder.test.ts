// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

import SettingsPlaceholder from "../SettingsPlaceholder.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": { settings: { soon: "Em breve" } },
  } as never,
});

describe("SettingsPlaceholder", () => {
  it("renderiza a mensagem traduzida da messageKey", () => {
    const wrapper = mount(SettingsPlaceholder, {
      props: { messageKey: "settings.soon" },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find("section.settings-placeholder").exists()).toBe(true);
    expect(wrapper.find("p").text()).toBe("Em breve");
  });

  it("chave inexistente: vue-i18n renderiza a própria chave", () => {
    const wrapper = mount(SettingsPlaceholder, {
      props: { messageKey: "settings.naoExiste" },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find("p").text()).toBe("settings.naoExiste");
  });
});
