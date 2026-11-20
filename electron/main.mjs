import path from "node:path";
import { spawn } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, net, screen, shell } from "electron";

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
import { registerDesktopFonts } from "./fonts/register.mjs";
import { registerWorkspaceIpc } from "./ipc/register.mjs";
import { registerDownloadBatchIpc } from "./ipc/download-batch-ipc.mjs";
import { registerDiagnosticsIpc, setClockSkewProvider, setDiagnosticsToken } from "./diagnostics.mjs";
import { createMainLogger } from "./main-log.mjs";
import { attachHistoryAppCommand, attachWindowStateEvents, mainWindowChromeOptions, registerWindowIpc } from "./ipc/window.mjs";
import { registerScreenContextIpc } from "./ipc/screen-context.mjs";
import { attachRemoteServer } from "./remote-server.mjs";
import { attachMonitorShare } from "./monitor-share.mjs";
import { attachPalcoServer, getPalcoManager } from "./palco-server.mjs";
import { ensureWorkspaceDirectories } from "./paths.mjs";
import { registerLocalFileProtocol, registerLocalScheme, setOnlineVideoSource } from "./protocol.mjs";
import { registerCloseProjectionPopups, setIndependentLayerHooks, setOnlineVideoPlayer } from "./ipc/web-projection.mjs";
import { OnlineVideoService, registerOnlineVideoIpc } from "./online-video/ipc.mjs";
import { readWorkspaceRecord, writeWorkspaceRecord } from "./workspace.mjs";
import { buildProjectionWindowBounds } from "./projection-display.mjs";
import { createIndependentProjectionRegistry, isIndependentProjectionUrl } from "./independent-projection.mjs";
import { createSharedProjectionLayout, isSharedProjectionUrl } from "./shared-projection.mjs";
import { X11_RELAUNCH_MARKER, buildX11Relaunch, consumeX11RelaunchMarker, shouldRelaunchWithX11 } from "./linux-display-backend.mjs";
import { initUpdater } from "./updater.mjs";
import { getBibleUpdater } from "./bible-updater.mjs";
import { loadWindowState, trackWindowState } from "./window-state.mjs";
import { registerYoutubeEmbedHeaders } from "./youtube-embed.mjs";
import { registerYoutubeAuthIpc } from "./youtube-auth.mjs";
import { registerYoutubeInfoIpc } from "./youtube-info.mjs";
import { pianoLogoSvg } from "./piano-logo.mjs";
import { setYoutubeVideoSource } from "./app-backup.mjs";
import { registerYoutubeSearchIpc } from "./youtube-search.mjs";
import { registerSiteInfoIpc } from "./site-info.mjs";
import { enableAdblocker } from "./youtube-adblock.mjs";
import { registerTunnelCorpBypass } from "./tunnel-corp-bypass.mjs";
import {
  initProjectionHotkey,
  addProjectionWindowProvider,
  removeProjectionWindowProvider,
  ensureProjectionHotkey,
  releaseProjectionHotkey,
  collectAliveProjectionWindows,
} from "./projection-hotkey.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(VITE_DEV_SERVER_URL);
const PRELOAD_PATH = path.join(__dirname, "preload.mjs");
const bootT0 = Date.now();
const mainLog = createMainLogger(() => app.getPath('userData'));

function bootMark(label) {
	console.log(`[boot +${Date.now() - bootT0}ms] ${label}`);
	mainLog.info(`boot ${label}`);
}

registerLocalScheme();

// Rede de segurança: exceção não tratada no main (ex.: porta EACCES/EADDRINUSE
// de servidores WS — bug real do José 30/08 no Windows) NÃO PODE derrubar o
// app sem explicação. Loga, mostra diálogo amigável e segue.
process.on("uncaughtException", (error) => {
  console.error("[main] uncaughtException:", error);
  mainLog.error(`uncaughtException ${error instanceof Error ? error.stack ?? error.message : String(error ?? '')}`);
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

process.on('unhandledRejection', (reason) => {
  mainLog.error(`unhandledRejection ${reason instanceof Error ? reason.stack ?? reason.message : String(reason ?? '')}`);
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

/**
 * Linux + Wayland: relança via XWayland para a projeção abrir no monitor
 * escolhido (no Wayland nativo o compositor ignora a posição das janelas).
 * Detalhes em linux-display-backend.mjs.
 */
let relaunchingForX11 = false;
const wantsX11Relaunch = shouldRelaunchWithX11({ platform: process.platform, env: process.env, argv: process.argv });
consumeX11RelaunchMarker(process.env);
if (wantsX11Relaunch) {
	relaunchingForX11 = true;
	console.info("[main] wayland: relançando via XWayland (--ozone-platform=x11)");
	process.env[X11_RELAUNCH_MARKER] = "1";
	const relaunch = buildX11Relaunch({ argv: process.argv, env: process.env, execPath: process.execPath });
	spawn(relaunch.command, relaunch.args, { detached: true, stdio: "ignore", env: process.env }).unref();
	app.exit(0);
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

/** Software rendering is an explicit compatibility fallback. Disabling the
 * GPU on every dev launch makes video decoding + projection capture compete
 * on the CPU and causes stalls as soon as a mirror is opened. */
if (process.env.LOUVORJA_DISABLE_GPU === "1") {
  app.commandLine.appendSwitch("disable-gpu");
}

/** Permite autoplay com áudio nas janelas de projeção (YouTube). */
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

/** CDP p/ debug automatizado (apenas dev). */
if (process.env.VITE_DEV_SERVER_URL) {
	// 9222 colide com Chrome do sistema; env PIANO_CDP_PORT permite override.
	app.commandLine.appendSwitch("remote-debugging-port", process.env.PIANO_CDP_PORT ?? "9222");
}

// O processo que vai se relançar não pega o lock: senão o relançado
// encontraria o lock ocupado e fecharia.
const gotLock = relaunchingForX11 || app.requestSingleInstanceLock();
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
${pianoLogoSvg("l")}
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

function isWarmProjectionUrl(url) {
	return typeof url === "string" && /(?:\?|&)warm=1(?:&|$)/.test(url);
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
 * Popup OAuth filho da janela principal. A partir do Electron 45, um filho com
 * sandbox diferente do opener nasce sem opener: window.open retorna null e o
 * signInWithPopup do Firebase falha com auth/popup-blocked.
 * @returns {import('electron').BrowserWindowConstructorOptions}
 */
function buildAuthPopupWindowOptions() {
	return {
		width: 500,
		height: 640,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	};
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
      // Janela aquecida fica oculta: sem isso o Chromium congela o renderer.
      backgroundThrottling: !isWarmProjectionUrl(url),
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
  /** Janelas de mídia já com o Vue montado, escondidas até o play. */
  /** @type {{ win: import('electron').BrowserWindow, layout: 'audience' | 'return' }[]} */
  let warmPool = []
  /** @type {WeakSet<import('electron').BrowserWindow>} */
  const standbyWindows = new WeakSet()
  /** @type {WeakSet<import('electron').BrowserWindow>} */
  const standbyReady = new WeakSet()
  /** Projeções independentes: fora do fechar-tudo e sempre acima das demais. */
  const independentPopups = createIndependentProjectionRegistry()
  // Qualquer janela nova (popups, vídeo/pdf/site da web-projection) que
  // aparecer ou mudar de nível devolve as independentes ao topo.
  /** Projeção compartilhada: divide o monitor com o que já está projetado nele. */
  const sharedLayout = createSharedProjectionLayout({
    getProjectionWindows: collectAliveProjectionWindows,
    getDisplays: () => screen.getAllDisplays(),
  })
  app.on('browser-window-created', (_event, win) => {
    if (win === parentWindow) return
    independentPopups.watch(win)
    sharedLayout.watch(win)
  })
  // Players do Piano (vídeo/imagens/texto/PDF/site): projeção independente usa as mesmas camadas.
  setIndependentLayerHooks({
    add: (win) => {
      independentPopups.add(win)
      win.once('show', () => independentPopups.raiseSoon())
    },
    addShared: (win, displayId) => {
      sharedLayout.addShared(win, displayId)
      win.once('show', () => sharedLayout.relayoutSoon())
    },
  })
  screen.on('display-removed', () => sharedLayout.relayoutSoon())
  screen.on('display-metrics-changed', () => sharedLayout.relayoutSoon())

  const focusOperator = () => {
    if (!parentWindow || parentWindow.isDestroyed()) return
    setTimeout(() => {
      try {
        if (!parentWindow.isDestroyed()) parentWindow.focus()
      } catch { /* ignore */ }
    }, 0)
  }

  ipcMain.removeHandler("projection:reveal-warm")
  ipcMain.handle("projection:reveal-warm", (_event, payload) => {
    const shows = Array.isArray(payload?.shows)
      ? payload.shows
      : payload?.monitorId != null
        ? [payload]
        : []
    if (shows.length === 0) return false

    const available = warmPool.filter(
      (item) => !item.win.isDestroyed() && standbyReady.has(item.win),
    )
    /** @type {{ item: (typeof available)[number], show: { monitorId?: unknown, fullscreen?: unknown, layout?: unknown } }[]} */
    const assigned = []
    const taken = new Set()
    for (const show of shows) {
      const layout = show?.layout === "return" ? "return" : "audience"
      const index = available.findIndex(
        (item, itemIndex) => !taken.has(itemIndex) && item.layout === layout,
      )
      if (index < 0) return false
      taken.add(index)
      assigned.push({ item: available[index], show })
    }

    try {
      for (const { item, show } of assigned) {
        const monitorId = Number(show?.monitorId)
        const fullscreen = show?.fullscreen !== false
        const bounds = buildProjectionWindowBounds({
          fullscreen,
          monitorId: Number.isFinite(monitorId) ? monitorId : null,
          displays: screen.getAllDisplays(),
          primary: screen.getPrimaryDisplay(),
        })
        standbyWindows.delete(item.win)
        warmPool = warmPool.filter((entry) => entry.win !== item.win)
        if (bounds) item.win.setBounds(bounds)
        applyProjectionDisplayMode(item.win, fullscreen)
      }
      for (const { item } of assigned) {
        item.win.showInactive()
        projectionPopups.add(item.win)
      }
      ensureProjectionHotkey()
      focusOperator()
    } catch {
      return false
    }
    return true
  })

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
      // Trocar/fechar a projeção principal não derruba a independente.
      if (independentPopups.has(win)) continue
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
        overrideBrowserWindowOptions: buildAuthPopupWindowOptions(),
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
    const warm = isWarmProjectionUrl(childUrl)
    const independent = isProjection && isIndependentProjectionUrl(childUrl)
    if (independent) independentPopups.add(childWindow)
    if (independent && isSharedProjectionUrl(childUrl)) {
      const { monitorId } = parseProjectionLaunchHints(childUrl, details?.features ?? '')
      if (monitorId != null) sharedLayout.addShared(childWindow, monitorId)
    }

    // Marca a popup na criação (fonte de verdade do provider da hotkey —
    // independe da URL em runtime, que em dev nem sempre contém #/popup).
    // A janela aquecida fica de fora até ser revelada no play.
    if (isProjection && !warm) {
      projectionPopups.add(childWindow)
      ensureProjectionHotkey()
      // Fundo preto na hora: a splash de boot não pode pintar na tela do público.
      try { childWindow.setBackgroundColor('#000000') } catch { /* ignore */ }
    }
    if (warm) {
      const layout = /(?:\?|&)layout=return(?:&|$)/.test(childUrl) ? "return" : "audience"
      warmPool.push({ win: childWindow, layout })
      standbyWindows.add(childWindow)
      try { childWindow.setBackgroundColor('#000000') } catch { /* ignore */ }
      childWindow.on('closed', () => {
        warmPool = warmPool.filter((entry) => entry.win !== childWindow)
      })
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
            // ESC na independente encerra só ela; a principal segue.
            if (independent) {
              childWindow.close()
              return
            }
            parentWindow.webContents.send('projection:close-requested')
            return
          }
          // Esc + Enter: o operador só encerra se o confirm estiver aberto.
          if (input.key === 'Enter' && !independent) {
            parentWindow.webContents.send('projection:confirm-close-requested')
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
      if (standbyWindows.has(childWindow)) {
        standbyReady.add(childWindow)
        return
      }
      const shouldFullscreen = fullscreenByWindow.get(childWindow) ?? fullscreen
      applyProjectionDisplayMode(childWindow, shouldFullscreen)
      if (independent) independentPopups.raiseOne(childWindow)
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

/** @type {OnlineVideoService | null} */
let onlineVideo = null;

/** Cópia local dos vídeos do YouTube: IPC, protocolo `local://yt-*` e projeção. */
function startOnlineVideo(getLocale) {
	onlineVideo = new OnlineVideoService({
		userDataDir: app.getPath("userData"),
		readRecord: readWorkspaceRecord,
		writeRecord: writeWorkspaceRecord,
		getLocale,
		windowsStore: process.windowsStore === true,
		broadcast: (channel, payload) => {
			for (const win of BrowserWindow.getAllWindows()) {
				if (!win.isDestroyed()) win.webContents.send(channel, payload);
			}
		},
		log: (message) => mainLog.info(`online-video ${message}`),
		openPath: (dir) => shell.openPath(dir),
		chooseDirectory: async () => {
			const parent = BrowserWindow.getFocusedWindow() ?? undefined;
			const result = await dialog.showOpenDialog(parent, {
				title: "Pasta para os vídeos do YouTube",
				properties: ["openDirectory", "createDirectory"],
			});
			return result.canceled ? null : (result.filePaths[0] ?? null);
		},
	});
	const service = onlineVideo;
	registerOnlineVideoIpc(ipcMain, service);
	setOnlineVideoSource({
		serve: (id, kind, range, signal) => service.serve(id, kind, range, signal),
		cacheFile: (name) => service.cacheFile(name),
	});
	setOnlineVideoPlayer(service);
	// Backup: vídeos baixados entram só se o operador escolher; na restauração voltam para a pasta do sistema.
	setYoutubeVideoSource({
		folders: () => (typeof service.cache.folders === "function" ? service.cache.folders() : null),
		restoreDir: () => service.cache.system?.dir ?? path.join(app.getPath("userData"), "video-cache"),
		reload: () => service.cache.load(),
	});
	void service.init().catch((error) => mainLog.error(`online-video init ${error?.message ?? error}`));
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
		...mainWindowChromeOptions(process.platform),
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
	mainLog.info('main window created');
	attachWindowStateEvents(mainWindow);
	attachHistoryAppCommand(mainWindow);
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

	// Timeout de segurança: se ready-to-show não disparar, mostra erro.
	// Dev: 90s (cold-optimize do Vite pode levar minutos neste disco);
	// release mantém 15s (build pronto, sem depender de dev server).
	const bootTimeoutMs = isDev ? 90_000 : 15_000;
	const loadTimeout = setTimeout(() => {
		if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
			console.error(`[main] timeout: janela principal não carregou em ${bootTimeoutMs / 1000}s`);
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
	}, bootTimeoutMs);

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
		if (!isQuitting) app.quit();
	});
}

let isQuitting = false;

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
	// telemetria de erros (Glitchtip) — não-bloqueante, silenciosa sem DSN
	import("./telemetry.mjs")
		.then((t) => t.startTelemetry())
		.catch(() => {});
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
		await registerDesktopFonts();
		// Token de diagnóstico: LOUVORJA_DIAGNOSTICS_TOKEN (variável do MAIN, não
		// VITE_* — config de build do renderer não existe no processo principal).
		setDiagnosticsToken(process.env.LOUVORJA_DIAGNOSTICS_TOKEN ?? "");
		registerDiagnosticsIpc(); // diagnostics:* — SrCaldeira, rede no main
		// diag-v4-umbrella: skew do relógio via mtime de marker em userData (best-effort)
		setClockSkewProvider(() => {
			try {
				const dir = app.getPath("userData");
				const marker = path.join(dir, "diag-clock-marker");
				const before = Date.now();
				writeFileSync(marker, String(before));
				const mtime = statSync(marker).mtimeMs;
				const after = Date.now();
				return Math.round(mtime - (before + after) / 2);
			} catch {
				return null;
			}
		});
		mainLog.info('diagnostics IPC handlers registered');
		registerWindowIpc(() => mainWindow);
		registerScreenContextIpc(() => mainWindow);
		registerDownloadBatchIpc(() => mainWindow);
		registerLocalFileProtocol();
		startOnlineVideo(() => locale);
		registerYoutubeEmbedHeaders();
		registerYoutubeAuthIpc();
		registerYoutubeInfoIpc(ipcMain, { fetch: (url, init) => net.fetch(url, init) });
		registerYoutubeSearchIpc(ipcMain, { fetch: (url, init) => net.fetch(url, init) });
		registerSiteInfoIpc(ipcMain, { fetch: (url, init) => net.fetch(url, init) });
		void enableAdblocker();
		registerTunnelCorpBypass();
		createWindow(locale);
		bootMark("mainWindow");

		attachRemoteServer(() => mainWindow?.webContents ?? null, {
			palcoHttpPort: () => getPalcoManager()?.getPrincipal()?.httpPort,
		});
		attachPalcoServer(() => mainWindow?.webContents ?? null);
		// Compartilhar monitores com o app mobile (porta 48090).
		attachMonitorShare(() => mainWindow?.webContents ?? null);
	} catch (error) {
		console.error("[main] falha no startup", error);
		mainLog.error(`startup failure ${error instanceof Error ? error.stack ?? error.message : String(error ?? '')}`);
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
	// Bíblia offline: confere bundles novos na API (1x/dia, em segundo plano)
	setTimeout(() => {
		getBibleUpdater()
			.check()
			.catch((error) => console.warn("[bible-updater] falha", error));
	}, 20_000);
	app.on("activate", () => {
		if (!isQuitting && BrowserWindow.getAllWindows().length === 0) {
			createWindow(locale);
		}
	});
});

app.on("second-instance", () => {
	if (!mainWindow) return;
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.focus();
});

// Stop receivers before Electron starts closing the player windows.
app.on("before-quit", () => {
  isQuitting = true;
  try {
    getPalcoManager()?.stopAllMedia();
  } catch (error) {
    console.warn('[shutdown] failed to stop receivers', error);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  onlineVideo?.dispose();
  void onlineVideo?.manager.cancelAll().catch(() => {});
});

app.on("window-all-closed", () => {
	// Fechar a splash pode disparar este evento durante o handoff para a
	// main window. Não mata o processo se a principal ainda existe/carrega.
	if (mainWindow && !mainWindow.isDestroyed()) return;
	if (!isQuitting) app.quit();
});
