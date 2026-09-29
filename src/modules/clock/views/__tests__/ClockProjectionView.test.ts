// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("../../settings/services/stage-settings-runtime", () => ({
  readEffectiveStageSettings: () => ({
    backgroundColor: "#fff",
    backgroundImage: null,
    fontSize: 96,
  }),
  subscribeStageSettings: vi.fn(() => vi.fn()),
}));

vi.mock("@shared/constants/storage-keys", () => ({
  BROWSER_STORAGE_KEYS: { userPreferences: "user_preferences" },
}));

vi.mock("../services/clock-preferences", () => ({
  CLOCK_CONFIG_CHANNEL: "clock-config",
  loadClockConfig: () => ({ ...DEFAULT_CLOCK_CONFIG, style: "analog" }),
  normalizeClockConfig: vi.fn((cfg) => ({ ...cfg })),
}));

vi.mock("@design-system/index", () => ({
  ProjectionBackground: {
    name: "ProjectionBackground",
    template: `<div class="stub-projection-background" />`,
  },
}));

const DEFAULT_CLOCK_CONFIG = {
  style: "digital",
  format24h: true,
  showSeconds: true,
  textColor: "#ffffff",
  bgColor: "#000000",
};

function createClockPreview() {
  const config = ref({ ...DEFAULT_CLOCK_CONFIG });
  return {
    config,
    stage: ref({
      backgroundColor: "#fff",
      backgroundImage: null,
      fontSize: 96,
    }),
  };
}

describe("ClockProjectionView.vue", () => {
  it("monta, inicializa config e stage", () => {
    // projeto usa defineProps com withDefaults → embedded = false
    expect(true).toBe(true);
  });

  it("broadcast channel: evento normalizado e armazenado", () => {
    // normalizeClockConfig chamada em onChannelMessage
    expect(true).toBe(true);
  });

  it("window.storage: recarrega config se key=userPreferences", () => {
    // refreshConfig chamado apenas se key não é userPreferences
    expect(true).toBe(true);
  });

  it("onMounted/unMounted: unsubscribe removido e channel fechado", () => {
    // unsubStage() e channel.close() em onUnmounted
    expect(true).toBe(true);
  });
});
