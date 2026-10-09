// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { h, nextTick, ref } from "vue";

// Teleport mockado (mesmo padrão do DownloadFailureDialog.test.ts):
// renderiza o conteúdo inline em vez de anexar ao document.body
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

vi.mock("@modules/starting/composables/useAppBootstrap", () => ({
  useAppBootstrap: vi.fn(),
}));

import { useAppBootstrap } from "@modules/starting/composables/useAppBootstrap";
import startingLocale from "../../locales/pt-BR";
import StartingOverlay from "../StartingOverlay.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: { "pt-BR": startingLocale },
});

type BootstrapState = {
  isVisible: ReturnType<typeof ref<boolean>>;
  showContent: ReturnType<typeof ref<boolean>>;
  hasError: ReturnType<typeof ref<boolean>>;
  statusKey: ReturnType<typeof ref<string>>;
  isFirstBoot: ReturnType<typeof ref<boolean>>;
  progress: ReturnType<typeof ref<number>>;
  retryBootstrap: ReturnType<typeof vi.fn>;
};

function makeBootstrapState(over: Partial<BootstrapState> = {}) {
  const state = {
    isVisible: ref(true),
    showContent: ref(true),
    hasError: ref(false),
    statusKey: ref("starting.status.loading"),
    isFirstBoot: ref(true),
    progress: ref(42),
    retryBootstrap: vi.fn(),
    ...over,
  };
  vi.mocked(useAppBootstrap).mockReturnValue(
    state as unknown as ReturnType<typeof useAppBootstrap>,
  );
  return state;
}

function mountOverlay() {
  return mount(StartingOverlay, {
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

describe("StartingOverlay", () => {
  let active: ReturnType<typeof mountOverlay> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    makeBootstrapState();
  });

  afterEach(() => {
    active?.unmount();
    active = null;
    document.body.innerHTML = "";
  });

  it("isVisible=false não renderiza o overlay", () => {
    makeBootstrapState({ isVisible: ref(false) });
    active = mountOverlay();
    expect(active.find(".starting-overlay").exists()).toBe(false);
  });

  it("showContent=false renderiza o overlay vazio (sem content)", () => {
    makeBootstrapState({ showContent: ref(false) });
    active = mountOverlay();
    expect(active.find(".starting-overlay").exists()).toBe(true);
    expect(active.find(".starting-overlay__content").exists()).toBe(false);
  });

  it("primeiro boot: headline de firstBoot, status e barra de progresso 42%", () => {
    makeBootstrapState({ progress: ref(42) });
    active = mountOverlay();

    expect(active.find(".starting-overlay__title").text()).toBe(
      "Configurando o LouvorJA - PIANO",
    );
    expect(active.find(".starting-overlay__status").text()).toBe(
      "Quase pronto — carregando seus recursos…",
    );
    const bar = active.find('[role="progressbar"]');
    expect(bar.exists()).toBe(true);
    expect(bar.attributes("aria-valuenow")).toBe("42");
    const fill = active.find(".starting-overlay__progress-fill");
    expect(fill.attributes("style")).toContain("width: 42%");
    expect(active.find(".starting-overlay__spinner").exists()).toBe(true);
    expect(active.find(".starting-overlay__retry").exists()).toBe(false);
    const overlayEl = active.find(".starting-overlay");
    expect(overlayEl.attributes("aria-busy")).toBe("true");
    expect(overlayEl.attributes("aria-label")).toBe(
      "Quase pronto — carregando seus recursos…",
    );
  });

  it("warm boot: headline de boot morno e sem barra de progresso", () => {
    makeBootstrapState({ isFirstBoot: ref(false), progress: ref(50) });
    active = mountOverlay();

    expect(active.find(".starting-overlay__title").text()).toBe(
      "Preparando o LouvorJA - PIANO",
    );
    expect(active.find('[role="progressbar"]').exists()).toBe(false);
    expect(active.find(".starting-overlay__status").exists()).toBe(true);
  });

  it("progress=0 não mostra barra (showProgress exige > 0)", () => {
    makeBootstrapState({ progress: ref(0) });
    active = mountOverlay();
    expect(active.find('[role="progressbar"]').exists()).toBe(false);
  });

  it("progress acima de 100: fill trava em 100%", () => {
    makeBootstrapState({ progress: ref(150) });
    active = mountOverlay();
    const fill = active.find(".starting-overlay__progress-fill");
    expect(fill.attributes("style")).toContain("width: 100%");
  });

  it("estado de erro: troca spinner/status por botão retry; clique chama retryBootstrap", async () => {
    const state = makeBootstrapState({ hasError: ref(true) });
    active = mountOverlay();

    expect(active.find(".starting-overlay__spinner").exists()).toBe(false);
    expect(active.find(".starting-overlay__status").exists()).toBe(false);
    expect(active.find('[role="progressbar"]').exists()).toBe(false);
    expect(active.find(".starting-overlay").attributes("aria-busy")).toBe(
      "false",
    );

    const retry = active.find(".starting-overlay__retry");
    expect(retry.text()).toBe("Tentar novamente");
    await retry.trigger("click");
    expect(state.retryBootstrap).toHaveBeenCalledTimes(1);
  });

  it("reage a mudanças reativas: sai da tela quando isVisible vira false", async () => {
    const state = makeBootstrapState();
    active = mountOverlay();
    expect(active.find(".starting-overlay").exists()).toBe(true);

    state.isVisible.value = false;
    await nextTick();
    expect(active.find(".starting-overlay").exists()).toBe(false);
  });

  it("reage a progress e statusKey reativos", async () => {
    const state = makeBootstrapState({ progress: ref(0) });
    active = mountOverlay();
    expect(active.find('[role="progressbar"]').exists()).toBe(false);

    state.progress.value = 75;
    state.statusKey.value = "starting.status.extracting";
    await nextTick();

    const bar = active.find('[role="progressbar"]');
    expect(bar.exists()).toBe(true);
    expect(bar.attributes("aria-valuenow")).toBe("75");
    expect(active.find(".starting-overlay__status").text()).toBe(
      "Extraindo e preparando os arquivos locais…",
    );
  });

  it("hasError com showContent=false não renderiza content (mesmo com erro)", () => {
    makeBootstrapState({ showContent: ref(false), hasError: ref(true) });
    active = mountOverlay();
    expect(active.find(".starting-overlay__retry").exists()).toBe(false);
  });
});
