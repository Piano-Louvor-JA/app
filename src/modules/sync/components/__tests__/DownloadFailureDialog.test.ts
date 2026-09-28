// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { h } from "vue";

// mock do Teleport
vi.mock("vue", async () => {
  const originalVue = await vi.importActual("vue");
  return {
    ...originalVue,
    Teleport: {
      name: "Teleport",
      setup(props: { to?: string; enabled?: boolean }, { slots }) {
        // Renderiza tudo dentro do body
        return () => h("div", {}, slots.default?.());
      },
    },
  };
});

/**
 * DownloadFailureDialog — Teleport de erro de download.
 * Padrão: mount + i18n local com sync-locales.
 */
import syncLocale from "../../locales/pt-BR";
import DownloadFailureDialog from "../DownloadFailureDialog.vue";
import type { DownloadFailureNotice } from "../../types/library";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: { "pt-BR": syncLocale },
});

function mountDialog(over: Partial<{ failure: DownloadFailureNotice | null }> = {}) {
  return mount(DownloadFailureDialog, {
    props: {
      failure: null,
      ...over,
    },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

describe("DownloadFailureDialog", () => {
  let active: ReturnType<typeof mountDialog> | null = null;

  afterEach(() => {
    active?.unmount();
    active = null;
    document.body.innerHTML = "";
  });

  it("failure=null não renderiza nada", () => {
    active = mountDialog();
    expect(document.body.querySelector(".download-failure-dialog")).toBeNull();
  });

  it("failure=offline mostra mensagem específica e título (Teleport)", () => {
    active = mountDialog({
      failure: {
        reason: "offline",
        failedCount: 0,
      },
    });
    // Teleport coloca no body, não no wrapper
    const dialog = document.body.querySelector(".download-failure-dialog");
    expect(dialog).not.toBeNull();
    const h2 = dialog!.querySelector("h2.download-failure-dialog__title");
    expect(h2?.textContent).toBe("Falha no download");
    const p = dialog!.querySelector("p.download-failure-dialog__text");
    expect(p?.textContent).toBe("Não foi possível baixar os arquivos. Verifique sua conexão com a internet.");
  });

  it("failure=server mostra mensagem com count", () => {
    active = mountDialog({
      failure: {
        reason: "server",
        failedCount: 5,
      },
    });
    const text = active.find("p.download-failure-dialog__text").text();
    expect(text).toContain("5 arquivo(s) não puderam ser baixados");
    expect(text).toContain("servidor de mídia parece indisponível");
  });

  it("failure=unknown mostra mensagem genérica", () => {
    active = mountDialog({
      failure: {
        reason: "unknown",
        failedCount: 3,
      },
    });
    expect(active.find("p.download-failure-dialog__text").text())
      .toBe("Ocorreu um erro ao baixar a coletânea.");
  });

  it("failure=batchOffline mostra mensagem específica de lote", () => {
    active = mountDialog({
      failure: {
        reason: "batchOffline",
        failedCount: 0,
      },
    });
    expect(active.find("p.download-failure-dialog__text").text())
      .toBe("O download em lote foi cancelado porque não há conexão com a internet.");
  });

  it("click em close emite evento e fecha", async () => {
    active = mountDialog({
      failure: { reason: "offline", failedCount: 0 },
    });
    // Teleport mock não remove elementos do DOM
    // Só valida que o close foi emitido
    await active.find("button.download-failure-dialog__btn").trigger("click");
    expect(active.emitted("close")).toHaveLength(1);
  });

  it("title do botão close i18n", () => {
    active = mountDialog({
      failure: { reason: "server", failedCount: 2 },
    });
    const btn = active.find("button.download-failure-dialog__btn");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe("Fechar");
  });
});