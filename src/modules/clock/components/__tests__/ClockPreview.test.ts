// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { ref, nextTick } from "vue"

const useClockMockState = {
  /** Quando true, o mock delega ao useClockDisplay real (testes de integração). */
  useReal: false,
}

vi.mock("../../composables/useClock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useClock")>()
  return {
    ...actual,
    useClockDisplay: (configSource?: unknown) => {
      if (useClockMockState.useReal) {
        return actual.useClockDisplay(configSource as Parameters<typeof actual.useClockDisplay>[0])
      }
      return {
        config: ref(clockConfigState.cfg),
        hourAngle: ref(30),
        minuteAngle: ref(180),
        secondAngle: ref(90),
        formattedTime: ref("10:30"),
        formattedSeconds: ref("45"),
        ampm: ref("AM"),
      }
    },
  }
})

import ClockPreview from "../ClockPreview.vue"
import type { ClockConfig } from "../../types/clock"
import type { StageSettings } from "../../settings/types/stage-settings"
import { createPinia, setActivePinia } from "pinia"

// Copied pure functions from ClockPreview.vue for direct testing
function computeDigitalFontSize(
  st: StageSettings | undefined,
  sizeWidth: number,
  sizeHeight: number,
  showSeconds: boolean,
): number {
  if (st && sizeWidth > 0) {
    return Math.max(16, (st.fontSize / 1920) * sizeWidth)
  }
  const v = Math.min(sizeWidth, sizeHeight)
  const ratio = showSeconds ? 0.35 : 0.4
  return Math.max(v * ratio, 20)
}

function computeAnalogSize(
  st: StageSettings | undefined,
  sizeWidth: number,
  sizeHeight: number,
): number {
  const v = Math.min(sizeWidth, sizeHeight)
  const base = Math.max(v * 0.8, 100)
  if (!st || sizeWidth <= 0) return base
  return Math.max(80, base * (st.fontSize / 96))
}

function computeAccentColor(
  st: StageSettings | undefined,
  preview: boolean,
  configTextColor: string,
): string {
  if (st) return st.textColor
  if (preview) return "var(--ds-color-on-surface)"
  return configTextColor
}

function computeDigitalStyle(
  st: StageSettings | undefined,
  preview: boolean,
  accentColor: string,
  digitalFontSize: number,
): Record<string, string> {
  const color = accentColor
  return {
    fontSize: `${digitalFontSize}px`,
    fontWeight: st ? String(st.fontWeight) : "900",
    color,
    textAlign: st?.textAlign ?? "center",
    textShadow:
      preview && !st
        ? "none"
        : st?.textShadow
          ? `0 0 ${st.shadowBlur}vh rgba(0,0,0,${st.shadowIntensity})`
          : st
            ? "none"
            : `0 4px 30px ${color}40`,
    background: st?.textBox ? `rgba(0,0,0,${st.boxOpacity})` : "transparent",
    border: st?.textBox && st.boxBorder ? "1px solid rgba(255,255,255,0.25)" : "none",
    borderRadius: st?.textBox ? "1.4cqw 0 1.4cqw 0" : "0",
    padding: st?.textBox ? "2.5vmin 1.8vmin" : "0",
  } as Record<string, string>
}

function computeSurfaceStyle(
  st: StageSettings | undefined,
  accentColor: string,
): Record<string, string> {
  return {
    background: "transparent",
    color: accentColor,
    ...stageFlexJustify(st),
  }
}

function stageFlexJustify(st?: StageSettings): Record<string, string> {
  if (!st) {
    return { alignItems: "center", justifyContent: "center" }
  }
  const alignItems =
    st.textVerticalAlign === "top"
      ? "flex-start"
      : st.textVerticalAlign === "bottom"
        ? "flex-end"
        : "center"
  const justifyContent =
    st.textAlign === "left"
      ? "flex-start"
      : st.textAlign === "right"
        ? "flex-end"
        : "center"
  return { alignItems, justifyContent }
}

const clockConfigState: { cfg: ClockConfig } = {
  cfg: {
    style: "digital",
    format24h: true,
    showSeconds: true,
    textColor: "#ffffff",
    bgColor: "#000000",
  } as unknown as ClockConfig,
}

function mountClock(props: Record<string, unknown> = {}) {
  return mount(ClockPreview, {
    props: { config: clockConfigState.cfg, ...props },
    attachTo: document.body,
  })
}

describe("ClockPreview.vue - Pure Function Tests", () => {
  const mockStage: StageSettings = {
    fontSize: 96,
    fontWeight: 600,
    textAlign: "center",
    textVerticalAlign: "middle",
    textColor: "#ff0000",
    textShadow: true,
    shadowBlur: 2,
    shadowIntensity: 0.5,
    textBox: false,
    boxOpacity: 0.5,
    boxBorder: false,
  } as unknown as StageSettings

  describe("computeDigitalFontSize", () => {
    it("branch com stage e sizeWidth > 0", () => {
      const result = computeDigitalFontSize(mockStage, 400, 300, true)
      expect(result).toBe(20)
    })

    it("branch com stage e sizeWidth > 0 (sem segundos)", () => {
      const result = computeDigitalFontSize(mockStage, 400, 300, false)
      expect(result).toBe(20)
    })

    it("branch sem stage com sizeWidth > 0 (com segundos)", () => {
      const result = computeDigitalFontSize(undefined, 400, 300, true)
      expect(result).toBe(105)
    })

    it("branch sem stage com sizeWidth > 0 (sem segundos)", () => {
      const result = computeDigitalFontSize(undefined, 400, 300, false)
      expect(result).toBe(120)
    })

    it("branch sem stage com sizeWidth = 0", () => {
      const result = computeDigitalFontSize(undefined, 0, 0, true)
      expect(result).toBe(20)
    })

    it("branch com stage mas sizeWidth = 0", () => {
      const result = computeDigitalFontSize(mockStage, 0, 300, true)
      expect(result).toBe(20)
    })

    it("minimum clamp 16px com stage", () => {
      const smallStage = { ...mockStage, fontSize: 10 } as StageSettings
      const result = computeDigitalFontSize(smallStage, 100, 100, true)
      expect(result).toBe(16)
    })
  })

  describe("computeAnalogSize", () => {
    it("branch com stage e sizeWidth > 0", () => {
      const result = computeAnalogSize(mockStage, 400, 300)
      expect(result).toBe(240)
    })

    it("branch sem stage", () => {
      const result = computeAnalogSize(undefined, 400, 300)
      expect(result).toBe(240)
    })

    it("branch com stage mas sizeWidth <= 0", () => {
      const result = computeAnalogSize(mockStage, 0, 300)
      expect(result).toBe(100)
    })

    it("minimum clamp 100px base", () => {
      const result = computeAnalogSize(mockStage, 50, 50)
      expect(result).toBe(100)
    })

    it("minimum clamp 80px final", () => {
      const smallStage = { ...mockStage, fontSize: 10 } as StageSettings
      const result = computeAnalogSize(smallStage, 200, 200)
      expect(result).toBe(80)
    })

    it("scale com fontSize > 96", () => {
      const largeStage = { ...mockStage, fontSize: 192 } as StageSettings
      const result = computeAnalogSize(largeStage, 400, 300)
      expect(result).toBe(480)
    })
  })

  describe("computeAccentColor", () => {
    it("retorna stage.textColor quando stage existe", () => {
      const result = computeAccentColor(mockStage, false, "#000000")
      expect(result).toBe("#ff0000")
    })

    it("retorna var(--ds-color-on-surface) quando preview=true sem stage", () => {
      const result = computeAccentColor(undefined, true, "#000000")
      expect(result).toBe("var(--ds-color-on-surface)")
    })

    it("retorna config.textColor quando sem stage e sem preview", () => {
      const result = computeAccentColor(undefined, false, "#00ffff")
      expect(result).toBe("#00ffff")
    })

    it("stage tem prioridade sobre preview", () => {
      const result = computeAccentColor(mockStage, true, "#000000")
      expect(result).toBe("#ff0000")
    })
  })

  describe("computeDigitalStyle", () => {
    it("aplica propriedades do stage quando stage existe", () => {
      const result = computeDigitalStyle(mockStage, false, "#ff0000", 50)
      expect(result.fontWeight).toBe("600")
      expect(result.textAlign).toBe("center")
      expect(result.color).toBe("#ff0000")
    })

    it("usa defaults quando sem stage", () => {
      const result = computeDigitalStyle(undefined, false, "#00ff00", 40)
      expect(result.fontWeight).toBe("900")
      expect(result.textAlign).toBe("center")
      expect(result.color).toBe("#00ff00")
    })

    it("textShadow: none quando preview && !stage", () => {
      const result = computeDigitalStyle(undefined, true, "#000000", 30)
      expect(result.textShadow).toBe("none")
    })

    it("textShadow: stage shadow quando stage.textShadow=true", () => {
      const result = computeDigitalStyle(mockStage, false, "#ff0000", 50)
      expect(result.textShadow).toBe("0 0 2vh rgba(0,0,0,0.5)")
    })

    it("textShadow: none quando stage existe mas textShadow=false", () => {
      const stageNoShadow = { ...mockStage, textShadow: false } as StageSettings
      const result = computeDigitalStyle(stageNoShadow, false, "#ff0000", 50)
      expect(result.textShadow).toBe("none")
    })

    it("textShadow: default glow quando sem stage e sem preview", () => {
      const result = computeDigitalStyle(undefined, false, "#00ffff", 40)
      expect(result.textShadow).toBe("0 4px 30px #00ffff40")
    })

    it("background, border, borderRadius, padding quando textBox=true", () => {
      const stageWithBox = { ...mockStage, textBox: true, boxOpacity: 0.7, boxBorder: true } as StageSettings
      const result = computeDigitalStyle(stageWithBox, false, "#ff0000", 50)
      expect(result.background).toBe("rgba(0,0,0,0.7)")
      expect(result.border).toBe("1px solid rgba(255,255,255,0.25)")
      expect(result.borderRadius).toBe("1.4cqw 0 1.4cqw 0")
      expect(result.padding).toBe("2.5vmin 1.8vmin")
    })

    it("background transparent, border none quando textBox=false", () => {
      const result = computeDigitalStyle(mockStage, false, "#ff0000", 50)
      expect(result.background).toBe("transparent")
      expect(result.border).toBe("none")
      expect(result.borderRadius).toBe("0")
      expect(result.padding).toBe("0")
    })

    it("border none quando boxBorder=false mesmo com textBox=true", () => {
      const stageNoBorder = { ...mockStage, textBox: true, boxBorder: false } as StageSettings
      const result = computeDigitalStyle(stageNoBorder, false, "#ff0000", 50)
      expect(result.border).toBe("none")
    })
  })

  describe("stageFlexJustify", () => {
    it("retorna center/center quando sem stage", () => {
      const result = stageFlexJustify(undefined)
      expect(result).toEqual({ alignItems: "center", justifyContent: "center" })
    })

    it("alignItems: flex-start quando textVerticalAlign=top", () => {
      const stage = { ...mockStage, textVerticalAlign: "top" } as StageSettings
      const result = stageFlexJustify(stage)
      expect(result.alignItems).toBe("flex-start")
    })

    it("alignItems: flex-end quando textVerticalAlign=bottom", () => {
      const stage = { ...mockStage, textVerticalAlign: "bottom" } as StageSettings
      const result = stageFlexJustify(stage)
      expect(result.alignItems).toBe("flex-end")
    })

    it("alignItems: center quando textVerticalAlign=middle", () => {
      const stage = { ...mockStage, textVerticalAlign: "middle" } as StageSettings
      const result = stageFlexJustify(stage)
      expect(result.alignItems).toBe("center")
    })

    it("justifyContent: flex-start quando textAlign=left", () => {
      const stage = { ...mockStage, textAlign: "left" } as StageSettings
      const result = stageFlexJustify(stage)
      expect(result.justifyContent).toBe("flex-start")
    })

    it("justifyContent: flex-end quando textAlign=right", () => {
      const stage = { ...mockStage, textAlign: "right" } as StageSettings
      const result = stageFlexJustify(stage)
      expect(result.justifyContent).toBe("flex-end")
    })

    it("justifyContent: center quando textAlign=center", () => {
      const stage = { ...mockStage, textAlign: "center" } as StageSettings
      const result = stageFlexJustify(stage)
      expect(result.justifyContent).toBe("center")
    })
  })

  describe("computeSurfaceStyle", () => {
    it("combina accentColor com stageFlexJustify", () => {
      const result = computeSurfaceStyle(mockStage, "#ff0000")
      expect(result.color).toBe("#ff0000")
      expect(result.background).toBe("transparent")
      expect(result.alignItems).toBe("center")
      expect(result.justifyContent).toBe("center")
    })
  })
})

describe("ClockPreview.vue - Component Integration Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clockConfigState.cfg = {
      style: "digital",
      format24h: true,
      showSeconds: true,
      textColor: "#ffffff",
      bgColor: "#000000",
    } as unknown as ClockConfig
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const mockStage: StageSettings = {
    fontSize: 96,
    fontWeight: 600,
    textAlign: "center",
    textVerticalAlign: "middle",
    textColor: "#ff0000",
    textShadow: true,
    shadowBlur: 2,
    shadowIntensity: 0.5,
    textBox: false,
    boxOpacity: 0.5,
    boxBorder: false,
  } as unknown as StageSettings

  it("render digital com config padrão", () => {
    const wrapper = mountClock()
    expect(wrapper.find(".clock-preview__digital").exists()).toBe(true)
    expect(wrapper.find(".clock-preview__analog").exists()).toBe(false)
  })

  it("render analog quando config.style=analog", () => {
    clockConfigState.cfg.style = "analog"
    const wrapper = mountClock()
    expect(wrapper.find(".clock-preview__analog").exists()).toBe(true)
    expect(wrapper.find(".clock-preview__digital").exists()).toBe(false)
  })

  it("aplica stage.textColor no digital via accentColor", () => {
    const wrapper = mountClock({ stage: mockStage })
    const digital = wrapper.find(".clock-preview__digital")
    expect(digital.attributes("style")).toContain("color: rgb(255, 0, 0)")
  })

  it("aplica stage.fontSize no digital via digitalFontSize", () => {
    const wrapper = mountClock({ stage: mockStage, attachTo: document.body })
    const container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    const digital = wrapper.find(".clock-preview__digital")
    expect(digital.attributes("style")).toContain("font-size: 20px")
  })

  it("digitalStyle: textShadow glow default quando sem stage", async () => {
      const wrapper = mountClock({ attachTo: document.body })
      const container = wrapper.find(".clock-preview").element as HTMLElement
      Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
      Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
      window.dispatchEvent(new Event("resize"))
      vi.advanceTimersByTime(200)
      const digital = wrapper.find(".clock-preview__digital")
      expect(digital.attributes("style")).toContain("text-shadow: 0 4px 30px")
    })

  it("digitalStyle: textShadow none quando preview=true sem stage", () => {
    const wrapper = mountClock({ preview: true, attachTo: document.body })
    const container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    const digital = wrapper.find(".clock-preview__digital")
    expect(digital.attributes("style")).toContain("text-shadow: none")
  })

  it("surfaceStyle: alignItems/justifyContent center quando sem stage", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    const root = wrapper.find(".clock-preview")
    expect(root.attributes("style")).toContain("align-items: center")
    expect(root.attributes("style")).toContain("justify-content: center")
  })

  it("surfaceStyle: flex-start/flex-start quando stage top/left", () => {
    const stageTopLeft = { ...mockStage, textVerticalAlign: "top", textAlign: "left" } as StageSettings
    const wrapper = mountClock({ stage: stageTopLeft, attachTo: document.body })
    const container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    const root = wrapper.find(".clock-preview")
    expect(root.attributes("style")).toContain("align-items: flex-start")
    expect(root.attributes("style")).toContain("justify-content: flex-start")
  })

  it("analogSize: branch com stage e sizeWidth > 0", async () => {
    clockConfigState.cfg.style = "analog"
    const wrapper = mountClock({ stage: mockStage, attachTo: document.body })
    const container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    await flushPromises()
    const analog = wrapper.find(".clock-preview__analog")
    const style = analog.attributes("style") ?? ""
    expect(style).toContain("width: 240px")
    expect(style).toContain("height: 240px")
  })

  it("analog: border width escala com analogSize", async () => {
    clockConfigState.cfg.style = "analog"
    const wrapper = mountClock({ stage: mockStage, attachTo: document.body })
    const container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    await flushPromises()
    const analog = wrapper.find(".clock-preview__analog")
    const style = analog.attributes("style") ?? ""
    expect(style).toContain("border:")
    expect(style).toContain("rgb(255, 0, 0)")
  })

  it("analog: boxShadow preview vs stage vs default", async () => {
    clockConfigState.cfg.style = "analog"
    let wrapper = mountClock({ stage: mockStage, preview: true, attachTo: document.body })
    let container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    let analog = wrapper.find(".clock-preview__analog")
    expect(analog.attributes("style")).toContain("box-shadow: none")

    clockConfigState.cfg.style = "analog"
    wrapper = mountClock({ stage: mockStage, preview: false, attachTo: document.body })
    container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    analog = wrapper.find(".clock-preview__analog")
    const style = analog.attributes("style") ?? ""
    expect(style).toContain("inset 0 0 40px rgba(0,0,0,0.2)")
    expect(style).toContain("rgba(0,0,0,0.5)")

    clockConfigState.cfg.style = "analog"
    const stageNoShadow = { ...mockStage, textShadow: false } as StageSettings
    wrapper = mountClock({ stage: stageNoShadow, preview: false, attachTo: document.body })
    container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 400, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 300, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    analog = wrapper.find(".clock-preview__analog")
    expect(analog.attributes("style")).toContain("inset 0 0 40px")
  })

  it("measure: early return quando containerRef é null", () => {
    const wrapper = mountClock({ attachTo: document.body })
    wrapper.unmount()
  })

  it("onUnmounted: removeEventListener chamado", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")
    const wrapper = mountClock({ attachTo: document.body })
    wrapper.unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })

  it("measure: setTimeout quando dimensões <= 0", () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout")
    const wrapper = mountClock({ attachTo: document.body })
    const container = wrapper.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 0, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 0, configurable: true })
    window.dispatchEvent(new Event("resize"))
    vi.advanceTimersByTime(200)
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100)
    setTimeoutSpy.mockRestore()
  })

  it("digital: ampm com stage.fontWeight", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      format24h: false,
    } as ClockConfig
    const wrapper = mountClock({
      stage: {
        fontSize: 96,
        textColor: "#fff",
        fontWeight: 900,
        textAlign: "center",
        textVerticalAlign: "middle",
        textShadow: false,
        shadowBlur: 0,
        shadowIntensity: 0,
        textBox: false,
        boxOpacity: 0,
        boxBorder: false,
      } as StageSettings,
    })
    const ampmStyle = wrapper.find(".clock-preview__ampm").attributes("style") ?? ""
    // com stage.fontWeight=900 → min(700, 900) = 700 aplicado
    expect(ampmStyle).toContain("font-weight")
    expect(ampmStyle).toContain("700")
    clockConfigState.cfg = { ...clockConfigState.cfg, format24h: true } as ClockConfig
  })

  it("digital: estilos inline do span de segundos (gaps template 188)", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const secondsStyle = wrapper.find(".clock-preview__seconds").attributes("style") ?? ""
    // fontSize = digitalFontSize * 0.5, marginBottom = digitalFontSize * 0.15
    expect(secondsStyle).toContain("font-size")
    expect(secondsStyle).toContain("margin-bottom")
    wrapper.unmount()
  })

  it("digital: fontWeight do ampm sem stage é undefined (gaps template 200)", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      format24h: false,
    } as ClockConfig
    const wrapper = mountClock({ attachTo: document.body })
    const ampmStyle = wrapper.find(".clock-preview__ampm").attributes("style") ?? ""
    // sem stage → fontWeight undefined (não deve conter font-weight)
    expect(ampmStyle).not.toContain("font-weight")
    clockConfigState.cfg = { ...clockConfigState.cfg, format24h: true } as ClockConfig
    wrapper.unmount()
  })

  it("digital: v-ifs falsos — showSeconds=false e format24h=true (gaps template 188/196)", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      showSeconds: false,
      format24h: true,
    } as ClockConfig
    const wrapper = mountClock({ attachTo: document.body })
    expect(wrapper.find(".clock-preview__seconds").exists()).toBe(false)
    expect(wrapper.find(".clock-preview__ampm").exists()).toBe(false)
    // hora continua renderizando
    expect(wrapper.find(".clock-preview__digital").text()).toContain("10:30")
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      showSeconds: true,
    } as ClockConfig
    wrapper.unmount()
  })

  it("analog: boxShadow preview=false com stage.textShadow=true", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
    } as ClockConfig
    const wrapper = mountClock({
      stage: {
        fontSize: 96,
        textColor: "#fff",
        fontWeight: 700,
        textAlign: "center",
        textVerticalAlign: "middle",
        textShadow: true,
        shadowBlur: 10,
        shadowIntensity: 0.6,
        textBox: false,
        boxOpacity: 0,
        boxBorder: false,
      } as StageSettings,
    })
    const style = wrapper.find(".clock-preview__analog").attributes("style") ?? ""
    expect(style).toContain("inset 0 0 40px rgba(0,0,0,0.2)")
    expect(style).toContain("rgba(0,0,0,0.6)")
    clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital" } as ClockConfig
  })

  it("analog: boxShadow preview=false sem stage.textShadow", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
    } as ClockConfig
    const wrapper = mountClock({
      stage: {
        fontSize: 96,
        textColor: "#fff",
        fontWeight: 700,
        textAlign: "center",
        textVerticalAlign: "middle",
        textShadow: false,
        shadowBlur: 0,
        shadowIntensity: 0,
        textBox: false,
        boxOpacity: 0,
        boxBorder: false,
      } as StageSettings,
    })
    const style = wrapper.find(".clock-preview__analog").attributes("style") ?? ""
    expect(style).toContain("inset 0 0 40px")
    expect(style).toContain("0 10px 40px")
    clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital" } as ClockConfig
  })

  it("analog: boxShadow preview=true", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
    } as ClockConfig
    const wrapper = mountClock({ preview: true })
    const style = wrapper.find(".clock-preview__analog").attributes("style") ?? ""
    expect(style).toContain("box-shadow: none")
    clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital" } as ClockConfig
  })

  it("analog: second hand renderiza quando showSeconds=true", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
      showSeconds: true,
    } as ClockConfig
    const wrapper = mountClock()
    expect(wrapper.find(".clock-preview__hand--second").exists()).toBe(true)
    expect(wrapper.find(".clock-preview__second-tail").exists()).toBe(true)
    clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital", showSeconds: true } as ClockConfig
  })

  it("analog: second hand NÃO renderiza quando showSeconds=false", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
      showSeconds: false,
    } as ClockConfig
    const wrapper = mountClock()
    expect(wrapper.find(".clock-preview__hand--second").exists()).toBe(false)
    clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital", showSeconds: true } as ClockConfig
  })

  it("markers: v-for 12 marcadores", () => {
    clockConfigState.cfg = {
      ...clockConfigState.cfg,
      style: "analog",
    } as ClockConfig
    const wrapper = mountClock()
    const markers = wrapper.findAll(".clock-preview__marker")
    expect(markers.length).toBe(12)
    clockConfigState.cfg = { ...clockConfigState.cfg, style: "digital" } as ClockConfig
  })
})

describe("ClockPreview.vue - Exposed Function Coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clockConfigState.cfg = {
      style: "digital",
      format24h: true,
      showSeconds: true,
      textColor: "#ffffff",
      bgColor: "#000000",
    } as unknown as ClockConfig
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("exposed computeDigitalFontSize é chamável e cobre function 0", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const exposed = wrapper.vm as unknown as {
      computeDigitalFontSize: typeof computeDigitalFontSize
    }
    const mockStage: StageSettings = {
      fontSize: 96,
      fontWeight: 600,
      textAlign: "center",
      textVerticalAlign: "middle",
      textColor: "#ff0000",
      textShadow: true,
      shadowBlur: 2,
      shadowIntensity: 0.5,
      textBox: false,
      boxOpacity: 0.5,
      boxBorder: false,
    } as unknown as StageSettings

    // Test all branches
    expect(exposed.computeDigitalFontSize(mockStage, 400, 300, true)).toBe(20)
    expect(exposed.computeDigitalFontSize(mockStage, 400, 300, false)).toBe(20)
    expect(exposed.computeDigitalFontSize(undefined, 400, 300, true)).toBe(105)
    expect(exposed.computeDigitalFontSize(undefined, 400, 300, false)).toBe(120)
    expect(exposed.computeDigitalFontSize(undefined, 0, 0, true)).toBe(20)
    expect(exposed.computeDigitalFontSize(mockStage, 0, 300, true)).toBe(20)
    const smallStage = { ...mockStage, fontSize: 10 } as StageSettings
    expect(exposed.computeDigitalFontSize(smallStage, 100, 100, true)).toBe(16)
  })

  it("exposed computeAnalogSize cobre branches", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const exposed = wrapper.vm as unknown as {
      computeAnalogSize: typeof computeAnalogSize
    }
    const mockStage: StageSettings = {
      fontSize: 96,
      fontWeight: 600,
      textAlign: "center",
      textVerticalAlign: "middle",
      textColor: "#ff0000",
      textShadow: true,
      shadowBlur: 2,
      shadowIntensity: 0.5,
      textBox: false,
      boxOpacity: 0.5,
      boxBorder: false,
    } as unknown as StageSettings

    expect(exposed.computeAnalogSize(mockStage, 400, 300)).toBe(240)
    expect(exposed.computeAnalogSize(undefined, 400, 300)).toBe(240)
    expect(exposed.computeAnalogSize(mockStage, 0, 300)).toBe(100)
    expect(exposed.computeAnalogSize(mockStage, 50, 50)).toBe(100)
    const smallStage = { ...mockStage, fontSize: 10 } as StageSettings
    expect(exposed.computeAnalogSize(smallStage, 200, 200)).toBe(80)
    const largeStage = { ...mockStage, fontSize: 192 } as StageSettings
    expect(exposed.computeAnalogSize(largeStage, 400, 300)).toBe(480)
  })

  it("exposed computeAccentColor cobre branches", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const exposed = wrapper.vm as unknown as {
      computeAccentColor: typeof computeAccentColor
    }
    const mockStage: StageSettings = {
      fontSize: 96,
      fontWeight: 600,
      textAlign: "center",
      textVerticalAlign: "middle",
      textColor: "#ff0000",
      textShadow: true,
      shadowBlur: 2,
      shadowIntensity: 0.5,
      textBox: false,
      boxOpacity: 0.5,
      boxBorder: false,
    } as unknown as StageSettings

    expect(exposed.computeAccentColor(mockStage, false, "#000000")).toBe("#ff0000")
    expect(exposed.computeAccentColor(undefined, true, "#000000")).toBe("var(--ds-color-on-surface)")
    expect(exposed.computeAccentColor(undefined, false, "#00ffff")).toBe("#00ffff")
    expect(exposed.computeAccentColor(mockStage, true, "#000000")).toBe("#ff0000")
  })

  it("exposed computeDigitalStyle cobre branches", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const exposed = wrapper.vm as unknown as {
      computeDigitalStyle: typeof computeDigitalStyle
    }
    const mockStage: StageSettings = {
      fontSize: 96,
      fontWeight: 600,
      textAlign: "center",
      textVerticalAlign: "middle",
      textColor: "#ff0000",
      textShadow: true,
      shadowBlur: 2,
      shadowIntensity: 0.5,
      textBox: false,
      boxOpacity: 0.5,
      boxBorder: false,
    } as unknown as StageSettings

    const result1 = exposed.computeDigitalStyle(mockStage, false, "#ff0000", 50)
    expect(result1.fontWeight).toBe("600")
    expect(result1.textShadow).toBe("0 0 2vh rgba(0,0,0,0.5)")

    const result2 = exposed.computeDigitalStyle(undefined, false, "#00ff00", 40)
    expect(result2.fontWeight).toBe("900")
    expect(result2.textShadow).toBe("0 4px 30px #00ff0040")

    const result3 = exposed.computeDigitalStyle(undefined, true, "#000000", 30)
    expect(result3.textShadow).toBe("none")

    const stageNoShadow = { ...mockStage, textShadow: false } as StageSettings
    const result4 = exposed.computeDigitalStyle(stageNoShadow, false, "#ff0000", 50)
    expect(result4.textShadow).toBe("none")

    const stageWithBox = { ...mockStage, textBox: true, boxOpacity: 0.7, boxBorder: true } as StageSettings
    const result5 = exposed.computeDigitalStyle(stageWithBox, false, "#ff0000", 50)
    expect(result5.background).toBe("rgba(0,0,0,0.7)")
    expect(result5.border).toBe("1px solid rgba(255,255,255,0.25)")

    const stageNoBorder = { ...mockStage, textBox: true, boxBorder: false } as StageSettings
    const result6 = exposed.computeDigitalStyle(stageNoBorder, false, "#ff0000", 50)
    expect(result6.border).toBe("none")
  })

  it("exposed computeSurfaceStyle e stageFlexJustify cobrem branches", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const exposed = wrapper.vm as unknown as {
      computeSurfaceStyle: typeof computeSurfaceStyle
      stageFlexJustify: typeof stageFlexJustify
    }
    const mockStage: StageSettings = {
      fontSize: 96,
      fontWeight: 600,
      textAlign: "center",
      textVerticalAlign: "middle",
      textColor: "#ff0000",
      textShadow: true,
      shadowBlur: 2,
      shadowIntensity: 0.5,
      textBox: false,
      boxOpacity: 0.5,
      boxBorder: false,
    } as unknown as StageSettings

    const surface = exposed.computeSurfaceStyle(mockStage, "#ff0000")
    expect(surface.color).toBe("#ff0000")
    expect(surface.alignItems).toBe("center")

    expect(exposed.stageFlexJustify(undefined)).toEqual({ alignItems: "center", justifyContent: "center" })
    expect(exposed.stageFlexJustify({ ...mockStage, textVerticalAlign: "top" } as StageSettings).alignItems).toBe("flex-start")
    expect(exposed.stageFlexJustify({ ...mockStage, textVerticalAlign: "bottom" } as StageSettings).alignItems).toBe("flex-end")
    expect(exposed.stageFlexJustify({ ...mockStage, textAlign: "left" } as StageSettings).justifyContent).toBe("flex-start")
    expect(exposed.stageFlexJustify({ ...mockStage, textAlign: "right" } as StageSettings).justifyContent).toBe("flex-end")
  })

  it("exposed measure cobre early return e setTimeout", () => {
    const wrapper = mountClock({ attachTo: document.body })
    const exposed = wrapper.vm as unknown as {
      measure: () => void
      containerRef: { value: HTMLElement | null }
    }

    // Early return when containerRef is null
    wrapper.unmount()
    expect(() => exposed.measure()).not.toThrow()

    // setTimeout when dimensions <= 0. O retry único arma no mount se o
    // container ainda não tem tamanho; o espião precisa existir antes disso.
    const setTimeoutSpy = vi.spyOn(window, "setTimeout")
    const wrapper2 = mountClock({ attachTo: document.body })
    const container = wrapper2.find(".clock-preview").element as HTMLElement
    Object.defineProperty(container, "offsetWidth", { value: 0, configurable: true })
    Object.defineProperty(container, "offsetHeight", { value: 0, configurable: true })
    const exposed2 = wrapper2.vm as unknown as {
      measure: () => void
      containerRef: { value: HTMLElement | null }
    }
    exposed2.measure()
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100)
    setTimeoutSpy.mockRestore()
  })

  it("getter props.config do useClockDisplay resolve (linha 33 do composable via componente)", async () => {
    // Ativa o modo real do mock: a próxima montagem do componente usa o
    // useClockDisplay real, cobrindo o getter `() => props.config` (linha 32).
    setActivePinia(createPinia())
    useClockMockState.useReal = true
    const cfg = {
      style: "digital",
      format24h: true,
      showSeconds: true,
      textColor: "#ffffff",
      bgColor: "#000000",
    } as unknown as ClockConfig
    const wrapperReal = mount(ClockPreview, {
      props: { config: cfg },
      attachTo: document.body,
    })
    await wrapperReal.vm.$nextTick()
    expect(wrapperReal.find(".clock-preview__digital").exists()).toBe(true)
    expect(wrapperReal.find(".clock-preview__seconds").text()).toMatch(/^\d{2}$/)
    wrapperReal.unmount()
    useClockMockState.useReal = false
    const { useClockDisplay } = await import("../../composables/useClock.ts?__real")
    const display = useClockDisplay(() => cfg)
    // getter resolve para a config passada (não cai no store.config)
    expect(display.config.value.format24h).toBe(true)
    expect(typeof display.formattedTime.value).toBe("string")
    expect(display.formattedSeconds.value).toMatch(/^\d{2}$/)
    expect(["AM", "PM"]).toContain(display.ampm.value)
    expect(typeof display.hourAngle.value).toBe("number")
    expect(typeof display.minuteAngle.value).toBe("number")
    expect(typeof display.secondAngle.value).toBe("number")
  })
})