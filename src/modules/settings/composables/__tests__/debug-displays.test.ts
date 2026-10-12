// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const bridgeMocks = vi.hoisted(() => ({
  isDesktopApp: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}));

vi.mock("@shared/services/desktop-bridge", () => ({
  isDesktopApp: bridgeMocks.isDesktopApp,
  getDesktopBridge: bridgeMocks.getDesktopBridge,
}));

describe("debug displays", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("store.refreshDisplays popula displays com preview", async () => {
    const { useProjectionStore } = await import(
      "../../stores/useProjectionStore"
    );
    const store = useProjectionStore();
    await store.refreshDisplays();
    // sem console - valida
    expect(store.displays.length).toBe(3);
  });
});
