// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("../../composables/useClock", () => ({
  useClockDisplay: () => ({
    config: ref(clockConfigState.cfg),
    hourAngle: ref(30),
    minuteAngle: ref(180),
    secondAngle: ref(90),
    formattedTime: ref("10:30"),
    formattedSeconds: ref("45"),
    ampm: ref("AM"),
  }),
}));

import ClockPreview from "../ClockPreview.vue";
import type { ClockConfig } from "../../types/clock";

const clockConfigState: { cfg: ClockConfig } = {
  cfg: {
    style: "digital",
    format24h: true,
    showSeconds: true,
    textColor: "#ffffff",
    bgColor: "#000000",
  } as unknown as ClockConfig,
};

function mountClock(props: Record<string, unknown> = {}) {
  return mount(ClockPreview, {
    props: { config: clockConfigState.cfg, ...props },
  });
}

describe("ClockPreview.vue", () => {
  it("digital: renderiza hora, segundos e estilo base", () => {
    const wrapper = mountClock();
    expect(wrapper.find(".clock-preview__digital").text()).toContain("10:30");
    expect(wrapper.find(".clock-preview__seconds").text()).toBe("45");
    // format24h → sem ampm
    expect(wrapper.find(".clock-preview__ampm").exists()).toBe(false);
  });

  it("12h: mostra ampm", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      format24h: false,
    } as ClockConfig;
    const wrapper = mountClock();
    expect(wrapper.find(".clock-preview__ampm").text()).toBe("AM");
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      format24h: true,
    } as ClockConfig;
  });

  it("analog: renderiza ponteiros e centro", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
    } as ClockConfig;
    const wrapper = mountClock();
    expect(wrapper.find(".clock-preview__analog").exists()).toBe(true);
    expect(wrapper.find(".clock-preview__center").exists()).toBe(true);
    expect(wrapper.find(".clock-preview__hand--hour").exists()).toBe(true);
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "digital",
    } as ClockConfig;
  });

  it("preview=true: analog sem boxShadow", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
    } as ClockConfig;
    const wrapper = mountClock({ preview: true });
    const style = wrapper.find(".clock-preview__analog").attributes("style") ?? "";
    expect(style).toContain("none");
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "digital",
    } as ClockConfig;
  });

  it("stage: digital com textBox e escala", () => {
    const wrapper = mountClock({
      stage: {
        fontSize: 96,
        textColor: "#ff0",
        fontWeight: 700,
        textAlign: "center",
        textVerticalAlign: "middle",
        textShadow: true,
        shadowBlur: 10,
        shadowIntensity: 0.6,
        textBox: true,
        boxOpacity: 0.4,
        boxBorder: true,
      },
    });
    const style = wrapper.find(".clock-preview__digital").attributes("style") ?? "";
    expect(style).toContain("10vh");
    expect(style).toContain("700");
  });

  it("digital sem segundos: span de segundos ausente", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      showSeconds: false,
    } as ClockConfig;
    const wrapper = mountClock();
    expect(wrapper.find(".clock-preview__seconds").exists()).toBe(false);
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      showSeconds: true,
    } as ClockConfig;
  });
});
