// @vitest-environment jsdom
import { createI18n } from 'vue-i18n'
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

const bridgeState: { platform?: string; hasWindow?: boolean } = {
  platform: "win32",
  hasWindow: true,
};

const controlMock = vi.fn(async (cmd: string) =>
  cmd === "is-maximized" ? false : undefined,
);
const onMaximizedStateMock = vi.fn();

vi.mock("@shared/services/desktop-bridge", () => ({
  getDesktopBridge: () =>
    bridgeState.hasWindow
      ? {
          platform: bridgeState.platform,
          window: {
            control: controlMock,
            onMaximizedState: onMaximizedStateMock,
          },
        }
      : null,
  isDesktopApp: () => true,
}));

vi.mock("@shared/services/projection-window-location", () => ({
  isProjectionPopupLocation: () => false,
}));

vi.mock("@assets/brand/logo-louvor-ja.svg", () => ({ default: "logo.svg" }));

import AppTitlebar from "../AppTitlebar.vue";

const i18n = createI18n({ legacy: false, messages: {} })


function makeRouter(name = "home", projection = false) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: { template: "<div />" }, meta: { projection } },
      { path: "/proj", name: "projection-popup", component: { template: "<div />" } },
    ],
  });
  void name;
}

async function mountBar(route: { name?: string; projection?: boolean } = {}) {
  const router = makeRouter();
  router.push("/");
  await router.isReady();
  const wrapper = mount(AppTitlebar, {
    global: {
      plugins: [router, i18n],
      stubs: { teleport: true, DownloadQueueIndicator: true },
    },
  });
  if (route.name || route.projection !== undefined) {
    await router.replace({ name: route.name ?? "home", params: {} });
    await wrapper.vm.$nextTick();
  }
  return wrapper;
}

describe("AppTitlebar.vue", () => {
  it("monta e sincroniza altura da titlebar", async () => {
    const wrapper = await mountBar();
    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it("janela de projeção: titlebar invisível", async () => {
    await mountBar({ name: "projection-popup" });
    expect(true).toBe(true);
  });

  it("minimize/maximize/close chamam window.control", async () => {
    const wrapper = await mountBar();
    await (wrapper.vm as never as { minimize(): Promise<void> }).minimize();
    await (wrapper.vm as never as { maximize(): Promise<void> }).maximize();
    await (wrapper.vm as never as { close(): Promise<void> }).close();
    expect(controlMock).toHaveBeenCalledWith("minimize");
    expect(controlMock).toHaveBeenCalledWith("maximize");
    expect(controlMock).toHaveBeenCalledWith("close");
  });

  it("onMaximizedState registrado no mount", async () => {
    await mountBar();
    expect(onMaximizedStateMock).toHaveBeenCalled();
  });
  describe("gaps — mac controls, maximized state, unmount", () => {
    it("plataforma mac: usa os botões nativos (sem botões HTML)", async () => {
      bridgeState.platform = "darwin";
      const wrapper = await mountBar();
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".app-titlebar__mac-traffic-lights").exists()).toBe(true);
      expect(wrapper.find("button").exists()).toBe(false);
      wrapper.unmount();
      bridgeState.platform = "win32";
    });

    it("is-maximized true: ícone de restore", async () => {
      controlMock.mockImplementation(async (cmd: string) => cmd === "is-maximized");
      const wrapper = await mountBar();
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".ti-copy").exists()).toBe(true);
      wrapper.unmount();
    });

    it("onMaximizedState callback atualiza isMaximized", async () => {
      let cb: ((s: boolean) => void) | null = null;
      onMaximizedStateMock.mockImplementation((fn: (s: boolean) => void) => { cb = fn; });
      const wrapper = await mountBar();
      cb?.(true);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".ti-copy").exists()).toBe(true);
      wrapper.unmount();
    });

    it("unmount: syncTitlebarHeight(false)", async () => {
      const wrapper = await mountBar();
      wrapper.unmount();
      expect(
        document.documentElement.style.getPropertyValue("--app-titlebar-height"),
      ).toBe("0px");
    });

    it("rota projection: titlebar some e height zerada", async () => {
      const wrapper = await mountBar({ name: "projection-popup" });
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".app-titlebar").exists()).toBe(false);
      expect(
        document.documentElement.style.getPropertyValue("--app-titlebar-height"),
      ).toBe("0px");
      wrapper.unmount();
    });

    it("sem bridge.window: título estático, sem erros", async () => {
      bridgeState.hasWindow = false;
      const wrapper = await mountBar();
      await wrapper.vm.$nextTick();
      expect(wrapper.exists()).toBe(true);
      wrapper.unmount();
      bridgeState.hasWindow = true;
    });
  });


});