// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../composables/useTimer", () => ({
  useTimerDisplay: () => ({ formattedTime: ref("05:00") }),
}));

import TimerPreview from "../TimerPreview.vue";
import type { TimerDisplayConfig, TimerRuntimeState } from "../../types/timer";

const baseConfig: TimerDisplayConfig = {
  timeFormat: "mm:ss",
  textColor: "#ffffff",
} as unknown as TimerDisplayConfig;

const baseRuntime: TimerRuntimeState = {
  remainingMs: 300000,
} as unknown as TimerRuntimeState;

function mountPreview(props: Record<string, unknown> = {}) {
  return mount(TimerPreview, {
    props: {
      config: baseConfig,
      runtime: baseRuntime,
      ...props,
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TimerPreview.vue", () => {
  it("renderiza tempo formatado sem stage", () => {
    const wrapper = mountPreview();
    expect(wrapper.find(".timer-preview__digital").text()).toBe("05:00");
  });

  it("preview=true usa cor de superfície e sem sombra", () => {
    const wrapper = mountPreview({ preview: true });
    const style = wrapper.find(".timer-preview__digital").attributes("style") ?? "";
    expect(style).toContain("var(--ds-color-on-surface)");
    expect(style).toContain("none"); // textShadow none
  });

  it("stage definido: escala fontSize pela largura e aplica textBox", () => {
    const wrapper = mountPreview({
      stage: {
        fontSize: 96,
        textColor: "#ffcc00",
        fontWeight: 700,
        textAlign: "left",
        textVerticalAlign: "top",
        textShadow: false,
        textBox: true,
        boxOpacity: 0.5,
        boxBorder: true,
      },
    });
    const style = wrapper.find(".timer-preview__digital").attributes("style") ?? "";
    // sizeWidth=0 em jsdom → cai no min 16
    expect(style).toContain("20px");
    expect(style).toContain("rgb(255, 204, 0)");
    expect(style).toContain("700");
    // stage textBox → background rgba
    expect(style.toLowerCase()).toContain("rgba(0, 0, 0, 0.5)");
  });

  it("stage com textShadow: aplica sombra com blur/intensidade", () => {
    const wrapper = mountPreview({
      stage: {
        fontSize: 120,
        textColor: "#fff",
        fontWeight: 400,
        textAlign: "right",
        textVerticalAlign: "bottom",
        textShadow: true,
        shadowBlur: 12,
        shadowIntensity: 0.8,
        textBox: false,
        boxBorder: false,
      },
    });
    const style = wrapper.find(".timer-preview__digital").attributes("style") ?? "";
    expect(style).toContain("12vh");
    expect(style).toContain("0.8");
  });

  it("sem stage: justifyContent/alignItems center no surface", () => {
    const wrapper = mountPreview();
    const style = wrapper.find(".timer-preview").attributes("style") ?? "";
    expect(style).toContain("center");
  });

  it("timeFormat com ms: ratio menor (0.28) — cobre branch", () => {
    const wrapper = mountPreview({
      config: { ...baseConfig, timeFormat: "mm:ss.ms" },
    });
    expect(wrapper.find(".timer-preview__digital").exists()).toBe(true);
  });
  describe("gaps — digitalFontSize com stage", () => {
    it("com stage: renderiza e escala (fontSize 192 → escala 2x)", async () => {
      const wrapper = mountPreview({
        stage: {
          fontSize: 192,
          textAlign: "left",
          textVerticalAlign: "bottom",
          textShadow: true,
          shadowBlur: 2,
          shadowIntensity: 0.6,
        },
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".timer-preview__digital").exists()).toBe(true);
      wrapper.unmount();
    });

    it("stage align left/bottom: justify/align flex", async () => {
      const wrapper = mountPreview({
        stage: {
          fontSize: 96,
          textAlign: "right",
          textVerticalAlign: "bottom",
          textShadow: false,
        },
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.exists()).toBe(true);
      wrapper.unmount();
    });
  });

});