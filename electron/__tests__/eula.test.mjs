// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock workspace.mjs — isEulaAccepted depende de readWorkspaceRecord
vi.mock("../workspace.mjs", () => ({
  readWorkspaceRecord: vi.fn(),
  writeWorkspaceRecord: vi.fn(),
}));

// Mock electron — dialog e app
vi.mock("electron", () => ({
  app: {
    getAppPath: vi.fn(() => {
      throw new Error("test");
    }),
  },
  dialog: {
    showMessageBoxSync: vi.fn(),
  },
  BrowserWindow: vi.fn(function BrowserWindowMock() {
    return {
    id: 1,
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
    close: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    webContents: {
      on: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
    };
  }),
  ipcMain: {
    once: vi.fn(),
    removeListener: vi.fn(),
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 },
    })),
  },
}));

import { BrowserWindow, dialog } from "electron";
// Importar após o mock
import {
  __setEulaPlatformForTests,
  __setEulaPresenterForTests,
  __setChangeSummaryPresenterForTests,
  acceptEula,
  checkEulaAcceptance,
  getEulaText,
  isEulaAccepted,
  presentEulaAcceptanceWindow,
  showEulaDialog,
} from "../eula.mjs";
import { readWorkspaceRecord, writeWorkspaceRecord } from "../workspace.mjs";

describe("isEulaAccepted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna true quando record existe com accepted: true e versao atual", () => {
    readWorkspaceRecord.mockReturnValue({
      accepted: true,
      version: 2,
      date: "2026-08-07",
    });
    expect(isEulaAccepted()).toBe(true);
  });

  it("retorna false quando record e null (primeira execucao)", () => {
    readWorkspaceRecord.mockReturnValue(null);
    expect(isEulaAccepted()).toBe(false);
  });

  it("retorna false quando accepted e false", () => {
    readWorkspaceRecord.mockReturnValue({ accepted: false, version: 1 });
    expect(isEulaAccepted()).toBe(false);
  });

  it("retorna false quando versao do record e anterior", () => {
    readWorkspaceRecord.mockReturnValue({ accepted: true, version: 0 });
    expect(isEulaAccepted()).toBe(false);
  });
});

describe("acceptEula", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grava record com accepted true e versao atual", () => {
    writeWorkspaceRecord.mockReturnValue(true);
    expect(acceptEula()).toBe(true);
    expect(writeWorkspaceRecord).toHaveBeenCalledWith(
      "eula",
      expect.objectContaining({
        accepted: true,
        version: 2,
      }),
    );
  });
});

describe("NSIS multilingual EULA configuration", () => {
  it("uses explicit LCIDs supported by the electron-builder NSIS language set", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const nsisPath = fileURLToPath(new URL("../../build/nsis-eula.nsh", import.meta.url));
    const script = await readFile(nsisPath, "utf8");

    expect(script).toContain("LicenseLangString LicenseFile ${LANG_PORTUGUESE_BR}");
    expect(script).toContain("!define LANG_ENGLISH_US 1033");
    expect(script).toContain("!define LANG_SPANISH_ES 3082");
    expect(script).toContain("LicenseLangString LicenseFile ${LANG_ENGLISH_US}");
    expect(script).toContain("LicenseLangString LicenseFile ${LANG_SPANISH_ES}");
    expect(script).not.toMatch(/LicenseLangString LicenseFile \$\{LANG_(ENGLISH|SPANISH)\}/);
    expect(script).toContain('!define INSTALL_FOLDER_NAME "Louvor JA PIANO"');
    expect(script).toContain('!define DATA_FOLDER_NAME "LouvorJA-PIANO"');
    expect(script).toContain("customInit");
    expect(script).toContain("killAppIfRunning");
    expect(script).toContain("customHeader");
    expect(script).toContain('!addincludedir "${BUILD_RESOURCES_DIR}"');
    expect(script).toContain('taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T');
    // Check não deve exibir o diálogo — só taskkill.
    expect(script).not.toMatch(
      /!macro customCheckAppRunning[\s\S]*\$\(appCannotBeClosed\)/,
    );
    expect(script).toContain("customInstall");
    expect(script).toContain("preInit");
    // Instalação simplificada: sem página de pasta custom (fica em Configurações).
    expect(script).not.toContain("customPageAfterChangeDir");
    expect(script).not.toContain("MediaPage");
    expect(script).not.toContain("MEDIA_OPT_CUSTOM");
    expect(script).not.toContain("nsDialogs.nsh");
    // NSIS: \\${...} evita C:\ProgramDataLouvorJA-PIANO (barra engolida)
    expect(script).toMatch(/\$0\\\\\$\{DATA_FOLDER_NAME\}/);
    expect(script).toMatch(/Media\\\\covers/);
  });

  it("overrides extractAppPackage to extract 7z in-place without CopyFiles dialog", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const extractPath = fileURLToPath(
      new URL("../../build/extractAppPackage.nsh", import.meta.url),
    );
    const script = await readFile(extractPath, "utf8");
    expect(script).toContain("!macro extractUsing7za");
    expect(script).toContain('taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T');
    expect(script).toContain("Nsis7z::Extract");
    expect(script).not.toMatch(/MessageBox.*appCannotBeClosed/)
    expect(script).not.toMatch(/CopyFiles/)
  });

  it("patch NSIS remove o label OneMoreAttempt (makensis warning 6012 vira erro)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const patchPath = fileURLToPath(
      new URL("../../build/patch-nsis-templates.mjs", import.meta.url),
    );
    const script = await readFile(patchPath, "utf8");
    expect(script).toMatch(/replace\(\/\^\\s\*OneMoreAttempt:/);
    expect(script).not.toMatch(/IDRETRY OneMoreAttempt/);
  });
});

describe("getEulaText", () => {
  it("le arquivo pt-BR.txt e retorna conteudo como string", () => {
    const text = getEulaText("pt-BR");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("le arquivo en.txt e retorna conteudo como string", () => {
    const text = getEulaText("en");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("le arquivo es.txt e retorna conteudo como string", () => {
    const text = getEulaText("es");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("presentEulaAcceptanceWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setEulaPlatformForTests(null);
    __setEulaPresenterForTests(null);
  });

  it.each(["win32", "linux"])("mantém o presenter existente em %s", async (platform) => {
    __setEulaPlatformForTests(platform);
    __setEulaPresenterForTests(async () => 0);

    expect(await presentEulaAcceptanceWindow("pt-BR")).toBe(0);
    expect(BrowserWindow).not.toHaveBeenCalled();
  });

  it("abre a janela segura e rolável exclusivamente no macOS", async () => {
    __setEulaPlatformForTests("darwin");
    const decision = presentEulaAcceptanceWindow("pt-BR");

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        resizable: true,
        webPreferences: expect.objectContaining({
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        }),
      }),
    );
    const window = BrowserWindow.mock.results[0].value;
    expect(window.loadURL).toHaveBeenCalledWith(expect.stringContaining("data:text/html"));
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));

    const closeHandler = window.on.mock.calls.find(([event]) => event === "close")[1];
    closeHandler({ preventDefault: vi.fn() });
    await expect(decision).resolves.toBe(1);
  });
});

describe("showEulaDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setEulaPlatformForTests(null);
    __setEulaPresenterForTests(null);
  });

  it('retorna true e chama acceptEula quando usuario clica "Aceitar" (response=0)', async () => {
    writeWorkspaceRecord.mockReturnValue(true);
    __setEulaPresenterForTests(async () => 0);

    const result = await showEulaDialog("pt-BR");
    expect(writeWorkspaceRecord).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("retorna false quando usuario recusa EULA (response=1) — sem confirmacao dupla", async () => {
    __setEulaPresenterForTests(async () => 1);

    const result = await showEulaDialog("pt-BR");
    expect(writeWorkspaceRecord).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("usa o presenter da plataforma (sem dialog de confirmacao extra)", async () => {
    __setEulaPresenterForTests(async (locale) => {
      expect(locale).toBe("pt-BR");
      return 0;
    });
    writeWorkspaceRecord.mockReturnValue(true);

    await expect(showEulaDialog("pt-BR")).resolves.toBe(true);
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
  });

  it("propaga locale en para o presenter ao recusar", async () => {
    __setEulaPresenterForTests(async (locale) => {
      expect(locale).toBe("en");
      return 1;
    });

    await expect(showEulaDialog("en")).resolves.toBe(false);
    expect(writeWorkspaceRecord).not.toHaveBeenCalled();
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
  });
});

describe("checkEulaAcceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setEulaPlatformForTests(null);
    __setEulaPresenterForTests(null);
  });

  it("retorna true sem mostrar dialog quando EULA ja foi aceito na versao atual", async () => {
    readWorkspaceRecord.mockReturnValue({ accepted: true, version: 2 });
    writeWorkspaceRecord.mockReturnValue(true);

    const result = await checkEulaAcceptance("pt-BR");
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("mostra dialog quando versao do record e anterior", async () => {
    readWorkspaceRecord.mockReturnValue({ accepted: true, version: 0 });
    writeWorkspaceRecord.mockReturnValue(true);
    __setEulaPresenterForTests(async () => 0);

    const result = await checkEulaAcceptance("pt-BR");
    expect(writeWorkspaceRecord).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("mostra dialog e retorna true quando usuario aceita (primeira execucao)", async () => {
    readWorkspaceRecord.mockReturnValue(null);
    writeWorkspaceRecord.mockReturnValue(true);
    __setEulaPresenterForTests(async () => 0);

    const result = await checkEulaAcceptance("pt-BR");
    expect(writeWorkspaceRecord).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("mostra dialog e retorna false quando usuario recusa", async () => {
    readWorkspaceRecord.mockReturnValue(null);
    __setEulaPresenterForTests(async () => 1);

    const result = await checkEulaAcceptance("pt-BR");
    expect(writeWorkspaceRecord).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

describe("getEulaChangeSummary / re-aceite v2", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getEulaChangeSummary retorna seções novas quando versão aceita < atual", async () => {
    const { getEulaChangeSummary } = await import("../eula.mjs");
    const summary = getEulaChangeSummary(1);
    expect(summary).toContain("Login opcional");
    expect(summary).toContain("v2.0");
  });

  it("getEulaChangeSummary retorna null quando não há versão aceita", async () => {
    const { getEulaChangeSummary } = await import("../eula.mjs");
    expect(getEulaChangeSummary(0)).toBeNull();
    expect(getEulaChangeSummary(null)).toBeNull();
  });

  it("re-aceite (v1 aceita): resumo aceito → grava v2 sem mostrar texto integral", async () => {
    readWorkspaceRecord.mockReturnValue({ accepted: true, version: 1 });
    writeWorkspaceRecord.mockReturnValue(true);
    __setChangeSummaryPresenterForTests(async () => true);

    const result = await checkEulaAcceptance("pt-BR");
    expect(result).toBe(true);
    expect(writeWorkspaceRecord).toHaveBeenCalled();
  });

  it("re-aceite (v1 aceita): resumo recusado → false sem gravar", async () => {
    writeWorkspaceRecord.mockClear();
    readWorkspaceRecord.mockReturnValue({ accepted: true, version: 1 });
    __setChangeSummaryPresenterForTests(async () => false);

    const result = await checkEulaAcceptance("pt-BR");
    expect(result).toBe(false);
    expect(writeWorkspaceRecord).not.toHaveBeenCalled();
  });
});
