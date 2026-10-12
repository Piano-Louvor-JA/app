import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// mocks do @sentry/electron/renderer — o teste prova o CONTRATO do módulo:
// sem DSN = nunca importa/inita; com DSN = inita 1x e reportError repassa.
const { initMock, captureMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock("@sentry/electron/renderer", () => ({
  init: initMock,
  captureException: captureMock,
}));

describe("telemetria (renderer)", () => {
  beforeEach(() => {
    vi.resetModules();
    // resetModules descarta o factory do vi.mock — re-registrar pro clone:
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

  it("sem VITE_TELEMETRIA_DSN: nenhum init, reportError é no-op silencioso", async () => {
    vi.stubEnv("VITE_TELEMETRIA_DSN", "");
    const { startRendererTelemetry, reportError } = await import("../telemetry");
    await startRendererTelemetry();
    expect(initMock).not.toHaveBeenCalled();
    // reportError sem telemetria não lança e não toca o SDK
    expect(() => reportError(new Error("x"))).not.toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("com DSN: inita 1x (sem PII, traces 0) e reportError repassa com extra", async () => {
    vi.stubEnv("VITE_TELEMETRIA_DSN", "https://key@errors.example.com/1");
    const { startRendererTelemetry, reportError } = await import("../telemetry");
    await startRendererTelemetry();
    expect(initMock).toHaveBeenCalledTimes(1);
    const opts = initMock.mock.calls[0][0];
    expect(opts.dsn).toBe("https://key@errors.example.com/1");
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.tracesSampleRate).toBe(0);
    reportError(new Error("boom"), { album: "a1", totalErrors: 5 });
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock.mock.calls[0][1].extra).toMatchObject({ album: "a1", totalErrors: 5 });
  });

  it("beforeSend descarta info/debug — só erro/crash sai da máquina", async () => {
    vi.stubEnv("VITE_TELEMETRIA_DSN", "https://key@errors.example.com/1");
    const { startRendererTelemetry } = await import("../telemetry");
    await startRendererTelemetry();
    const beforeSend = initMock.mock.calls[0][0].beforeSend as (e: {
      level?: string;
    }) => unknown;
    expect(beforeSend({ level: "info" })).toBeNull();
    expect(beforeSend({ level: "debug" })).toBeNull();
    expect(beforeSend({ level: "error" })).not.toBeNull();
    expect(beforeSend({ level: "warning" })).not.toBeNull();
  });

  it("SDK quebrando no import: startRendererTelemetry não lança", async () => {
    vi.stubEnv("VITE_TELEMETRIA_DSN", "https://key@errors.example.com/1");
    vi.resetModules();
    vi.doMock("@sentry/electron/renderer", () => {
      throw new Error("sdk ausente");
    });
    const { startRendererTelemetry, reportError } = await import("../telemetry");
    await expect(startRendererTelemetry()).resolves.toBeUndefined();
    expect(() => reportError(new Error("x"))).not.toThrow();
  });
});
