import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, captureMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock("@sentry/electron/renderer", () => ({
  init: initMock,
  captureException: captureMock,
}));

describe("telemetria — cobertura de guardas", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@sentry/electron/renderer", () => ({
      init: initMock,
      captureException: captureMock,
    }));
    initMock.mockClear();
    captureMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("startRendererTelemetry é idempotente (started guard): init 1x", async () => {
    vi.stubEnv("VITE_TELEMETRIA_DSN", "https://key@errors.example.com/1");
    const { startRendererTelemetry } = await import("../telemetry");
    await startRendererTelemetry();
    await startRendererTelemetry();
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("captureException lançando: reportError engole (telemetria nunca quebra)", async () => {
    vi.stubEnv("VITE_TELEMETRIA_DSN", "https://key@errors.example.com/1");
    captureMock.mockImplementation(() => {
      throw new Error("sdk down");
    });
    const { startRendererTelemetry, reportError } = await import("../telemetry");
    await startRendererTelemetry();
    expect(() => reportError(new Error("x"))).not.toThrow();
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("environment reflete import.meta.env.DEV (2 lados do branch)", async () => {
    vi.stubEnv("VITE_TELEMETRIA_DSN", "https://key@errors.example.com/1");
    // lado TRUE (vitest roda em DEV): environment=development
    const m1 = await import("../telemetry");
    await m1.startRendererTelemetry();
    const opts1 = initMock.mock.calls[0][0];
    expect(opts1.environment).toBe("development");
    // lado FALSE: simular módulo "fresh" com DEV=false via defineProperty no import.meta
    vi.resetModules();
    vi.doMock("@sentry/electron/renderer", () => ({ init: initMock, captureException: captureMock }));
    vi.stubEnv("DEV", false);
    const m2 = await import("../telemetry");
    await m2.startRendererTelemetry();
    const opts2 = initMock.mock.calls[1][0];
    expect(opts2.environment).toBe("production");
    vi.unstubAllEnvs();
  });

  it("setTelemetryCapture registra função manual e reportError usa", async () => {
    const { setTelemetryCapture, reportError } = await import("../telemetry");
    const manual = vi.fn();
    setTelemetryCapture(manual);
    reportError(new Error("manual"), { a: 1 });
    expect(manual).toHaveBeenCalledTimes(1);
    setTelemetryCapture(null);
    expect(() => reportError(new Error("x"))).not.toThrow();
  });
});
