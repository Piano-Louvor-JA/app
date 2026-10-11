// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: pacote Microsoft Store (`process.windowsStore`) DEVE desligar
 * o canal electron-updater — política da Store reprova self-updater
 * (bloqueador de certificação). Cobre initUpdater e os handlers IPC.
 */

const mockAutoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  checkForUpdates: vi.fn(async () => ({})),
  downloadUpdate: vi.fn(async () => ({})),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
};

globalThis.__LOUVORJA_AUTOUPDATER_MOCK__ = mockAutoUpdater;

// Mock do electron: isPackaged=true (produção) + ipcMain com handlers gravados.
vi.mock("electron", () => ({
  app: { isPackaged: true },
  ipcMain: {
    handlers: new Map(),
    handle(channel, fn) {
      this.handlers.set(channel, fn);
    },
  },
}));

async function loadUpdater() {
  vi.resetModules();
  const mod = await import("../updater.mjs");
  return mod;
}

const fakeWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };

describe("updater.mjs — pacote Microsoft Store", () => {
  let originalExecPath;

  beforeEach(() => {
    vi.clearAllMocks();
    originalExecPath = process.execPath;
    delete process.windowsStore;
  });

  afterEach(() => {
    delete process.windowsStore;
    Object.defineProperty(process, "execPath", { value: originalExecPath });
  });

  it("isWindowsStorePackage(): true quando process.windowsStore === true", async () => {
    const { isWindowsStorePackage } = await loadUpdater();
    process.windowsStore = true;
    expect(isWindowsStorePackage()).toBe(true);
  });

  it("isWindowsStorePackage(): true via fallback do caminho WindowsApps", async () => {
    const { isWindowsStorePackage } = await loadUpdater();
    Object.defineProperty(process, "execPath", {
      value: "C:\\Program Files\\WindowsApps\\RDZDev.PianoLouvorJa_4pmwqfw44jq8j\\app\\louvorja-piano.exe",
    });
    expect(isWindowsStorePackage()).toBe(true);
  });

  it("isWindowsStorePackage(): false no install NSIS comum", async () => {
    const { isWindowsStorePackage } = await loadUpdater();
    Object.defineProperty(process, "execPath", {
      value: "C:\\Program Files\\louvorja-piano\\louvorja-piano.exe",
    });
    expect(isWindowsStorePackage()).toBe(false);
  });

  it("initUpdater: Store package NÃO configura autoUpdater nem registra eventos de update", async () => {
    const { initUpdater } = await loadUpdater();
    process.windowsStore = true;
    initUpdater(() => fakeWindow);
    expect(mockAutoUpdater.on).not.toHaveBeenCalled();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("initUpdater: NSIS normal configura autoUpdater (regression canal atual)", async () => {
    const { initUpdater } = await loadUpdater();
    initUpdater(() => fakeWindow);
    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.on).toHaveBeenCalledWith(
      "update-available",
      expect.any(Function),
    );
  });

  it("IPC updater:check em Store retorna storeManaged, sem chamar checkForUpdates", async () => {
    const { initUpdater } = await loadUpdater();
    process.windowsStore = true;
    initUpdater(() => fakeWindow);
    const handlers = (await import("electron")).ipcMain.handlers;
    const result = await handlers.get("updater:check")();
    expect(result).toEqual({ available: false, storeManaged: true });
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("IPC updater:download em Store é recusado", async () => {
    const { initUpdater } = await loadUpdater();
    process.windowsStore = true;
    initUpdater(() => fakeWindow);
    const handlers = (await import("electron")).ipcMain.handlers;
    const result = await handlers.get("updater:download")();
    expect(result.success).toBe(false);
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("IPC updater:install em Store é recusado", async () => {
    const { initUpdater } = await loadUpdater();
    process.windowsStore = true;
    initUpdater(() => fakeWindow);
    const handlers = (await import("electron")).ipcMain.handlers;
    const result = handlers.get("updater:install")();
    expect(result.success).toBe(false);
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});
