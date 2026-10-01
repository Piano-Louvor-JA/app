// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { createI18n } from "vue-i18n";

/**
 * RemoteControlView — card de Controle Remoto nas configurações.
 * Mocka useRemoteControl (composable com singleton/WS/receiver) e registra
 * stubs mínimos pros componentes Vuetify (import de CSS do vuetify quebra
 * no vitest node). Os stubs emitem update:modelValue como o vuetify real.
 */
const mocks = vi.hoisted(() => ({
  setSenderUrl: vi.fn(),
}));

const enabled = ref(false);
const connected = ref(false);
const senderUrl = ref("ws://192.168.1.10:7081/palco");

vi.mock("../../composables/useRemoteControl", () => ({
  useRemoteControl: () => ({
    enabled,
    connected,
    senderUrl: computed(() => senderUrl.value),
    setSenderUrl: mocks.setSenderUrl,
  }),
}));

vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: '<div class="glass-stub"><slot /></div>',
  },
}));

const VSwitchStub = {
  name: "VSwitch",
  props: ["modelValue", "label", "color"],
  emits: ["update:modelValue"],
  template:
    '<label class="sw-stub" data-testid="remote-enabled" @click="$emit(\'update:modelValue\', !modelValue)"><span class="sw-label">{{ label }}</span></label>',
};
const VTextFieldStub = {
  name: "VTextField",
  props: ["modelValue", "label", "disabled", "hint", "persistentHint", "placeholder"],
  emits: ["update:modelValue"],
  template:
    '<div class="fld-stub" data-testid="remote-sender-url" @click="$emit(\'update:modelValue\', \'typed-by-stub\')"><span class="fld-value">{{ modelValue }}</span></div>',
};
const VAlertStub = {
  name: "VAlert",
  props: ["type", "variant", "density"],
  template: '<div class="al-stub" data-testid="remote-status" :data-type="type"><slot /></div>',
};

import RemoteControlView from "../RemoteControlView.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        remote: {
          title: "Controle Remoto",
          description: "Controle o palco pelo celular",
          enable: "Ativar controle remoto",
          senderUrl: "URL do remetente",
          senderUrlHint: "ws://host:porta/palco",
          connected: "Celular conectado",
          connecting: "Aguardando conexão…",
        },
      },
    },
  } as never,
});

function mountView() {
  return mount(RemoteControlView, {
    global: {
      plugins: [i18n],
      components: { VSwitch: VSwitchStub, VTextField: VTextFieldStub, VAlert: VAlertStub },
    },
  });
}

const SWITCH = '[data-testid="remote-enabled"]';
const INPUT = '[data-testid="remote-sender-url"]';
const ALERT = '[data-testid="remote-status"]';

describe("RemoteControlView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enabled.value = false;
    connected.value = false;
    senderUrl.value = "ws://192.168.1.10:7081/palco";
  });

  it("monta com título, descrição, switch off e campo disabled", () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain("Controle Remoto");
    expect(wrapper.text()).toContain("Controle o palco pelo celular");

    expect(wrapper.findComponent(VSwitchStub).props("modelValue")).toBe(false);
    expect(wrapper.find(".sw-label").text()).toBe("Ativar controle remoto");
    expect(wrapper.findComponent(VSwitchStub).props("color")).toBe("primary");

    const field = wrapper.findComponent(VTextFieldStub);
    expect(field.props("disabled")).toBe(true);
    expect(field.props("placeholder")).toBe("ws://192.168.1.10:7081/palco");
    expect(field.props("hint")).toBe("settings.remote.senderUrlHint");
    expect(field.props("persistentHint")).toBeDefined();
    expect(field.props("modelValue")).toBe("ws://192.168.1.10:7081/palco");

    expect(wrapper.find(ALERT).exists()).toBe(false);
  });

  it("v-model do switch: toggle emite update:modelValue e liga o composable", async () => {
    const wrapper = mountView();
    await wrapper.find(SWITCH).trigger("click");
    await wrapper.vm.$nextTick();

    expect(enabled.value).toBe(true);
    expect(wrapper.findComponent(VSwitchStub).props("modelValue")).toBe(true);
  });

  it("ligado + desconectado: alerta 'info' (tonal) com texto de aguardando conexão", async () => {
    enabled.value = true;
    const wrapper = mountView();
    await wrapper.vm.$nextTick();

    const alert = wrapper.findComponent(VAlertStub);
    expect(alert.exists()).toBe(true);
    expect(alert.props("type")).toBe("info");
    expect(alert.props("variant")).toBe("tonal");
    expect(wrapper.find(ALERT).text()).toContain("Aguardando conexão");
  });

  it("ligado + connected: alerta 'success' com texto de conectado", async () => {
    enabled.value = true;
    connected.value = true;
    const wrapper = mountView();
    await wrapper.vm.$nextTick();

    const alert = wrapper.findComponent(VAlertStub);
    expect(alert.props("type")).toBe("success");
    expect(wrapper.find(ALERT).text()).toContain("Celular conectado");
  });

  it("ligado habilita o campo; update:modelValue do campo chama setSenderUrl", async () => {
    enabled.value = true;
    const wrapper = mountView();
    await wrapper.vm.$nextTick();

    const field = wrapper.findComponent(VTextFieldStub);
    expect(field.props("disabled")).toBe(false);

    await wrapper.find(INPUT).trigger("click");
    expect(mocks.setSenderUrl).toHaveBeenCalledTimes(1);
    expect(mocks.setSenderUrl).toHaveBeenCalledWith("typed-by-stub");
  });

  it("senderUrl do composable alimenta o campo e reage a mudanças externas", async () => {
    const wrapper = mountView();
    expect(wrapper.find(".fld-value").text()).toBe("ws://192.168.1.10:7081/palco");

    senderUrl.value = "ws://10.9.9.9:1234/palco";
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".fld-value").text()).toBe("ws://10.9.9.9:1234/palco");
  });
});
