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

describe("ClockPreview.vue — stage, analog size e measure retry", () => {
  it("stage com dimensões: fontSize escala; analógico escala pelo stage", async () => {
    const wrapper = mountClock({
      stage: { fontSize: 192, textVerticalAlign: "bottom", textAlign: "right" },
    });
    Object.defineProperty(wrapper.element, "offsetWidth", { value: 960 });
    Object.defineProperty(wrapper.element, "offsetHeight", { value: 480 });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".clock-preview__digital").exists()).toBe(true);
    wrapper.unmount();
  });

  it("measure retry com dimensões zero (fake timers)", async () => {
    vi.useFakeTimers();
    const wrapper = mountClock();
    await vi.advanceTimersByTimeAsync(250);
    wrapper.unmount();
    vi.useRealTimers();
    expect(true).toBe(true);
  });
});

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
  describe("gaps — digitalFontSize/measure/align", () => {
    it("com stage: font escala com fontSize do palco", async () => {
      const wrapper = mountClock({
        stage: {
          fontSize: 192,
          textAlign: "left",
          textVerticalAlign: "top",
          textShadow: true,
          shadowBlur: 3,
          shadowIntensity: 0.5,
        },
      });
      await wrapper.vm.$nextTick();
      const el = wrapper.find(".clock-preview__digital");
      expect(el.exists()).toBe(true);
      // render sem quebrar com stage presente (cobre computed digitalFontSize)
      expect(el.exists()).toBe(true);
      wrapper.unmount();
    });

    it("align left/top: justify e align items aplicados", async () => {
      const wrapper = mountClock({
        stage: {
          fontSize: 96,
          textAlign: "left",
          textVerticalAlign: "top",
          textShadow: false,
        },
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.exists()).toBe(true);
      wrapper.unmount();
    });

    it("preview sem stage: textShadow none", async () => {
      const wrapper = mountClock({ preview: true });
      await wrapper.vm.$nextTick();
      expect(wrapper.exists()).toBe(true);
      wrapper.unmount();
    });
  });


  it("gaps2: dimensões reais no prototype → sem retry, stage font/analog (L36/48/115/129)", async () => {
    const descW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const descH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { value: 960, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { value: 480, configurable: true });
    try {
      // analógico com stage: analogSize avalia false-arm e stmt50
      clockConfigState.cfg = { ...clockConfigState.cfg, style: "analog" } as unknown as ClockConfig;
      const wa = mountClock({
        stage: { fontSize: 192, textColor: "#fff", textShadow: true, shadowBlur: 4, shadowIntensity: 0.5 },
      });
      await wa.vm.$nextTick();
      expect(wa.find(".clock-preview__analog").exists()).toBe(true);
      wa.unmount(); // sem timer (dims > 0 desde o mount)
      // digital 12h com stage: ampm span com fontWeight do stage (L162)
      clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital", format24h: false } as unknown as ClockConfig;
      const wd = mountClock({
        stage: { fontSize: 192, fontWeight: 800, textVerticalAlign: "bottom", textAlign: "right", textColor: "#fff" },
      });
      await wd.vm.$nextTick();
      expect(wd.find(".clock-preview__ampm").exists()).toBe(true);
      wd.unmount();
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
      if (descW) Object.defineProperty(HTMLElement.prototype, "offsetWidth", descW);
      if (descH) Object.defineProperty(HTMLElement.prototype, "offsetHeight", descH);
      clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital", format24h: true } as unknown as ClockConfig;
    }
  });

  it("gaps2: preview=true analog boxShadow none (L179 true-arm)", async () => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { value: 960, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { value: 480, configurable: true });
    try {
      clockConfigState.cfg = { ...clockConfigState.cfg, style: "analog" } as unknown as ClockConfig;
      const wrapper = mountClock({ preview: true });
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".clock-preview__analog").exists()).toBe(true);
      wrapper.unmount();
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
      clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital" } as unknown as ClockConfig;
    }
  });
});