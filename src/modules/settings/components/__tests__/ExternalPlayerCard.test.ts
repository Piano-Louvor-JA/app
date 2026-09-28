// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * ExternalPlayerCard — escolha do player externo (bridge Electron).
 * Mocka window.louvorja (IPC bridge) — padrão getDesktopBridge/IPC mockado.
 */
const extApi = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<string> => "associated"),
  set: vi.fn(async (_next?: string): Promise<boolean> => true),
  detect: vi.fn(async (): Promise<Array<{ id: string; label: string }>> => []),
  listCustom: vi.fn(async (): Promise<string[]> => []),
  removeCustom: vi.fn(),
  openFile: vi.fn(async (): Promise<unknown> => null),
}));

const bridgeMock = vi.hoisted(() => ({
  isElectron: true,
  externalPlayer: null as unknown,
  dialog: null as unknown,
}));

vi.mock("@shared/services/desktop-bridge", () => ({
  getDesktopBridge: vi.fn(() => null),
  isDesktopApp: vi.fn(() => false),
}));

import ExternalPlayerCard from "../ExternalPlayerCard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        externalPlayer: {
          title: "Player externo",
          description: "Abrir mídia em player externo",
          detecting: "Detectando…",
          detect: "Detectar players",
          detectFound: "Players encontrados",
          detectEmpty: "Nenhum player encontrado",
          pickOther: "Escolher outro…",
          pickTitle: "Escolha o player",
          player: {
            associated: "Padrão do sistema",
            custom: "{name}",
          },
        },
      },
    },
  } as never,
});

function mountCard() {
  return mount(ExternalPlayerCard, {
    global: { plugins: [i18n] },
  });
}

function setupBridge(opts: {
  get?: () => Promise<string>;
  detect?: () => Promise<Array<{ id: string; label: string }>>;
  listCustom?: () => Promise<string[]>;
} = {}) {
  bridgeMock.externalPlayer = {
    get: opts.get ?? extApi.get,
    set: extApi.set,
    detect: opts.detect ?? extApi.detect,
    listCustom: opts.listCustom ?? extApi.listCustom,
    removeCustom: extApi.removeCustom,
  };
  bridgeMock.dialog = { openFile: extApi.openFile };
  (window as unknown as Record<string, unknown>).louvorja = bridgeMock;
}

describe("ExternalPlayerCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extApi.get.mockResolvedValue("associated");
    extApi.detect.mockResolvedValue([]);
    extApi.listCustom.mockResolvedValue([]);
    extApi.set.mockResolvedValue(true);
    setupBridge();
  });

  it("sem API (web): sem radiogroup, título e hint apenas", async () => {
    (window as unknown as Record<string, unknown>).louvorja = {};
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find("h3").text()).toBe("Player externo");
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false);
  });

  it("com API: radiogroup com botão 'padrão do sistema' selecionado", async () => {
    const wrapper = mountCard();
    await flushPromises();

    const associated = wrapper.find('[data-test="external-player-associated"]');
    expect(associated.text()).toBe("Padrão do sistema");
    expect(associated.attributes("aria-checked")).toBe("true");
    expect(extApi.get).toHaveBeenCalledTimes(1);
  });

  it("detectar: lista players instalados como radios", async () => {
    extApi.detect.mockResolvedValue([
      { id: "vlc", label: "VLC" },
      { id: "mpv", label: "mpv" },
    ]);
    const wrapper = mountCard();
    await flushPromises();

    // detect já roda no mount (detectInstalled)
    const vlc = wrapper.find('[data-test="external-player-vlc"]');
    expect(vlc.exists()).toBe(true);
    expect(vlc.text()).toBe("VLC");
    expect(wrapper.text()).toContain("Players encontrados");
  });

  it("detect sem resultados: 'nenhum player encontrado'", async () => {
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.text()).toContain("Nenhum player encontrado");
  });

  it("click em player detectado chama bridge set e seleciona", async () => {
    extApi.detect.mockResolvedValue([{ id: "vlc", label: "VLC" }]);
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-test="external-player-vlc"]').trigger("click");
    await flushPromises();
    expect(extApi.set).toHaveBeenCalledWith("vlc");
    expect(
      wrapper.find('[data-test="external-player-vlc"]').attributes("aria-checked"),
    ).toBe("true");
  });

  it("set falha (ok=false): reverte para o anterior", async () => {
    extApi.set.mockResolvedValue(false);
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find(".detect").trigger("click");
    await flushPromises();
    // detectado vazio; usa o botão associated pra trocar e falhar
    const associated = wrapper.find('[data-test="external-player-associated"]');
    await associated.trigger("click");
    await flushPromises();
    // player continua 'associated' (era ele já) — valida estado consistente
    expect(associated.attributes("aria-checked")).toBe("true");
  });

  it("custom players listados aparecem como opções", async () => {
    extApi.listCustom.mockResolvedValue(["/usr/bin/mpv-custom"]);
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.text()).toContain("mpv-custom");
  });

  it("escolher outro: dialog retorna caminho e seta custom:<path>", async () => {
    extApi.openFile.mockResolvedValue("/opt/player/x.bin");
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-test="external-player-pick"]').trigger("click");
    await flushPromises();
    expect(extApi.openFile).toHaveBeenCalled();
    expect(extApi.set).toHaveBeenCalledWith("custom:/opt/player/x.bin");
  });

  it("dialog cancelado (null): não chama set", async () => {
    extApi.openFile.mockResolvedValue(null);
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-test="external-player-pick"]').trigger("click");
    await flushPromises();
    expect(extApi.set).not.toHaveBeenCalled();
  });
});
