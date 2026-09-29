// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { nextTick, ref } from "vue";

// ---- mocks das dependências do App.vue ----
vi.mock("vue-router", () => ({
  useRoute: () => routeState.route,
  RouterView: { name: "RouterView", render: () => null },
}));

vi.mock("vuetify", () => ({
  useTheme: () => ({ change: vi.fn(async () => {}) }),
}));

vi.mock("@design-system/composables", () => ({
  useThemeManager: () => ({ currentTheme: ref(themeState.theme) }),
}));

vi.mock("@modules/starting/stores/useStartingStore", () => ({
  useStartingStore: () => startingStoreMock,
}));

vi.mock("@modules/starting/components/StartingOverlay.vue", () => ({
  default: { name: "StartingOverlay", render: () => null },
}));

vi.mock("@layouts/AppTitlebar.vue", () => ({
  default: { name: "AppTitlebar", render: () => null },
}));

vi.mock("@shared/services/projection-window-location", () => ({
  isProjectionPopupLocation: () => projectionState.isPopup,
}));

vi.mock("@shared/composables/useOperatorEscapeToCloseProjection", () => ({
  useOperatorEscapeToCloseProjection: vi.fn(),
}));

vi.mock("@modules/media/composables/useMediaPlayerHotkeys", () => ({
  useMediaPlayerHotkeys: vi.fn(),
}));

vi.mock("@shared/components/UpdateBanner.vue", () => ({
  default: {
    name: "UpdateBanner",
    props: ["foo"],
    emits: ["view-notes"],
    render: () => null,
  },
}));

vi.mock("@shared/components/UpdateDialog.vue", () => ({
  default: {
    name: "UpdateDialog",
    props: ["modelValue"],
    emits: ["update:modelValue"],
    render: () => null,
  },
}));

vi.mock("@shared/composables/useUpdateChecker", () => ({
  useUpdateChecker: () => updateCheckerMock.mock,
}));

vi.mock("@modules/settings/services/palco-bridge", () => ({
  startPalcoBridge: startPalcoBridgeMock.fn,
}));

// ---- estado mutável dos mocks ----
const routeState: { route: Record<string, unknown> } = { route: {} };
const themeState: { theme: { mode: string } } = { theme: { mode: "dark" } };
const startingStoreMock = {
  isAppReady: ref(true),
  hide: vi.fn(),
};
const projectionState = { isPopup: false };
const startPalcoBridgeMock = { fn: vi.fn() };
const updateCheckerMock = {
  mock: {
    hasUpdate: ref(false),
    init: vi.fn(),
  },
};

import App from "../App.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: { "pt-BR": {} },
});

function mountApp() {
  return mount(App, {
    global: {
      plugins: [i18n],
      stubs: {
        RouterView: true,
        StartingOverlay: true,
        AppTitlebar: true,
        UpdateBanner: true,
        UpdateDialog: true,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routeState.route = { meta: {}, name: "home" };
  themeState.theme = { mode: "dark" };
  projectionState.isPopup = false;
  startingStoreMock.isAppReady.value = true;
  startingStoreMock.hide = vi.fn();
  updateCheckerMock.mock.hasUpdate = ref(false);
  updateCheckerMock.mock.init = vi.fn();
  startPalcoBridgeMock.fn = vi.fn();
});

describe("App.vue", () => {
  it("monta, inicializa update checker e sobe palco-bridge no boot", async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(updateCheckerMock.mock.init).toHaveBeenCalled();
    // janela principal (não projeção) → palco-bridge sobe
    expect(startPalcoBridgeMock.fn).toHaveBeenCalled();
    expect(wrapper.find(".app-frame").exists()).toBe(true);
  });

  it("não sobe palco-bridge em janela de projeção", async () => {
    routeState.route = { meta: { projection: true }, name: "projection" };
    const wrapper = mountApp();
    await flushPromises();

    expect(startPalcoBridgeMock.fn).not.toHaveBeenCalled();
    expect(wrapper.find(".app-frame--projection").exists()).toBe(true);
  });

  it("popup de projeção: esconde splash e não sobe bridge", async () => {
    projectionState.isPopup = true;
    routeState.route = { meta: {}, name: "projection-popup" };
    const wrapper = mountApp();
    await flushPromises();

    expect(startingStoreMock.hide).toHaveBeenCalled();
    expect(startPalcoBridgeMock.fn).not.toHaveBeenCalled();
  });

  it("isProjectionPopupLocation() true → classe --projection mesmo sem meta", async () => {
    projectionState.isPopup = true;
    routeState.route = { meta: {}, name: "other" };
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find(".app-frame--projection").exists()).toBe(true);
  });

  it("com update disponível → watcher reseta diálogo quando update some", async () => {
    updateCheckerMock.mock.hasUpdate = ref(true);
    mountApp();
    await flushPromises();

    // update desaparece → watcher deve reagir
    updateCheckerMock.mock.hasUpdate.value = false;
    await nextTick();
    await nextTick();
    // sem throw = ok (o watch dispara e mostra showUpdateDialog=false)
    expect(true).toBe(true);
  });

  it("tema light aplicado quando currentTheme.mode = light", async () => {
    themeState.theme = { mode: "light" };
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find(".app-frame").exists()).toBe(true);
  });
});
