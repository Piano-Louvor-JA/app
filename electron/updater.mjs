import { app, ipcMain } from "electron";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// electron-updater é carregado com preguiça: em testes (vitest), o mock pode
// ser injetado via globalThis.__LOUVORJA_AUTOUPDATER_MOCK__ antes do import.
const { autoUpdater } =
	globalThis.__LOUVORJA_AUTOUPDATER_MOCK__ !== undefined
		? { autoUpdater: globalThis.__LOUVORJA_AUTOUPDATER_MOCK__ }
		: require("electron-updater");

/**
 * Configura o autoUpdater do electron-updater.
 * - Não desabilita auto-download (usuário decide no modal)
 * - Em dev (não empacotado) não faz check
 */
let updaterState = {
	available: false,
	version: null,
	releaseNotes: null,
	progress: 0,
	downloaded: false,
	error: null,
};

/**
 * Detecta execução via pacote Microsoft Store (MSIX/APPX).
 * A Store REPROVA apps com self-updater embutido (política 10.8.x — updates
 * devem ser entregues pela própria Store), então o canal electron-updater
 * precisa ficar completamente desligado nesse ambiente.
 */
export function isWindowsStorePackage() {
	// Electron expõe a flag nativamente em builds MSIX/APPX.
	if (process.windowsStore === true) return true;
	// Fallback robusto: caminho de instalação de pacote assinado pela Store
	// (WindowsApps) ou execution alias do identity RDZDev.PianoLouvorJa.
	const exe = String(process.execPath || "").toLowerCase();
	return exe.includes("\\windowsapps\\") || exe.includes("pianolouvorja_");
}

/**
 * Inicializa o electron-updater e registra IPC handlers.
 * Deve ser chamado após app.whenReady().
 *
 * @param {import('electron').BrowserWindow} mainWindowGetter - Janela principal para enviar eventos.
 */
export function initUpdater(mainWindowGetter) {
	// Microsoft Store: self-update é bloqueador de certificação — canal OFF.
	if (isWindowsStorePackage()) {
		console.log("[updater] pacote Microsoft Store — auto-update desabilitado (updates via Store)");
		registerIpc(mainWindowGetter);
		return;
	}
	// Não verificar em dev
	if (!isPackaged()) {
		console.log("[updater] dev mode — auto-update desabilitado");
		registerIpc(mainWindowGetter);
		return;
	}

	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;

	autoUpdater.on("checking-for-update", () => {
		console.log("[updater] verificando atualizações...");
	});

	autoUpdater.on("update-available", (info) => {
		console.log(`[updater] versão ${info.version} disponível`);
		updaterState.available = true;
		updaterState.version = info.version;
		updaterState.releaseNotes = info.releaseNotes || null;
		sendToRenderer(mainWindowGetter, "updater:available", {
			version: info.version,
			releaseNotes: info.releaseNotes || "",
		});
	});

	autoUpdater.on("update-not-available", () => {
		console.log("[updater] nenhuma atualização disponível");
	});

	autoUpdater.on("download-progress", (progress) => {
		updaterState.progress = Math.round(progress.percent);
		sendToRenderer(mainWindowGetter, "updater:progress", {
			progress: updaterState.progress,
		});
	});

	autoUpdater.on("update-downloaded", () => {
		console.log("[updater] download concluído");
		updaterState.downloaded = true;
		sendToRenderer(mainWindowGetter, "updater:downloaded", {});
	});

	autoUpdater.on("error", (error) => {
		console.error("[updater] erro:", error?.message || error);
		updaterState.error = error?.message || "Erro desconhecido";
		sendToRenderer(mainWindowGetter, "updater:error", {
			message: updaterState.error,
		});
	});

	registerIpc(mainWindowGetter);
}

/**
 * Registra os IPC handlers para o renderer controlar o update.
 */
function registerIpc(mainWindowGetter) {
	ipcMain.handle("updater:check", async () => {
		if (!isPackaged()) return { available: false };
		// Pacote Store: atualizações vêm pela Store, nunca pelo electron-updater.
		if (isWindowsStorePackage()) {
			return { available: false, storeManaged: true };
		}
		try {
			const result = await autoUpdater.checkForUpdates();
			return {
				available: updaterState.available,
				version: updaterState.version,
				releaseNotes: updaterState.releaseNotes,
			};
		} catch (error) {
			console.error("[updater] check falhou:", error?.message);
			return { available: false, error: error?.message };
		}
	});

	ipcMain.handle("updater:download", async () => {
		if (isWindowsStorePackage()) {
			return { success: false, error: "Updates gerenciados pela Microsoft Store" };
		}
		try {
			await autoUpdater.downloadUpdate();
			return { success: true };
		} catch (error) {
			console.error("[updater] download falhou:", error?.message);
			return { success: false, error: error?.message };
		}
	});

	ipcMain.handle("updater:install", () => {
		if (isWindowsStorePackage()) {
			return { success: false, error: "Updates gerenciados pela Microsoft Store" };
		}
		if (updaterState.downloaded) {
			autoUpdater.quitAndInstall(false, true);
			return { success: true };
		}
		return { success: false, error: "Download não concluído" };
	});
}

/**
 * Envia evento IPC para o renderer se a janela existir.
 */
function sendToRenderer(mainWindowGetter, channel, data) {
	const win = mainWindowGetter();
	if (win && !win.isDestroyed()) {
		win.webContents.send(channel, data);
	}
}

/**
 * Verifica se o app está empacotado (produção).
 * electron-updater só funciona em produção.
 */
function isPackaged() {
  return app.isPackaged;
}
