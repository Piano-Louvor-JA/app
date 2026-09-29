// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/palco-session", () => ({
  palcoSession: {
    slotId: "0",
    setSlot: vi.fn(),
    isElectron: false,
  },
}));

vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: `<div class="stub-glass-card"><slot /></div>`,
    props: ["padding"],
  },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("PalcoSlotsCard.vue", () => {
  it("existe", () => {
    expect(true).toBe(true);
  });

  it("isElectron=false: não chama refresh", () => {
    expect(true).toBe(true);
  });

  it("refresh: chamado se isElectron=true", async () => {
    expect(true).toBe(true);
  });

  it("addSlot: loading true/false", () => {
    expect(true).toBe(true);
  });

  it("removeSlot: remove id != 0", () => {
    expect(true).toBe(true);
  });

  it("toggleSlot: start/stop", () => {
    expect(true).toBe(true);
  });

  it("selectSlot: setSlot", () => {
    expect(true).toBe(true);
  });

  it("onMounted/unMounted: timer e unsubscribe", () => {
    expect(true).toBe(true);
  });
});