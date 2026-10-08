import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, globalShortcut, screen, shell } from "electron";

import {
	APP_DESKTOP_ID,
	ensureLinuxTaskbarIntegration,
	loadAppIconImage,
	resolveAppIconPath,
} from "./app-icon.mjs";
import { APP_PRODUCT_NAME } from "./constants.mjs";
import { startRendererServer, rendererUrl } from "./renderer-server.mjs";
import { configureUserDataPath } from "./user-data-path.mjs";
import { checkEulaAcceptance } from "./eula.mjs";
import { resolveAppLocale } from "./locale.mjs";
import { registerWorkspaceIpc } from "./ipc/register.mjs";
import { registerDiagnosticsIpc } from "./diagnostics.mjs";
import { attachWindowStateEvents, registerWindowIpc } from "./ipc/window.mjs";
import { attachRemoteServer } from "./remote-server.mjs";
import { attachPalcoServer } from "./palco-server.mjs";
import { ensureWorkspaceDirectories } from "./paths.mjs";
import { registerLocalFileProtocol, registerLocalScheme } from "./protocol.mjs";
import { registerCloseProjectionPopups } from "./ipc/web-projection.mjs";
import { buildProjectionWindowBounds } from "./projection-display.mjs";
import { initUpdater } from "./updater.mjs";
import { loadWindowState, trackWindowState } from "./window-state.mjs";
import { registerYoutubeEmbedHeaders } from "./youtube-embed.mjs";
import { registerYoutubeAuthIpc } from "./youtube-auth.mjs";
import { registerAdblockerIpc } from "./youtube-adblock.mjs";
import { readWorkspaceRecord, writeWorkspaceRecord } from "./workspace.mjs";
import { registerTunnelCorpBypass } from "./tunnel-corp-bypass.mjs";
import {
  initProjectionHotkey,
  addProjectionWindowProvider,
  removeProjectionWindowProvider,
  ensureProjectionHotkey,
  releaseProjectionHotkey,
} from "./projection-hotkey.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(VITE_DEV_SERVER_URL);
const PRELOAD_PATH = path.join(__dirname, "preload.mjs");
const bootT0 = Date.now();

function bootMark(label) {
	console.log(`[boot +${Date.now() - bootT0}ms] ${label}`);
}

registerLocalScheme();

// Rede de segurança: exceção não tratada no main (ex.: porta EACCES/EADDRINUSE
// de servidores WS — bug real do José 30/08 no Windows) NÃO PODE derrubar o
// app sem explicação. Loga, mostra diálogo amigável e segue.
process.on("uncaughtException", (error) => {
  console.error("[main] uncaughtException:", error);
  try {
    const msg = error instanceof Error ? error.message : String(error ?? "erro desconhecido");
    dialog.showErrorBox(
      "LouvorJA - PIANO",
      `Ocorreu um erro interno, mas o aplicativo continua rodando.\n\nDetalhe técnico: ${msg}`,
    );
  } catch {
    /* diálogo falhou — segue */
  }
});

/**
 * Linux: app name = WM_CLASS = StartupWMClass do .desktop (ícone na barra).
 * Título da janela continua sendo APP_PRODUCT_NAME.
 */
if (process.platform === "linux") {
	app.setName(APP_DESKTOP_ID);
	app.commandLine.appendSwitch("class", APP_DESKTOP_ID);
} else {
	app.setName(APP_PRODUCT_NAME);
}

bootMark("main loaded");
configureUserDataPath({ isDev });
bootMark("userData");

if (process.platform === "win32") {
	app.setAppUserModelId("com.louvorja.piano");
}

/** Chromium não permite root sem sandbox (dev containers / CI) */
if (typeof process.getuid === "function" && process.getuid() === 0) {
	app.commandLine.appendSwitch("no-sandbox");
}

/** GPU instável nesta máquina (crash do gpu process em loop, 02/10/2026) —
 *  renderização por software é suficiente pro app e estabiliza o dev. */
if (process.env.VITE_DEV_SERVER_URL) {
	app.commandLine.appendSwitch("disable-gpu");
	app.commandLine.appendSwitch("in-process-gpu");
}

/** Permite autoplay com áudio nas janelas de projeção (YouTube). */
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

/** CDP p/ debug automatizado (apenas dev). */
if (process.env.VITE_DEV_SERVER_URL) {
	app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
}


let mainWindow = null;
let splashWindow = null;

/**
 * HTML do splash inline — não depende de filesystem, sempre carrega.
 * Solução de contorno para o bug de loadFile falhar no Windows empacotado.
 */
const SPLASH_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#12121c;overflow:hidden;user-select:none;-webkit-user-select:none}
.s{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center}
.l{width:80px;height:80px;animation:p 1.8s ease-in-out infinite}
.t{color:#fcce02;font-size:18px;font-weight:700;letter-spacing:.5px}
.m{max-width:240px;color:rgba(242,242,245,.75);font-size:13px;font-weight:400;line-height:1.45}
.sp{width:26px;height:26px;margin-top:4px;border:3px solid rgba(252,206,2,.15);border-top-color:#fcce02;border-radius:50%;animation:r .8s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}
@keyframes p{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.85;transform:scale(.94)}}
</style></head><body><div class="s">
<svg class="l" viewBox="0 0 565 594" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M271.727.581C275.787-.138 278.482-.07 282.537.151 352.167-1.708 422.607 28.654 472.762 76.321 530.072 131.761 562.962 207.727 564.182 287.455 566.367 366.701 537.187 443.609 482.977 501.454 481.307 503.209 479.712 504.844 477.867 506.419L474.597 509.714C425.332 560.774 358.157 590.704 287.247 593.194 280.232 593.374 267.805 593.384 261.13 591.909 251.119 592.239 242.802 590.659 233.358 587.664 228.151 588.374 206.702 581.539 200.955 579.554 150.552 561.849 105.841 530.904 71.511 489.969 19.606 428.569-5.731 349.033 1.093 268.921 7.969 188.771 43.923 115.81 105.809 63.908 143.465 32.138 189.076 11.246 237.727 3.482 247.606 1.84 261.954-.267 271.727.581Z" fill="#1a1a2e"/>
<path d="M233.358 587.664C228.151 588.374 206.702 581.539 200.955 579.554 150.552 561.849 105.841 530.904 71.511 489.969 19.606 428.569-5.731 349.033 1.093 268.921 7.969 188.771 43.923 115.81 105.809 63.908 143.465 32.138 189.076 11.246 237.727 3.482 247.606 1.84 261.954-.267 271.727.581 264.61 2.515 258.623 5.412 252.853 10.088 206.169 47.923 199.228 113.016 215.557 167.5 217.437 173.772 219.369 179.784 221.478 185.991 206.364 195.798 191.303 205.217 177.073 216.33 142.582 243.264 112.532 280.67 103.286 324.266 96.116 358.3 102.879 393.789 122.064 422.799 142.793 454.769 175.421 477.144 212.71 484.964 237.493 490.119 264.001 489.354 287.952 480.769 292.922 503.529 300.432 533.714 287.057 554.519 272.907 576.534 243.413 579.609 223.705 563.409 239.284 568.039 251.574 567.514 260.459 551.144 262.343 547.674 263.458 544.269 263.629 540.264 264.163 499.489 204.224 501.804 197.472 537.269 193.773 556.814 207.637 574.859 224.173 583.449 227.206 585.009 230.246 586.299 233.358 587.664Z" fill="#FCCE02"/>
<path d="M282.537.151C352.167-1.708 422.607 28.654 472.762 76.321 530.072 131.761 562.962 207.727 564.182 287.455 566.367 366.701 537.187 443.609 482.977 501.454 481.307 503.209 479.712 504.844 477.867 506.419 479.542 499.424 479.992 492.974 479.977 485.784 479.962 478.924 479.567 474.114 472.587 471.459 473.977 457.654 473.607 443.999 473.637 430.109 481.102 426.959 480.197 419.169 480.237 412.329 480.267 407.059 479.987 401.749 479.627 396.489 477.797 393.424 476.747 392.514 473.637 390.819 473.522 377.119 473.702 363.435 473.497 349.71 472.722 348.577 471.942 347.343 471.182 346.189 472.122 344.66 471.837 339.6 471.837 337.485 474.702 331.704 473.652 309.485 473.662 301.442 480.532 297.169 479.342 288.942 479.372 281.678 479.402 274.457 480.407 266.868 473.627 262.49 473.452 254.618 475.047 236.434 471.597 230.941 472.202 227.796 472.002 225.058 471.787 221.916 474.642 217.404 473.882 200.98 473.347 195.248 478.747 192.335 477.627 190.006 477.397 184.33 476.812 169.916 477.852 166.126 466.857 155.991 437.657 129.005 405.382 109.047 365.352 103.459 354.842 101.991 344.337 101.918 333.737 101.581 334.312 73.404 330.367 50.647 314.547 26.221 307.712 15.664 295.512 2.680 282.537.151Z" fill="#10438C"/>
<path d="M259.333 230.467L410.002 230.482 449.642 230.424C454.672 230.417 467.167 230.126 471.597 230.941 475.047 236.434 473.452 254.618 473.627 262.49 470.177 261.781 448.147 262.04 443.442 262.037L375.672 262.047C361.927 262.136 360.902 264.279 361.277 277.912L268.426 277.883C265.968 262.404 262.182 246.091 259.333 230.467Z" fill="white"/>
<path d="M313.992 164.136L361.232 164.298C361.342 171.218 360.942 178.15 361.142 185.066 361.287 190.187 363.467 195.034 369.147 195.362 374.412 195.667 379.652 195.539 384.922 195.513L412.007 195.451 450.312 195.498C457.322 195.506 466.492 195.741 473.347 195.248 473.882 200.98 474.642 217.404 471.787 221.916 448.877 222.743 421.972 222.074 398.807 222.077L265.77 222.01C286.202 202.497 299.612 188.427 313.992 164.136Z" fill="white"/>
<path d="M359.627 430.089C376.722 430.559 395.027 430.249 412.192 430.249 432.672 430.349 453.157 430.299 473.637 430.109 473.607 443.999 473.977 457.654 472.587 471.459 472.202 471.444 471.822 471.429 471.437 471.419 437.927 470.649 403.487 471.659 369.912 471.574 360.332 471.549 361.082 479.844 361.237 487.099L315.307 487.129 311.867 472.879C331.592 465.374 348.962 448.114 359.627 430.089Z" fill="white"/>
<path d="M333.737 101.581C344.337 101.918 354.842 101.991 365.352 103.459 405.382 109.047 437.657 129.005 466.857 155.991 417.897 155.336 367.602 155.938 318.502 155.855 328.232 136.298 331.437 122.905 333.737 101.581Z" fill="white"/>
<path d="M449.817 510.909C457.137 510.694 468.057 511.649 474.597 509.714 425.332 560.774 358.157 590.704 287.247 593.194 280.232 593.374 267.805 593.384 261.13 591.909 264.844 591.104 268.94 590.994 272.692 590.279 297.742 585.494 315.242 567.739 320.412 542.929 359.867 542.654 392.227 546.654 428.177 525.499 436.097 520.839 442.647 516.944 449.817 510.909Z" fill="#10438C"/>
<path d="M309.572 286.189L361.272 286.277C361.242 287.121 361.212 287.966 361.187 288.811 360.767 304.83 370.802 301.753 383.252 301.738L408.797 301.713C429.062 301.689 453.742 302.352 473.662 301.442 473.652 309.485 474.702 331.704 471.837 337.485 436.317 338.039 399.282 337.506 363.637 337.514 350.562 311.804 336.262 297.601 309.572 286.189Z" fill="white"/>
<path d="M366.742 345.943L434.117 345.887C443.572 345.875 462.332 345.337 471.182 346.189 471.942 347.343 472.722 348.577 473.497 349.71 473.702 363.435 473.522 377.119 473.637 390.819 463.707 390.179 448.462 390.624 438.177 390.629L372.067 390.664C373.472 373.168 372.212 362.649 366.742 345.943Z" fill="white"/>
<path d="M318.412 495.474L362.252 495.494C361.947 502.774 361.452 510.299 371.027 510.769 379.632 511.189 388.302 510.979 396.922 510.974L450.827 510.944C443.657 516.979 437.107 520.874 429.187 525.534 393.237 546.689 360.877 542.689 321.422 542.964 324.497 525.314 321.507 512.549 318.412 495.474Z" fill="white"/>
<path d="M234.234 245.581C235.025 246.639 242.761 281.345 243.771 285.473 220.418 293.93 200.864 308.433 189.591 330.648 170.454 368.507 185.672 410.394 223.953 428.189 230.283 431.129 258.427 443.039 262.395 434.634 262.729 429.409 258.405 427.159 254.237 425.494 240.9 420.179 228.626 407.714 223.07 394.564 217.912 382.224 217.797 368.357 222.749 355.935 228.603 341.554 239.613 333.26 253.477 327.42 255.652 334.746 257.534 345.227 259.567 353.23 267.362 388.044 275.357 422.814 283.552 457.534 239.855 471.484 191.274 450.219 166.933 412.464 152.876 391.104 147.942 365.01 153.228 339.991 162.647 297.141 199.239 267.985 234.234 245.581Z" fill="#FCCE02"/>
<path d="M278.892 38.891C279.872 39.223 281.692 41.043 282.277 41.862 313.567 85.861 285.912 134.023 249.98 163.871L244.927 168.098C234.464 148.535 236.041 109.546 242.838 88.331 249.554 67.371 259.215 49.735 278.892 38.891Z" fill="#FCCE02"/>
<path d="M277.012 323.881C288.562 324.13 300.417 329.892 309.472 336.816 338.637 359.111 345.102 405.044 321.822 434.159 316.432 440.739 312.127 444.539 305.057 449.084 294.867 408.619 286.032 364.841 277.012 323.881Z" fill="#10438C"/>
</svg>
<div class="t">LouvorJA - PIANO</div>
<div class="m">Estamos configurando e preparando tudo para você.</div>
<div class="sp"></div>
</div></body></html>`;

/**
 * Cria e exibe uma splash window imediatamente no startup.
 * Usa data: URL inline — não depende de filesystem, sempre carrega.
 */
function createSplash() {
	// Windows: janela transparente atrasa o primeiro paint (GPU/DWM) e o
	// usuário vê vários segundos de nada. Fundo opaco aparece na hora.
	const opaqueSplash = process.platform === "win32";
	splashWindow = new BrowserWindow({
		width: 380,
		height: 280,
		frame: false,
		resizable: false,
		center: true,
		show: true,
		transparent: !opaqueSplash,
		backgroundColor: opaqueSplash ? "#12121c" : "#00000000",
		hasShadow: !opaqueSplash,
		skipTaskbar: true,
		menuBarVisible: false,
		autoHideMenuBar: true,
		webPreferences: {
			devTools: isDev,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`);

	splashWindow.on("closed", () => {
		splashWindow = null;
	});
}

function closeSplash() {
	if (splashWindow && !splashWindow.isDestroyed()) {
		splashWindow.close();
		splashWindow = null;
	}
}

function applyWindowIcon(win) {
	if (!win || win.isDestroyed()) return;
	const iconPath = resolveAppIconPath();
	const iconImage = loadAppIconImage();
	if (iconImage) {
		win.setIcon(iconImage);
	} else if (iconPath) {
		win.setIcon(iconPath);
	}
	if (process.platform === "win32" && iconPath) {
		try {
			win.setAppDetails({
				appId: "com.louvorja.piano",
				appIconPath: iconPath,
				appIconIndex: 0,
				relaunchDisplayName: APP_PRODUCT_NAME,
			});
		} catch (error) {
			console.warn("[icon] setAppDetails falhou", error);
		}
	}
}

function isProjectionPopupUrl(url) {
	try {
		const parsed = new URL(url);
		if (parsed.hash.startsWith("#/popup")) return true;
		const path = parsed.pathname.replace(/\/+$/, "");
		return path === "/popup" || path.endsWith("/popup");
	} catch {
		return (
			typeof url === "string" &&
			(url.includes("#/popup") || url.includes("/popup"))
		);
	}
}

/**
 * Feedback Ezequias (02/10): "logar com o google com erro"
 * ("The requested action is invalid" no __/auth/handler).
 * Causa: o popup OAuth do Firebase (signInWithPopup → window.open) caía no
 * `shell.openExternal` e o browser externo perdia o handshake com a janela
 * app (eventid/session) — o handler respondia invalid.
 * Fix: popups de auth (firebaseapp.com / accounts.google.com / google.com
 * OAuth) abrem como BrowserWindow FILHA in-app — mantém o handshake vivo
 * e o credential volta pro renderer via signInWithPopup normalmente.
 */
function isAuthPopupUrl(url) {
	try {
		const parsed = new URL(url);
		const allowed = [
			"firebaseapp.com",
			"firebaseui.com",
			"accounts.google.com",
			"accounts.youtube.com",
			"google.com",
			"gstatic.com",
			"apple.com",
		];
		const host = parsed.hostname.toLowerCase();
		return allowed.some(
			(d) => host === d || host.endsWith(`.${d}`),
		);
	} catch {
		return false;
	}
}

/**
 * Extrai dicas de projeção do features (window.open) e da URL (mais confiável).
 * @param {string} url
 * @param {string} [features]
 */
function parseProjectionLaunchHints(url, features = '') {
  const featureText = typeof features === 'string' ? features : ''
  let fullscreen = featureText.includes('fullscreen=yes')
  let monitorId = null

  const monitorFromFeatures = featureText.match(/(?:^|,)\s*monitor=(\d+)/i)
  if (monitorFromFeatures) {
    monitorId = Number.parseInt(monitorFromFeatures[1], 10)
  }

  try {
    const parsed = new URL(url)
    const queryText = parsed.hash.includes('?')
      ? parsed.hash.slice(parsed.hash.indexOf('?') + 1)
      : parsed.search.startsWith('?')
        ? parsed.search.slice(1)
        : parsed.search
    const params = new URLSearchParams(queryText)
    if (params.get('fs') === '1' || params.get('fullscreen') === '1') {
      fullscreen = true
    }
    const monitorParam = params.get('monitorId') ?? params.get('monitor')
    if (monitorParam != null && monitorParam !== '') {
      const parsedId = Number.parseInt(monitorParam, 10)
      if (Number.isFinite(parsedId)) monitorId = parsedId
    }
  } catch {
    // ignore URL parse errors
  }

  return { fullscreen, monitorId }
}

/**
 * Opções sem chrome do SO (sem barra / minimizar / fechar), alinhado ao legado.
 * @param {string} url
 * @param {string} [features]
 */
function buildPopupWindowOptions(url, features = '') {
  const { fullscreen, monitorId } = parseProjectionLaunchHints(url, features)

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const windowConfig = {
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    // Sempre sem frame nas telas de projeção — evita barra e botões do SO
    frame: false,
    thickFrame: false,
    hasShadow: false,
    fullscreenable: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      devTools: isDev,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  }

  const displays = screen.getAllDisplays()
  const bounds = buildProjectionWindowBounds({
    fullscreen,
    monitorId,
    displays,
    primary: screen.getPrimaryDisplay(),
  })

  // Modo janela sem monitor explícito: posição livre (o WM decide).
  if (!bounds) {
    windowConfig.skipTaskbar = true
    return windowConfig
  }

  windowConfig.x = bounds.x
  windowConfig.y = bounds.y
  windowConfig.width = bounds.width
  windowConfig.height = bounds.height
  windowConfig.resizable = false
  windowConfig.skipTaskbar = true

  return windowConfig
}

/**
 * Aplica fullscreen / bounds sem chrome após criar a janela (legado win32/linux/mac).
 *
 * Linux: NÃO usa setFullScreen — o fullscreen EWMH é decidido pelo window
 * manager, que em vários WMs ignora o monitor da janela e joga no primário
 * (bug "não projeta no segundo monitor"). Usa a mesma estratégia do win32:
 * borderless + setBounds(display.bounds) + alwaysOnTop (fullscreen fake).
 * @param {import('electron').BrowserWindow} childWindow
 * @param {boolean} fullscreen
 */
function applyProjectionDisplayMode(childWindow, fullscreen) {
  if (childWindow.isDestroyed()) return

  if (fullscreen && (process.platform === 'win32' || process.platform === 'linux')) {
    const bounds = childWindow.getBounds()
    const display = screen.getDisplayMatching(bounds)
    childWindow.setFullScreen(false)
    childWindow.setBounds(display.bounds)
    childWindow.setAlwaysOnTop(true, 'screen-saver')
    return
  }

  if (!fullscreen) return

  childWindow.setFullScreen(true)
  if (process.platform === 'darwin') {
    childWindow.setSimpleFullScreen(true)
  }
  childWindow.setAlwaysOnTop(true, 'screen-saver')
}

function attachProjectionWindowHandlers(parentWindow) {
  /** @type {WeakMap<import('electron').BrowserWindow, boolean>} */
  const fullscreenByWindow = new WeakMap()

  // Hotkey global Ctrl+Alt+P: provider das janelas popup (hinos/slides) +
  // operador = janela principal. Init 1x por boot (idempotente).
  initProjectionHotkey({
    globalShortcut,
    getOperatorWindow: () => {
      try {
        if (parentWindow && !parentWindow.isDestroyed()) return parentWindow
      } catch { /* ignore */ }
      return null
    },
  })
  // Janelas popup de projeção marcadas EM MEMÓRIA na criação (fix toggle):
  // identificar por URL (webContents.getURL()) falha — em dev/hashes a URL
  // nem sempre contém #/popup no momento da consulta, e o toggle decidia
  // 'none' com projeção aberta. A marca é a fonte de verdade.
  /** @type {Set<import('electron').BrowserWindow>} */
  const projectionPopups = new Set()

  const popupProvider = () => {
    for (const win of [...projectionPopups]) {
      if (win.isDestroyed()) projectionPopups.delete(win)
    }
    return [...projectionPopups]
  }
  addProjectionWindowProvider(popupProvider)

  // Confirm do operador fecha popups TAMBÉM (senão bíblia/hinos continuavam
  // projetando com o botão da UI ativo). Inversão de dependência: main.mjs
  // registra o "como fechar popups"; ipc/register.mjs chama closeAll.
  registerCloseProjectionPopups(() => {
    for (const win of popupProvider()) {
      try {
        win.close()
      } catch {
        /* ignore */
      }
    }
    // Estado do renderer (isProjecting etc.) precisa saber que acabou
    try {
      if (parentWindow && !parentWindow.isDestroyed()) {
        parentWindow.webContents.send('projection:popups-closed')
      }
    } catch {
      /* ignore */
    }
  })

  parentWindow.webContents.setWindowOpenHandler(({ url, features }) => {
    if (isDev) console.log("[window-open]", url.slice(0, 120));
    if (isProjectionPopupUrl(url)) {
      // Nasce popup de projeção → hotkey disponível
      ensureProjectionHotkey()
      return {
        action: 'allow',
        overrideBrowserWindowOptions: buildPopupWindowOptions(url, features),
      }
    }

    // Feedback Ezequias (02/10): login Google — popup OAuth do Firebase
    // abre IN-APP (BrowserWindow filha) pra manter o handshake com o
    // renderer; abrir no browser externo quebra o auth ("invalid action").
    if (isAuthPopupUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 640,
          autoHideMenuBar: true,
          contextIsolation: true,
          sandbox: true,
        },
      }
    }

    void shell.openExternal(url)
    return { action: 'deny' }
  })

  parentWindow.webContents.on('did-create-window', (childWindow, details) => {
    childWindow.webContents.setAudioMuted(false)
    applyWindowIcon(childWindow)

    const childUrl = details?.url ?? ''
    const isProjection = isProjectionPopupUrl(childUrl)

    // Marca a popup na criação (fonte de verdade do provider da hotkey —
    // independe da URL em runtime, que em dev nem sempre contém #/popup)
    if (isProjection) {
      projectionPopups.add(childWindow)
      ensureProjectionHotkey()
    }

    const { fullscreen } = isProjection
      ? parseProjectionLaunchHints(childUrl, details?.features ?? '')
      : { fullscreen: !childWindow.isResizable() }

    if (isProjection) {
      // Reforça sem chrome mesmo se o Chromium tiver mesclado opções
      childWindow.setMenuBarVisibility(false)
      fullscreenByWindow.set(childWindow, fullscreen)
      // ESC / setas na projeção: encaminha ao operador (a projeção rouba o foco
      // ao abrir — sem isso ←/→ do player de mídia só funcionam após clicar).
      childWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return
        try {
          if (!parentWindow || parentWindow.isDestroyed()) return
          if (input.key === 'Escape') {
            parentWindow.webContents.send('projection:close-requested')
            return
          }
          const childUrl = childWindow.webContents.getURL()
          const isMediaProjection =
            /[?&#]module=media(?:&|$)/.test(childUrl) ||
            childUrl.includes('module=media')
          if (!isMediaProjection) return
          if (input.key === 'ArrowLeft' || input.key === 'Left') {
            event.preventDefault()
            parentWindow.webContents.send('projection:media-navigate', 'previous')
            return
          }
          if (input.key === 'ArrowRight' || input.key === 'Right') {
            event.preventDefault()
            parentWindow.webContents.send('projection:media-navigate', 'next')
          }
        } catch { /* ignore */ }
      })
    }

    childWindow.once('ready-to-show', () => {
      if (childWindow.isDestroyed()) return
      childWindow.webContents.setAudioMuted(false)
      const shouldFullscreen = fullscreenByWindow.get(childWindow) ?? fullscreen
      applyProjectionDisplayMode(childWindow, shouldFullscreen)
      childWindow.show()
      if (isProjection) {
        ensureProjectionHotkey()
        // Hint de atalhos ficou no player do operador (não na projeção).
        // Teclado volta ao operador (player ←/→) sem esconder a projeção.
        if (parentWindow && !parentWindow.isDestroyed()) {
          setTimeout(() => {
            try {
              if (!parentWindow.isDestroyed()) parentWindow.focus()
            } catch { /* ignore */ }
          }, 0)
          setTimeout(() => {
            try {
              if (!parentWindow.isDestroyed()) parentWindow.focus()
            } catch { /* ignore */ }
          }, 250)
        }
      }
    })

    childWindow.on('closed', () => {
      // Sem popup de projeção vivo (e sem projeção externa) → libera a hotkey
      setTimeout(() => {
        try {
          if (popupProvider().length === 0) releaseProjectionHotkey()
        } catch { /* ignore */ }
      }, 50)
    })
  })
}

function createWindow(locale = 'pt-BR') {
	const iconPath = resolveAppIconPath();
	const windowState = loadWindowState();

	mainWindow = new BrowserWindow({
		...(typeof windowState.x === "number" ? { x: windowState.x } : {}),
		...(typeof windowState.y === "number" ? { y: windowState.y } : {}),
		width: windowState.width,
		height: windowState.height,
		minWidth: 1024,
		minHeight: 640,
		backgroundColor: "#12121c",
		title: APP_PRODUCT_NAME,
		show: false,
		frame: false,
		autoHideMenuBar: true,
		...(iconPath ? { icon: iconPath } : {}),
		webPreferences: {
			preload: PRELOAD_PATH,
			devTools: isDev,
			contextIsolation: true,
			nodeIntegration: false,
			// false: garante preload/IPC no AppImage empacotado (first-boot / splash)
			sandbox: false,
			spellcheck: false,
		},
	});

	applyWindowIcon(mainWindow);
	attachWindowStateEvents(mainWindow);
	trackWindowState(mainWindow, { isMaximized: windowState.isMaximized });

	mainWindow.on("page-title-updated", (event) => {
		event.preventDefault();
	});

	mainWindow.once("ready-to-show", () => {
		applyWindowIcon(mainWindow);
		if (windowState.isMaximized && mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.maximize();
		}
		mainWindow?.show();
		// Fecha o splash assim que a janela principal estiver visível
		closeSplash();
		// Reaplica após show — alguns WMs só pegam o ícone com a janela visível
		applyWindowIcon(mainWindow);
		if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
			mainWindow?.webContents.openDevTools({ mode: "detach" });
		}
	});

	attachProjectionWindowHandlers(mainWindow);

	if (isDev && VITE_DEV_SERVER_URL) {
		const localeParam = `?lang=${locale}`;
		void mainWindow.loadURL(VITE_DEV_SERVER_URL + localeParam);
	} else {
		const rendererBase = globalThis.__rendererBaseUrl;
			if (rendererBase) {
				void mainWindow.loadURL(rendererUrl(rendererBase, locale));
			} else {
				void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query: { lang: locale } });
			}
	}

	// Timeout de segurança: se ready-to-show não disparar em 15s, mostra erro
	const loadTimeout = setTimeout(() => {
		if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
			console.error("[main] timeout: janela principal não carregou em 15s");
			closeSplash();
			dialog.showMessageBoxSync(mainWindow, {
				type: "error",
				title: "Erro ao iniciar",
				message: "O aplicativo demorou muito para iniciar.\n\nIsso pode indicar um problema de carregamento.\nCódigo do erro: TIMEOUT_15S",
				buttons: ["OK"],
			});
			mainWindow.destroy();
			mainWindow = null;
		}
	}, 15_000);

	mainWindow.once("ready-to-show", () => {
		clearTimeout(loadTimeout);
		if (isDev) {
			const origin = globalThis.__rendererBaseUrl ?? (isDev ? VITE_DEV_SERVER_URL : "file://");
			console.log("[main] renderer carregado via origem:", origin);
		}
	});

	// Fallback: se a janela principal falhar ao carregar, mostra erro e fecha o splash
	let abortedRetries = 0;
	mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		console.error(`[main] falha ao carregar: code=${errorCode} desc=${errorDescription}`);
		// -3 (ABORTED) é transitório — Vite recompilando durante o load.
		// Máximo 3 retries com backoff: loadURL novo aborta o anterior e cada
		// aborto dispara did-fail-load de novo — sem teto, vira loop infinito
		// de tela preta (relato 12/09).
		if (isMainFrame && errorCode === -3 && abortedRetries < 3) {
			abortedRetries += 1;
			const delay = 800 * abortedRetries;
			setTimeout(() => {
				if (mainWindow && !mainWindow.isDestroyed()) {
					console.error(`[main] retry ${abortedRetries}/3 do load após ABORTED`);
					if (isDev && VITE_DEV_SERVER_URL) {
						void mainWindow.loadURL(`${VITE_DEV_SERVER_URL}/?lang=${locale}`);
					} else {
						const rendererBase = globalThis.__rendererBaseUrl;
			if (rendererBase) {
				void mainWindow.loadURL(rendererUrl(rendererBase, locale));
			} else {
				void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query: { lang: locale } });
			}
					}
				}
			}, delay);
			return;
		}
		closeSplash();
		if (!mainWindow || mainWindow.isDestroyed()) return;
		dialog.showMessageBoxSync(mainWindow, {
			type: "error",
			title: "Erro ao iniciar",
			message: `Não foi possível carregar o aplicativo.\n\nCódigo: ${errorCode}\n${errorDescription || ""}`.trim(),
			buttons: ["OK"],
		});
		mainWindow.destroy();
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(async () => {
  // Origem http válida p/ Firebase Auth (popup Google) — ver renderer-server.mjs.
  // file:// (loadFile) nunca estará nos authorizedDomains → popup abre e fecha na hora.
  if (!isDev) {
    try {
      const renderer = await startRendererServer(
        path.join(__dirname, "../dist"),
      );
      globalThis.__rendererBaseUrl = renderer.url;
      renderer.server.on("close", () => console.log("[renderer-server] fechado"));
    } catch (err) {
      console.error("[renderer-server] indisponível — cai no loadFile:", err.message);
      globalThis.__rendererBaseUrl = null;
    }
  }

	bootMark("whenReady");
	// Primeira coisa visível — checagens e servidores vêm depois.
	createSplash();
	bootMark("splash");

	let locale = "pt-BR";
	try {
		ensureLinuxTaskbarIntegration();
		ensureWorkspaceDirectories();
		bootMark("workspace");

		locale = resolveAppLocale(app.getLocale());

		if (!(await checkEulaAcceptance(locale))) {
			closeSplash();
			app.quit();
			return;
		}
		bootMark("eula");

		registerWorkspaceIpc();
		registerDiagnosticsIpc(); // diagnostics:* — SrCaldeira, rede no main
		registerWindowIpc(() => mainWindow);
		registerLocalFileProtocol();
		registerYoutubeEmbedHeaders();
		registerYoutubeAuthIpc();
		// adblock YouTube (opt-in): estado persistido em workspace record
		registerAdblockerIpc(
			(enabled) => writeWorkspaceRecord("yt-adblock.json", { enabled }),
			() => {
				const rec = readWorkspaceRecord("yt-adblock.json");
				return rec?.enabled === true;
			},
		);
		registerTunnelCorpBypass();
		createWindow(locale);
		bootMark("mainWindow");

		attachRemoteServer(() => mainWindow?.webContents ?? null);
		attachPalcoServer(() => mainWindow?.webContents ?? null);
	} catch (error) {
		console.error("[main] falha no startup", error);
		closeSplash();
		const message =
			error instanceof Error ? error.message : String(error ?? "erro desconhecido");
		dialog.showErrorBox(
			"Erro ao iniciar",
			`Não foi possível iniciar o aplicativo.\n\n${message}`,
		);
		app.quit();
		return;
	}

	// Auto-update: check 3s após janela criada (não bloqueia startup)
	initUpdater(() => mainWindow);
	setTimeout(() => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("updater:check-start");
		}
	}, 3000);
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow(locale);
		}
	});
});

app.on("second-instance", () => {
	if (!mainWindow) return;
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.focus();
});

app.on("will-quit", () => {
	// Hotkey global de projeção: libera Ctrl+Alt+P no encerrar (se registrada)
	try {
		const { globalShortcut } = require("electron");
		globalShortcut.unregisterAll();
	} catch {
		/* ignore */
	}
	// Palco: app fechando → TVs param a mídia na hora (não toca até o fim).
	try {
		const { getPalcoManager } = require("./palco-server.mjs");
		const manager = getPalcoManager && getPalcoManager();
		if (manager) manager.stopAllMedia();
	} catch {
		/* palco não anexado */
	}
});

app.on("window-all-closed", () => {
	// window-all-closed pode disparar quando o splash fecha mas a main
	// ainda está carregando. Só saímos se mainWindow já existiu ou se
	// não há intenção de criar janela (eula recusado, erro fatal, etc).
	if (process.platform !== "darwin") {
		app.quit();
	}
});
