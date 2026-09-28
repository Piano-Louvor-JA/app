// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { createPinia, setActivePinia } from "pinia";

/**
 * PalcoCard — liga/desliga o sender de cast (WS :7081) do desktop.
 * Mocka palco-session/palco-bridge (serviços Electron) e a media store.
 * getDesktopBridge não é usado direto pelo card — o gateway é palcoSession.
 */
const mocks = vi.hoisted(() => ({
  status: vi.fn(async (): Promise<{ running: boolean; clients: number; url: string | null }> => ({ running: false, clients: 0, url: null })),
  turnOn: vi.fn(async () => true),
  turnOff: vi.fn(async () => undefined),
  onReceiverConnected: vi.fn(),
  onReceiverDisconnected: vi.fn(),
  startPalcoBridge: vi.fn(),
  stopPalcoBridge: vi.fn(),
  isElectron: true,
  setAudioRoute: vi.fn(async () => undefined),
}));

vi.mock("../../services/palco-session", () => ({
  palcoSession: {
    get isElectron() {
      return mocks.isElectron;
    },
    status: mocks.status,
    turnOn: mocks.turnOn,
    turnOff: mocks.turnOff,
    onReceiverConnected: mocks.onReceiverConnected,
    onReceiverDisconnected: mocks.onReceiverDisconnected,
  },
}));

vi.mock("../../services/palco-bridge", () => ({
  startPalcoBridge: mocks.startPalcoBridge,
  stopPalcoBridge: mocks.stopPalcoBridge,
}));

vi.mock("@modules/media/stores/useMediaStore", () => ({
  useMediaStore: vi.fn(() => ({
    audioRoute: { value: "pc" },
    setAudioRoute: mocks.setAudioRoute,
  })),
}));

vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: "<div class=\"glass-stub\"><slot /></div>",
  },
}));

import PalcoCard from "../PalcoCard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        palco: {
          title: "Palco",
          subtitle: "Projetar na TV",
          connected: "{count} TV conectada(s)",
          waiting: "Aguardando TV…",
          hint: "Abra o app na TV",
          audioRoute: "Rota de áudio",
          audioPc: "PC",
          audioTv: "TV",
          audioBoth: "Ambos",
          desktopOnly: "Disponível só no desktop",
        },
      },
    },
  } as never,
});

function mountCard() {
  return mount(PalcoCard, {
    global: { plugins: [i18n, createPinia()] },
  });
}

describe("PalcoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isElectron = true;
    mocks.status.mockResolvedValue({ running: false, clients: 0, url: null });
  });

  it("monta, consulta status e registra handlers de receiver", async () => {
    const wrapper = mountCard();
    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.status).toHaveBeenCalled();
    expect(mocks.onReceiverConnected).toHaveBeenCalled();
    expect(mocks.onReceiverDisconnected).toHaveBeenCalled();
  });

  it("desligado: switch aria-checked=false e body oculto", async () => {
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    const sw = wrapper.find(".palco-card__switch");
    expect(sw.attributes("aria-checked")).toBe("false");
    expect(wrapper.find(".palco-card__body").exists()).toBe(false);
  });

  it("toggle liga: turnOn + startPalcoBridge + body com status e url", async () => {
    mocks.status
      .mockResolvedValueOnce({ running: false, clients: 0, url: null })
      .mockResolvedValueOnce({
        running: true,
        clients: 0,
        url: "http://10.0.0.5:7081",
      });
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    await wrapper.find(".palco-card__switch").trigger("click");
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(mocks.turnOn).toHaveBeenCalledTimes(1);
    // bridge sobe no toggle E no refreshStatus pós-toggle (running=true, wasOff) — 2x é o fluxo real
    expect(mocks.startPalcoBridge).toHaveBeenCalledTimes(2);
    expect(wrapper.find(".palco-card__switch").attributes("aria-checked")).toBe(
      "true",
    );
    expect(wrapper.find(".palco-card__body").exists()).toBe(true);
    expect(wrapper.find(".palco-card__url").text()).toContain(
      "http://10.0.0.5:7081",
    );
    expect(wrapper.find(".palco-card__status").text()).toContain(
      "Aguardando TV",
    );
  });

  it("status inicial running=true: bridge sobe no mount (wasOff -> on)", async () => {
    mocks.status.mockResolvedValue({
      running: true,
      clients: 2,
      url: "http://x:7081",
    });
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(mocks.startPalcoBridge).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".palco-card__status").text()).toContain("2");
    expect(wrapper.find(".palco-card__body").exists()).toBe(true);
  });

  it("toggle desliga: turnOff + stopPalcoBridge", async () => {
    mocks.status.mockResolvedValue({
      running: true,
      clients: 1,
      url: "http://x:7081",
    });
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    await wrapper.find(".palco-card__switch").trigger("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.turnOff).toHaveBeenCalledTimes(1);
    expect(mocks.stopPalcoBridge).toHaveBeenCalledTimes(1);
  });

  it("turnOn falha (ok=false): não sobe bridge", async () => {
    mocks.turnOn.mockResolvedValue(false);
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    await wrapper.find(".palco-card__switch").trigger("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.turnOn).toHaveBeenCalledTimes(1);
    expect(mocks.startPalcoBridge).not.toHaveBeenCalled();
  });

  it("copyUrl escreve no clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mocks.status.mockResolvedValue({
      running: true,
      clients: 0,
      url: "http://u:7081",
    });
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    await wrapper.find(".palco-card__url").trigger("click");
    expect(writeText).toHaveBeenCalledWith("http://u:7081");
  });

  it("rota de áudio: change no select chama setAudioRoute", async () => {
    mocks.status.mockResolvedValue({
      running: true,
      clients: 0,
      url: "http://x:7081",
    });
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    const select = wrapper.find(".palco-card__route select");
    await select.setValue("tv");
    expect(mocks.setAudioRoute).toHaveBeenCalledWith("tv");
  });

  it("fora do desktop (isElectron=false): switch desabilitado + aviso", async () => {
    mocks.isElectron = false;
    const wrapper = mountCard();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    const sw = wrapper.find(".palco-card__switch");
    expect(sw.attributes("aria-checked")).toBe("false");
    expect(sw.attributes("disabled")).toBe("");
    expect(wrapper.find(".palco-card__unavailable").text()).toBe(
      "Disponível só no desktop",
    );
  });
});
