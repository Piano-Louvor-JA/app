import { BrowserWindow, screen, session, WebContentsView } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { convertPresentationToPdf } from './presentation-convert.mjs'
import { readWorkspaceRecord, writeWorkspaceRecord } from '../workspace.mjs'
import { getPalcoManager } from '../palco-server.mjs'
import { addProjectionWindowProvider, ensureProjectionHotkey, releaseProjectionHotkey } from '../projection-hotkey.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD_PATH = path.join(__dirname, '../preload.mjs')
const MIRROR_HTML = path.join(__dirname, '../player/mirror-player.html')
const CONTROL_BAR_HTML = path.join(__dirname, '../player/control-bar.html')
const LOCAL_VIDEO_PLAYER_HTML = path.join(
  __dirname,
  '../player/local-video-player.html',
)
const LOCAL_IMAGE_PLAYER_HTML = path.join(
  __dirname,
  '../player/local-image-player.html',
)
const LOCAL_PDF_PLAYER_HTML = path.join(
  __dirname,
  '../player/local-pdf-player.html',
)
const LOCAL_PPTX_PLAYER_HTML = path.join(
  __dirname,
  '../player/local-pptx-player.html',
)
const IMAGE_CONTROL_BAR_HTML = path.join(
  __dirname,
  '../player/image-control-bar.html',
)
const PDF_CONTROL_BAR_HTML = path.join(
  __dirname,
  '../player/pdf-control-bar.html',
)
const PPT_CONTROL_BAR_HTML = path.join(
  __dirname,
  '../player/ppt-control-bar.html',
)
const SITE_CONTROL_BAR_HTML = path.join(__dirname, '../player/site-control-bar.html')
const SITE_INTERACTION_BLOCKER_HTML = path.join(
  __dirname,
  '../player/site-interaction-blocker.html',
)

const SOURCE_WINDOW_TITLE = 'Player — LouvorJA - PIANO'
const SITE_WINDOW_TITLE = 'Site — LouvorJA - PIANO'

/** Tamanho fixo do popup de controle de vídeo (16:9). */
const CONTROL_WIDTH = 960
const CONTROL_HEIGHT = 540
/** Barra do operador de vídeo (WebContentsView — fora da captura das projeções). */
const CONTROL_BAR_HEIGHT = 48

/** Popup de site: tamanho inicial confortável, sem limite máximo. */
const SITE_DEFAULT_WIDTH = 1280
const SITE_DEFAULT_HEIGHT = 820
const SITE_CONTROL_BAR_HEIGHT = 44
/** Altura da WebContentsView quando o painel de monitores está aberto. */
const SITE_CONTROL_PANEL_HEIGHT = 300
const SITE_MIN_WIDTH = 480
const SITE_MIN_HEIGHT = 360

/**
 * Compacta o YouTube e remove a chrome nativa do player na captura.
 * Controles do operador ficam no WebContentsView (não entram no espelho).
 */
const HIDE_YOUTUBE_SIDEBAR_SCRIPT = `
(() => {
  const css = \`
    /* Lateral / recomendações */
    #secondary,
    #secondary-inner,
    #related,
    ytd-watch-next-secondary-results-renderer,
    #chat,
    #chat-container,
    #panels-container,
    #donation-shelf,
    ytd-live-chat-frame,
    /* Topo (busca / login) */
    #masthead-container,
    ytd-masthead,
    #guide,
    #guide-wrapper,
    tp-yt-app-drawer,
    /* Conteúdo abaixo do player */
    #below,
    #meta,
    #info,
    #info-contents,
    #owner,
    #middle-row,
    #bottom-row,
    #comments,
    #comment-teaser,
    ytd-watch-metadata,
    ytd-video-primary-info-renderer,
    ytd-video-secondary-info-renderer {
      display: none !important;
      height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    html, body, ytd-app, #content, #page-manager, ytd-watch-flexy {
      margin: 0 !important;
      padding: 0 !important;
      background: #000 !important;
      overflow: hidden !important;
      max-width: 100vw !important;
      width: 100vw !important;
      height: 100vh !important;
    }

    ytd-watch-flexy[flexy] #columns,
    ytd-watch-flexy #columns,
    #columns {
      display: block !important;
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    #primary,
    #primary-inner,
    ytd-watch-flexy[flexy] #primary {
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    /* Player ocupa a janela toda (modo “fullscreen” visual no popup fixo) */
    #player,
    #player-container-outer,
    #player-container-inner,
    #movie_player,
    ytd-player,
    #player-theater-container,
    ytd-watch-flexy[theater] #player-theater-container {
      position: fixed !important;
      inset: 0 !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      width: 100vw !important;
      height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      z-index: 2147483646 !important;
    }

    .html5-video-container,
    .html5-video-container video,
    video.html5-main-video {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
    }

    /* Chrome nativa do player — não aparece nas projeções (captura do webContents) */
    .ytp-chrome-top,
    .ytp-chrome-bottom,
    .ytp-gradient-top,
    .ytp-gradient-bottom,
    .ytp-progress-bar-container,
    .ytp-progress-bar,
    .ytp-chrome-controls,
    .ytp-popup,
    .ytp-tooltip,
    .ytp-cards-teaser,
    .ytp-ce-element,
    .ytp-pause-overlay,
    .ytp-scroll-min,
    .ytp-endscreen-content,
    .ytp-endscreen-paginate,
    .ytp-suggested-action,
    .ytp-title,
    .ytp-title-channel,
    .ytp-watermark,
    .ytp-large-play-button,
    .ytp-cued-thumbnail-overlay,
    .ytp-spinner,
    .annotation,
    .iv-branding,
    .ytp-show-cards-title {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  \`;

  let style = document.getElementById('louvorja-hide-yt-sidebar');
  if (!style) {
    style = document.createElement('style');
    style.id = 'louvorja-hide-yt-sidebar';
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = css;

  const apply = () => {
    const hideIds = ['#secondary', '#related', '#masthead-container', '#below', '#comments'];
    hideIds.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.style.setProperty('display', 'none', 'important');
    });

    // Ativa modo cinema (theater) — player largo, sem layout de coluna
    const flexy = document.querySelector('ytd-watch-flexy');
    if (flexy && !flexy.hasAttribute('theater')) {
      const theaterBtn =
        document.querySelector('button.ytp-size-button') ||
        document.querySelector('.ytp-size-button');
      if (theaterBtn) theaterBtn.click();
      else {
        flexy.setAttribute('theater', '');
        flexy.setAttribute('theater-requested_', '');
      }
    }
  };

  apply();

  if (!window.__louvorjaYtSidebarObserver) {
    window.__louvorjaYtSidebarObserver = new MutationObserver(apply);
    window.__louvorjaYtSidebarObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setInterval(apply, 1500);
  }

  return true;
})()
`

/** @type {BrowserWindow | null} */
let sourceWindow = null
/** @type {WebContentsView | null} */
let controlBarView = null
/** @type {'video' | 'site' | 'image' | 'pdf' | 'presentation'} */
let currentProjectionMode = 'video'
/** @type {BrowserWindow[]} */
let mirrorWindows = []
/** @type {BrowserWindow[]} */
let siteShieldWindows = []
/** @type {WeakMap<BrowserWindow, import('electron').WebContentsView>} */
const siteBlockerViews = new WeakMap()
/** @type {number[]} */
let lastSiteMonitorIds = []
/** @type {number[]} */
let lastVideoMonitorIds = []
/** Painel de seleção de monitores aberto na barra do controle de site. */
let siteControlPanelOpen = false
/** @type {ReturnType<typeof setInterval> | null} */
let siteSyncInterval = null
let siteSyncScrollX = -1
let siteSyncScrollY = -1
let siteSourceReloadPending = false
let siteSyncBound = false

/**
 * Hotkey global Ctrl+Alt+P (spec 30/08, monitor único): registro ÚNICO no
 * singleton projection-hotkey.mjs. Este fluxo (video/pdf/ppt/site) registra
 * um provider com suas janelas; o fluxo de hinos/slides (main.mjs,
 * window.open) registra o dele. Vida da hotkey: nasce com a 1ª projeção de
 * qualquer fluxo, morre quando não sobra nenhuma.
 */
function hasAnyExternalProjectionWindow() {
  if (sourceWindow && !sourceWindow.isDestroyed()) return true
  for (const win of mirrorWindows) {
    if (win && !win.isDestroyed()) return true
  }
  for (const shield of siteShieldWindows) {
    if (shield && !shield.isDestroyed()) return true
  }
  return false
}

function syncExternalHotkeyState() {
  if (hasAnyExternalProjectionWindow()) ensureProjectionHotkey()
  else releaseProjectionHotkey()
}

let externalProviderAttached = false
function attachExternalHotkeyProvider() {
  if (externalProviderAttached) return
  externalProviderAttached = true
  addProjectionWindowProvider(() => [
    ...(sourceWindow && !sourceWindow.isDestroyed() ? [sourceWindow] : []),
    ...mirrorWindows.filter((win) => win && !win.isDestroyed()),
    ...siteShieldWindows.filter((win) => win && !win.isDestroyed()),
  ])
}

/** Registra o provider + hotkey quando nasce janela deste fluxo. */
function enableProjectionHotkey() {
  attachExternalHotkeyProvider()
  ensureProjectionHotkey()
}

/** Reavalia após fechar janelas deste fluxo (libera se não sobrou nada). */
function disableProjectionHotkey() {
  syncExternalHotkeyState()
}


const SITE_READ_SCROLL_SCRIPT = `
(() => {
  const el = document.scrollingElement || document.documentElement;
  return {
    x: Math.round(window.scrollX || el.scrollLeft || 0),
    y: Math.round(window.scrollY || el.scrollTop || 0),
  };
})()
`

function siteApplyScrollScript(x, y) {
  return `
(() => {
  window.scrollTo(${x}, ${y});
  return true;
})()
`
}

function attachSiteSourceWindowHandlers(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      void win.webContents.loadURL(url)
    }
    return { action: 'deny' }
  })
}

function onSiteSourceNavigate(url) {
  if (!url || url === 'about:blank') return

  for (const win of mirrorWindows) {
    if (win.isDestroyed()) continue
    if (win.webContents.getURL() !== url) {
      void win.webContents.loadURL(url)
    }
  }

  siteSyncScrollX = -1
  siteSyncScrollY = -1
}

function reloadSiteProjectionWindows() {
  for (const win of mirrorWindows) {
    if (!win.isDestroyed()) {
      win.webContents.reload()
    }
  }
  siteSyncScrollX = -1
  siteSyncScrollY = -1
}

async function syncSiteProjectionScroll() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'site') {
    return
  }
  if (mirrorWindows.length === 0) return

  const sourceUrl = sourceWindow.webContents.getURL()
  if (!sourceUrl || sourceUrl === 'about:blank') return

  let scroll
  try {
    scroll = await sourceWindow.webContents.executeJavaScript(
      SITE_READ_SCROLL_SCRIPT,
      true,
    )
  } catch {
    return
  }

  const x = Math.round(scroll?.x ?? 0)
  const y = Math.round(scroll?.y ?? 0)
  if (x === siteSyncScrollX && y === siteSyncScrollY) return
  siteSyncScrollX = x
  siteSyncScrollY = y

  for (const win of mirrorWindows) {
    if (win.isDestroyed()) continue
    if (win.webContents.getURL() !== sourceUrl) continue
    try {
      await win.webContents.executeJavaScript(siteApplyScrollScript(x, y), true)
    } catch {
      // página ainda carregando na projeção
    }
  }
}

function bindSiteSourceNavigation() {
  if (!sourceWindow || sourceWindow.isDestroyed() || siteSyncBound) return

  const contents = sourceWindow.webContents
  siteSyncBound = true

  contents.on('did-navigate', (_event, url) => {
    if (siteSourceReloadPending) return
    onSiteSourceNavigate(url)
  })

  contents.on('did-navigate-in-page', (_event, url) => {
    onSiteSourceNavigate(url)
    void syncSiteProjectionScroll()
  })

  contents.on('did-finish-load', () => {
    if (siteSourceReloadPending) {
      siteSourceReloadPending = false
      reloadSiteProjectionWindows()
    }
    siteSyncScrollX = -1
    siteSyncScrollY = -1
    void syncSiteProjectionScroll()
  })
}

function startSiteProjectionSync() {
  stopSiteProjectionSync()
  bindSiteSourceNavigation()
  siteSyncInterval = setInterval(() => {
    void syncSiteProjectionScroll()
  }, 120)
}

function stopSiteProjectionSync() {
  if (siteSyncInterval) {
    clearInterval(siteSyncInterval)
    siteSyncInterval = null
  }
  siteSyncBound = false
  siteSyncScrollX = -1
  siteSyncScrollY = -1
  siteSourceReloadPending = false
}
function toLocalAppUrl(filePath) {
  if (typeof filePath !== 'string') return null
  const trimmed = filePath.trim()
  if (!trimmed) return null

  // Windows: C:\foo → /C:/foo ; POSIX já começa com /
  const normalized = trimmed.replace(/\\/g, '/')
  const withLeadingSlash = normalized.startsWith('/')
    ? normalized
    : `/${normalized}`
  const encoded = withLeadingSlash
    .split('/')
    .map((part, index) =>
      index === 0 && part === '' ? '' : encodeURIComponent(part),
    )
    .join('/')
  return `local://app${encoded}`
}

const AUDIO_FILE_EXT = /\.(mp3|m4a|aac|wav|ogg|flac|wma|opus)$/i

function resolveLocalVideoPlayerUrl(filePath, title = '') {
  const mediaUrl = toLocalAppUrl(filePath)
  const playerPage = toLocalAppUrl(LOCAL_VIDEO_PLAYER_HTML)
  if (!mediaUrl || !playerPage) return null
  const playerUrl = new URL(playerPage)
  playerUrl.searchParams.set('src', mediaUrl)
  if (title) playerUrl.searchParams.set('title', title)
  if (AUDIO_FILE_EXT.test(filePath)) playerUrl.searchParams.set('audio', '1')
  return playerUrl.toString()
}

function resolveLocalImagePlayerUrl(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return null
  const sources = filePaths
    .map((entry) => toLocalAppUrl(String(entry)))
    .filter(Boolean)
  if (sources.length === 0) return null
  const playerUrl = new URL(pathToFileURL(LOCAL_IMAGE_PLAYER_HTML).href)
  playerUrl.searchParams.set('srcs', JSON.stringify(sources))
  return playerUrl.toString()
}

function resolveLocalPdfPlayerUrl(filePath) {
  const mediaUrl = toLocalAppUrl(filePath)
  if (!mediaUrl) return null
  const playerUrl = new URL(pathToFileURL(LOCAL_PDF_PLAYER_HTML).href)
  playerUrl.searchParams.set('src', mediaUrl)
  return playerUrl.toString()
}

function resolveLocalPptPlayerUrl(filePath) {
  const mediaUrl = toLocalAppUrl(filePath)
  if (!mediaUrl) return null
  const playerUrl = new URL(pathToFileURL(LOCAL_PPTX_PLAYER_HTML).href)
  playerUrl.searchParams.set('src', mediaUrl)
  return playerUrl.toString()
}

function resolveSourceUrl(payload) {
  const mode = typeof payload?.mode === 'string' ? payload.mode : ''

  const filePaths = Array.isArray(payload?.filePaths)
    ? payload.filePaths.map((entry) => String(entry).trim()).filter(Boolean)
    : []
  if (mode === 'image' || filePaths.length > 0) {
    return resolveLocalImagePlayerUrl(filePaths)
  }

  const filePath =
    typeof payload?.filePath === 'string' ? payload.filePath.trim() : ''
  const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
  if (filePath) {
    if (mode === 'pdf') {
      return resolveLocalPdfPlayerUrl(filePath)
    }
    if (mode === 'presentation') {
      return resolveLocalPptPlayerUrl(filePath)
    }
    return resolveLocalVideoPlayerUrl(filePath, title)
  }

  const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
  const videoId = typeof payload?.videoId === 'string' ? payload.videoId.trim() : ''

  if (videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
  }

  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'local:') {
      if (parsed.host !== 'app') return null
      let absolute = decodeURIComponent(parsed.pathname)
      if (process.platform === 'win32' && absolute.match(/^\/[a-zA-Z]:\//)) {
        absolute = absolute.slice(1)
      }
      return resolveLocalVideoPlayerUrl(absolute, title)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function isPdfDocumentMode(mode = currentProjectionMode) {
  return mode === 'pdf' || mode === 'presentation'
}

function isCaptureProjectionMode(mode = currentProjectionMode) {
  return (
    mode === 'video' ||
    mode === 'image' ||
    mode === 'pdf' ||
    mode === 'presentation'
  )
}

function placeSourceOnPrimary() {
  const primary = screen.getPrimaryDisplay()
  const work = primary.workArea
  const width = CONTROL_WIDTH
  const height = CONTROL_HEIGHT
  const x = work.x + Math.round((work.width - width) / 2)
  const y = work.y + Math.round((work.height - height) / 2)
  return { x, y, width, height }
}

function placeSiteOnPrimary() {
  const primary = screen.getPrimaryDisplay()
  const work = primary.workArea
  const width = Math.min(SITE_DEFAULT_WIDTH, Math.max(SITE_MIN_WIDTH, work.width - 64))
  const height = Math.min(SITE_DEFAULT_HEIGHT, Math.max(SITE_MIN_HEIGHT, work.height - 64))
  const x = work.x + Math.round((work.width - width) / 2)
  const y = work.y + Math.round((work.height - height) / 2)
  return { x, y, width, height }
}

function hideYoutubeSidebar(win) {
  if (!win || win.isDestroyed()) return
  void win.webContents
    .executeJavaScript(HIDE_YOUTUBE_SIDEBAR_SCRIPT, true)
    .catch(() => {
      // página ainda carregando
    })
}

function detachControlBar() {
  if (!controlBarView) return
  const view = controlBarView
  controlBarView = null
  try {
    if (sourceWindow && !sourceWindow.isDestroyed()) {
      sourceWindow.contentView.removeChildView(view)
    }
  } catch {
    // janela já fechada
  }
  try {
    if (!view.webContents.isDestroyed()) {
      view.webContents.close()
    }
  } catch {
    // ignore
  }
}

/**
 * Controles do operador fora do webContents capturado — não aparecem nas projeções.
 * @param {import('electron').BrowserWindow} win
 */
function attachControlBar(win) {
  detachControlBar()
  siteControlPanelOpen = false

  const view = new WebContentsView({
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })
  view.setBackgroundColor('#00000000')

  win.contentView.addChildView(view)
  const [contentWidth, contentHeight] = win.getContentSize()
  view.setBounds({
    x: 0,
    y: Math.max(0, contentHeight - CONTROL_BAR_HEIGHT),
    width: contentWidth,
    height: CONTROL_BAR_HEIGHT,
  })
  void view.webContents.loadURL(
    pathToFileURL(
      currentProjectionMode === 'image'
        ? IMAGE_CONTROL_BAR_HTML
        : currentProjectionMode === 'pdf' ||
            currentProjectionMode === 'presentation'
          ? PDF_CONTROL_BAR_HTML
          : CONTROL_BAR_HTML,
    ).href,
  )
  controlBarView = view
}

/**
 * Barra de navegação do site (fora da captura do espelho).
 * @param {import('electron').BrowserWindow} win
 */
function attachSiteControlBar(win) {
  detachControlBar()
  siteControlPanelOpen = false

  const view = new WebContentsView({
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })
  // A área expandida serve apenas para o popover: o restante deve revelar o
  // site abaixo, como o Teleport do seletor original da liturgia.
  view.setBackgroundColor('#00000000')

  win.contentView.addChildView(view)
  const [contentWidth, contentHeight] = win.getContentSize()
  view.setBounds({
    x: 0,
    y: Math.max(0, contentHeight - SITE_CONTROL_BAR_HEIGHT),
    width: contentWidth,
    height: SITE_CONTROL_BAR_HEIGHT,
  })
  void view.webContents.loadURL(pathToFileURL(SITE_CONTROL_BAR_HTML).href)
  controlBarView = view
}

function layoutControlBar(win) {
  if (!controlBarView || !win || win.isDestroyed()) return
  const [contentWidth, contentHeight] = win.getContentSize()
  const collapsedHeight =
    currentProjectionMode === 'site' ? SITE_CONTROL_BAR_HEIGHT : CONTROL_BAR_HEIGHT
  const barHeight = siteControlPanelOpen
    ? Math.min(SITE_CONTROL_PANEL_HEIGHT, contentHeight)
    : collapsedHeight
  controlBarView.setBounds({
    x: 0,
    y: Math.max(0, contentHeight - barHeight),
    width: contentWidth,
    height: barHeight,
  })
}

function createSourceWindow(loadUrl, title) {
  const bounds = placeSourceOnPrimary()

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    ...bounds,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    frame: true,
    title: title || SOURCE_WINDOW_TITLE,
    minimizable: true,
    maximizable: false,
    resizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  }

  const win = new BrowserWindow(options)
  win.setTitle(title || SOURCE_WINDOW_TITLE)
  // O <title> do player HTML sobrescreve o título no load — trava no nome do
  // item (ex: 'Casamento — apresentação') em vez de 'PDF — LouvorJA'.
  win.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    win.setTitle(title || SOURCE_WINDOW_TITLE)
  })
  win.setMinimumSize(CONTROL_WIDTH, CONTROL_HEIGHT)
  win.setMaximumSize(CONTROL_WIDTH, CONTROL_HEIGHT)
  win.setResizable(false)
  win.setMaximizable(false)
  win.webContents.setAudioMuted(false)
  win.setAlwaysOnTop(true, 'floating')

  win.once('ready-to-show', () => {
    win.webContents.setAudioMuted(false)
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: CONTROL_WIDTH,
      height: CONTROL_HEIGHT,
    })
    attachControlBar(win)
    layoutControlBar(win)
    win.show()
    win.focus()
  })

  // Impede redimensionar / maximizar por atalho ou SO
  win.on('will-resize', (event) => {
    event.preventDefault()
  })
  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.unmaximize()
      win.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: CONTROL_WIDTH,
        height: CONTROL_HEIGHT,
      })
      layoutControlBar(win)
    }
  })

  const onPageReady = () => {
    win.webContents.setAudioMuted(false)
    hideYoutubeSidebar(win)
    // YouTube é SPA: reaplica após hidratação
    setTimeout(() => hideYoutubeSidebar(win), 800)
    setTimeout(() => hideYoutubeSidebar(win), 2000)
  }

  win.webContents.on('did-finish-load', onPageReady)
  win.webContents.on('did-navigate-in-page', onPageReady)
  win.webContents.on('dom-ready', () => hideYoutubeSidebar(win))

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'Escape') {
      closeWebProjectionWindows()
      return
    }
    if (!isPdfDocumentMode()) return
    const next =
      input.key === 'ArrowRight' ||
      input.key === 'Right' ||
      input.key === 'ArrowDown' ||
      input.key === 'Down'
    const prev =
      input.key === 'ArrowLeft' ||
      input.key === 'Left' ||
      input.key === 'ArrowUp' ||
      input.key === 'Up'
    if (!next && !prev) return
    event.preventDefault()
    void (async () => {
      if (next) await remotePptNext()
      else await remotePptPrev()
      // Atualiza TVs/Palco via a barra (mesmo fluxo dos botões).
      if (controlBarView && !controlBarView.webContents.isDestroyed()) {
        try {
          await controlBarView.webContents.executeJavaScript(
            'window.__pdfBarAfterPageChange ? window.__pdfBarAfterPageChange() : null',
            true,
          )
        } catch {
          /* ignore */
        }
      }
    })()
  })

  win.on('closed', () => {
    detachControlBar(); stopPalcoMediaOnClose()
    if (sourceWindow === win) {
      sourceWindow = null
      closeMirrorWindowsOnly()
    }
  })

  void win.loadURL(loadUrl)
  return win
}

function createSiteSourceWindow(loadUrl, title) {
  const bounds = placeSiteOnPrimary()

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    ...bounds,
    backgroundColor: '#101218',
    autoHideMenuBar: true,
    show: false,
    frame: true,
    title: title || SITE_WINDOW_TITLE,
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  }

  const win = new BrowserWindow(options)
  win.setTitle(title || SITE_WINDOW_TITLE)
  win.setMinimumSize(SITE_MIN_WIDTH, SITE_MIN_HEIGHT)
  win.webContents.setAudioMuted(false)
  win.setAlwaysOnTop(true, 'floating')

  win.once('ready-to-show', () => {
    win.webContents.setAudioMuted(false)
    attachSiteControlBar(win)
    layoutControlBar(win)
    win.show()
    win.focus()
  })

  win.on('resize', () => {
    layoutControlBar(win)
  })

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      closeWebProjectionWindows()
    }
  })

  win.on('closed', () => {
    detachControlBar(); stopPalcoMediaOnClose()
    if (sourceWindow === win) {
      sourceWindow = null
      closeMirrorWindowsOnly()
    }
  })

  attachSiteSourceWindowHandlers(win)
  void win.loadURL(loadUrl)
  return win
}

/**
 * Escudo transparente que absorve mouse/teclado sobre a projeção do site.
 * Mais confiável que setIgnoreMouseEvents no Linux/Wayland.
 * @param {import('electron').Display} display
 */
function createSiteShieldWindow(display) {
  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    frame: false,
    thickFrame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    fullscreenable: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  }

  const shield = new BrowserWindow(options)
  shield.setFocusable(false)
  // Absorve eventos (NÃO ignora) — cliques morrem aqui
  shield.setIgnoreMouseEvents(false)

  shield.once('ready-to-show', () => {
    shield.setBounds(display.bounds)
    shield.setFullScreen(true)
    if (process.platform === 'darwin') {
      shield.setSimpleFullScreen(true)
    }
    shield.setAlwaysOnTop(true, 'screen-saver')
    shield.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    shield.showInactive()
  })

  shield.webContents.on('before-input-event', (event) => {
    event.preventDefault()
  })

  shield.on('focus', () => {
    if (!shield.isDestroyed()) {
      shield.blur()
      if (sourceWindow && !sourceWindow.isDestroyed()) {
        sourceWindow.focus()
      }
    }
  })

  shield.on('closed', () => {
    siteShieldWindows = siteShieldWindows.filter((item) => item !== shield)
  })

  void shield.loadURL(pathToFileURL(SITE_INTERACTION_BLOCKER_HTML).href)
  return shield
}

/**
 * Site em tela cheia real na tela estendida (URL direta, sem captura/espelho).
 * Interação bloqueada por escudo transparente + camada interna.
 * @param {import('electron').Display} display
 * @param {string} loadUrl
 */
function createSiteProjectionWindow(display, loadUrl) {
  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    show: false,
    frame: false,
    thickFrame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    fullscreenable: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  }

  const win = new BrowserWindow(options)
  win.webContents.setAudioMuted(true)
  win.setFocusable(false)

  const layoutBlocker = () => {
    const view = siteBlockerViews.get(win)
    if (!view || win.isDestroyed()) return
    const [contentWidth, contentHeight] = win.getContentSize()
    view.setBounds({
      x: 0,
      y: 0,
      width: contentWidth,
      height: contentHeight,
    })
  }

  const attachBlocker = () => {
    if (win.isDestroyed()) return

    let view = siteBlockerViews.get(win)
    if (!view) {
      view = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          spellcheck: false,
          backgroundThrottling: false,
        },
      })

      try {
        view.setBackgroundColor('#00000000')
      } catch {
        // Electron antigo sem setBackgroundColor
      }

      siteBlockerViews.set(win, view)
      void view.webContents.loadURL(pathToFileURL(SITE_INTERACTION_BLOCKER_HTML).href)
    }

    // Reempilha sempre no topo (navegação pode reordenar as views)
    try {
      win.contentView.removeChildView(view)
    } catch {
      // ainda não estava anexada
    }
    win.contentView.addChildView(view)
    layoutBlocker()
  }

  /** Reforço no DOM: página não recebe pointer events. */
  const hardenPage = () => {
    if (win.isDestroyed()) return
    void win.webContents
      .executeJavaScript(
        `(() => {
          const css = 'html,body,*{pointer-events:none!important;user-select:none!important;cursor:none!important;}';
          let style = document.getElementById('louvorja-site-no-input');
          if (!style) {
            style = document.createElement('style');
            style.id = 'louvorja-site-no-input';
            (document.head || document.documentElement).appendChild(style);
          }
          style.textContent = css;
          const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false; };
          ['click','mousedown','mouseup','mousemove','wheel','touchstart','touchmove','pointerdown','contextmenu','keydown'].forEach((t) => {
            window.addEventListener(t, stop, true);
            document.addEventListener(t, stop, true);
          });
          return true;
        })()`,
        true,
      )
      .catch(() => {})
  }

  win.once('ready-to-show', () => {
    win.setBounds(display.bounds)
    win.setFullScreen(true)
    if (process.platform === 'darwin') {
      win.setSimpleFullScreen(true)
    }
    win.setAlwaysOnTop(true, 'screen-saver')
    attachBlocker()
    layoutBlocker()
    win.showInactive()
  })

  win.on('resize', layoutBlocker)

  win.webContents.on('did-finish-load', () => {
    hardenPage()
    attachBlocker()
    layoutBlocker()
  })
  win.webContents.on('did-navigate-in-page', hardenPage)
  win.webContents.on('dom-ready', hardenPage)

  win.webContents.on('before-input-event', (event) => {
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.on('focus', () => {
    if (!win.isDestroyed()) {
      win.blur()
      if (sourceWindow && !sourceWindow.isDestroyed()) {
        sourceWindow.focus()
      }
    }
  })

  win.on('closed', () => {
    const view = siteBlockerViews.get(win)
    if (view) {
      try {
        if (!view.webContents.isDestroyed()) view.webContents.close()
      } catch {
        // ignore
      }
      siteBlockerViews.delete(win)
    }
    mirrorWindows = mirrorWindows.filter((item) => item !== win)
  })

  void win.loadURL(loadUrl)
  return win
}

/**
 * Espelho fullscreen idêntico ao popup (captura ao vivo).
 * @param {import('electron').Display} display
 */
function createMirrorWindow(display) {
  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    frame: false,
    thickFrame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    fullscreenable: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  }

  const win = new BrowserWindow(options)
  // Som só no popup de controle
  win.webContents.setAudioMuted(true)

  win.once('ready-to-show', () => {
    // Fullscreen real só nas telas estendidas
    win.setBounds(display.bounds)
    win.setFullScreen(true)
    if (process.platform === 'darwin') {
      win.setSimpleFullScreen(true)
    }
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true, 'screen-saver')
    } else {
      win.setAlwaysOnTop(true, 'screen-saver')
    }
    win.showInactive()
  })

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      closeWebProjectionWindows()
    }
  })

  win.on('closed', () => {
    mirrorWindows = mirrorWindows.filter((item) => item !== win)
    stopPalcoMediaOnClose()
  })

  const mirrorUrl = `${pathToFileURL(MIRROR_HTML).href}?mode=video`
  void win.loadURL(mirrorUrl)
  return win
}

/**
 * Projeção de imagens: carrega a mesma galeria nas telas (sem captura).
 * Captura de tela falha com conteúdo estático — o slide às vezes não atualiza.
 * @param {import('electron').Display} display
 * @param {string} loadUrl
 */
function createImageProjectionWindow(display, loadUrl) {
  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const options = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    frame: false,
    thickFrame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    fullscreenable: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  }

  const win = new BrowserWindow(options)
  win.webContents.setAudioMuted(true)

  win.once('ready-to-show', () => {
    win.setBounds(display.bounds)
    win.setFullScreen(true)
    if (process.platform === 'darwin') {
      win.setSimpleFullScreen(true)
    }
    win.setAlwaysOnTop(true, 'screen-saver')
    win.showInactive()
  })

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      closeWebProjectionWindows()
    }
  })

  win.webContents.on('did-finish-load', () => {
    if (isPdfDocumentMode()) {
      void applyPdfIndexToWindow(win)
    } else if (currentProjectionMode === 'image') {
      void applyImageIndexToWindow(win)
    }
  })

  win.on('closed', () => {
    mirrorWindows = mirrorWindows.filter((item) => item !== win)
    stopPalcoMediaOnClose()
  })

  void win.loadURL(loadUrl)
  return win
}

/**
 * Lê o índice atual da galeria no popup e aplica em uma janela de projeção.
 * @param {import('electron').BrowserWindow} win
 */
async function applyImageIndexToWindow(win) {
  if (
    !sourceWindow ||
    sourceWindow.isDestroyed() ||
    win.isDestroyed() ||
    currentProjectionMode !== 'image'
  ) {
    return
  }

  let index = 0
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyGallery ? window.__liturgyGallery.getState() : null))()`,
      true,
    )
    if (state && typeof state === 'object') {
      index = Number(state.index) || 0
    }
  } catch {
    return
  }

  await goToImageIndexOnWindow(win, index)
}

/**
 * @param {import('electron').BrowserWindow} win
 * @param {number} index
 */
async function goToImageIndexOnWindow(win, index) {
  if (win.isDestroyed()) return false
  const safeIndex = Number(index) || 0
  const script = `(() => {
    const gallery = window.__liturgyGallery;
    if (!gallery || typeof gallery.goTo !== 'function') return null;
    return gallery.goTo(${JSON.stringify(safeIndex)});
  })()`

  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const result = await win.webContents.executeJavaScript(script, true)
      if (result && typeof result === 'object') return true
    } catch {
      // ainda carregando
    }
    await sleep(40)
  }
  return false
}

/**
 * Sincroniza todas as telas de projeção com o índice da galeria no popup.
 * @param {number} index
 */
async function syncImageMirrorsToIndex(index) {
  if (currentProjectionMode !== 'image' || mirrorWindows.length === 0) return
  await Promise.all(
    mirrorWindows.map((win) => goToImageIndexOnWindow(win, index)),
  )
}

/**
 * Lê a página atual do PDF no popup e aplica em uma janela de projeção.
 * @param {import('electron').BrowserWindow} win
 */
async function applyPdfIndexToWindow(win) {
  if (
    !sourceWindow ||
    sourceWindow.isDestroyed() ||
    win.isDestroyed() ||
    !isPdfDocumentMode()
  ) {
    return
  }

  let index = 0
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyPdf ? window.__liturgyPdf.getState() : null))()`,
      true,
    )
    if (state && typeof state === 'object') {
      index = Number(state.index) || 0
    }
  } catch {
    return
  }

  await goToPdfIndexOnWindow(win, index)
}

/**
 * @param {import('electron').BrowserWindow} win
 * @param {number} index
 */
async function goToPdfIndexOnWindow(win, index) {
  if (win.isDestroyed()) return false
  const safeIndex = Number(index) || 0
  const script = `(() => {
    const pdf = window.__liturgyPdf;
    if (!pdf || typeof pdf.goTo !== 'function') return null;
    return pdf.goTo(${JSON.stringify(safeIndex)});
  })()`

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await win.webContents.executeJavaScript(script, true)
      if (result && typeof result === 'object') return true
    } catch {
      // ainda carregando
    }
    await sleep(50)
  }
  return false
}

/**
 * Sincroniza todas as telas de projeção com a página do PDF no popup.
 * @param {number} index
 */
async function syncPdfMirrorsToIndex(index) {
  if (!isPdfDocumentMode() || mirrorWindows.length === 0) return
  await Promise.all(
    mirrorWindows.map((win) => goToPdfIndexOnWindow(win, index)),
  )
}

function closeMirrorWindowsOnly() {
  for (const shield of [...siteShieldWindows]) {
    if (!shield.isDestroyed()) shield.close()
  }
  siteShieldWindows = []

  for (const win of [...mirrorWindows]) {
    if (!win.isDestroyed()) win.close()
  }
  mirrorWindows = []
  stopSiteProjectionSync()
}

/** X da janela de projeção = mesma limpeza do Escape (fix 27/08):
 * o handler 'closed' só fazia detachControlBar — nenhum audio/video stop
 * saía pras TVs e o MP3 ficava tocando após fechar o popup pelo X. */
function stopPalcoMediaOnClose() {
  try {
    const manager = getPalcoManager()
    if (manager) {
      manager.broadcastAll({ v: 2, type: 'video', action: 'stop' })
      manager.broadcastAll({ v: 2, type: 'audio', action: 'stop' })
    }
  } catch {
    /* palco não anexado */
  }
}

/** Há projeção externa (video/pdf/ppt/site) com janela viva? (bridge consulta)
 * Cobre TODAS as famílias: janela fonte + espelhos + shields — fecha só a
 * fonte não significa que a projeção acabou (caso 28/08). */
export function isExternalProjectionAlive() {
  try {
    if (sourceWindow && !sourceWindow.isDestroyed()) return true
    for (const win of mirrorWindows) {
      if (win && !win.isDestroyed()) return true
    }
    for (const shield of siteShieldWindows) {
      if (shield && !shield.isDestroyed()) return true
    }
  } catch { /* ignore */ }
  return false
}

export function closeWebProjectionWindows() {
  closeMirrorWindowsOnly()
  detachControlBar()
  const win = sourceWindow
  sourceWindow = null
  currentProjectionMode = 'video'
  lastSiteMonitorIds = []
  lastVideoMonitorIds = []
  siteControlPanelOpen = false
  // Palco (TVs): projeção fechou (ended OU manual) → todas as TVs voltam
  // ao idle. Sem isso o último frame ficava congelado na TV.
  // Import estático: require() de .mjs lança ERR_REQUIRE_ESM no Electron
  // ESM e o catch silencioso engolia o stop — TVs ficavam com mídia presa.
  stopPalcoMediaOnClose()
  // Hotkey Ctrl+Alt+P: projeção acabou → libera o atalho global
  disableProjectionHotkey()
  if (win && !win.isDestroyed()) {
    win.close()
  }
}

/**
 * Fecha TODAS as projeções dos DOIS fluxos: web-projection (vídeo/pdf/ppt/site)
 * E popups de hinos/bíblia/slides (window.open no main.mjs). Usado pelo
 * confirm do operador — antes só o primeiro fluxo era fechado e a popup
 * de bíblia/hinos continuava projetando com o botão da UI ativo.
 * Chama o callback de fechamento de popups registrado pelo main.mjs
 * (inversão de dependência — evita import circular main↔ipc).
 * @type {(() => void) | null}
 */
let closeProjectionPopupsImpl = null

export function registerCloseProjectionPopups(impl) {
  closeProjectionPopupsImpl = impl
}

export function closeAllProjectionWindows() {
  try {
    closeProjectionPopupsImpl?.()
  } catch {
    /* ignore */
  }
  closeWebProjectionWindows()
}

function broadcastSiteTargetsChanged(ids) {
  const payload = Array.isArray(ids) ? [...ids] : []
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send('projection:site-targets-changed', payload)
    } catch {
      /* ignore */
    }
  }
  if (controlBarView && !controlBarView.webContents.isDestroyed()) {
    try {
      controlBarView.webContents.send('projection:site-targets-changed', payload)
    } catch {
      /* ignore */
    }
  }
}

function broadcastVideoTargetsChanged(ids) {
  const payload = Array.isArray(ids) ? [...ids] : []
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send('projection:video-targets-changed', payload)
    } catch {
      /* ignore */
    }
  }
  if (controlBarView && !controlBarView.webContents.isDestroyed()) {
    try {
      controlBarView.webContents.send('projection:video-targets-changed', payload)
    } catch {
      /* ignore */
    }
  }
}

/** @returns {number[]} */
export function getSiteTargetMonitorIds() {
  return [...lastSiteMonitorIds]
}

function normalizeMonitorIds(ids, primaryId) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id !== primaryId)
}

/**
 * Atualiza monitores-alvo do site e reaplica nas telas se já estiver projetando.
 * @param {unknown} ids
 * @returns {boolean}
 */
export function setSiteTargetMonitorIds(ids) {
  const primaryId = screen.getPrimaryDisplay().id
  lastSiteMonitorIds = normalizeMonitorIds(ids, primaryId)

  broadcastSiteTargetsChanged(lastSiteMonitorIds)

  if (
    isSiteProjectingToScreens() &&
    sourceWindow &&
    !sourceWindow.isDestroyed()
  ) {
    const loadUrl = sourceWindow.webContents.getURL()
    if (loadUrl && loadUrl !== 'about:blank') {
      openSiteScreensOnTargets(loadUrl, resolveExtendedTargets(lastSiteMonitorIds))
    }
  }

  return true
}

/** @returns {number[]} */
export function getVideoTargetMonitorIds() {
  return [...lastVideoMonitorIds]
}

/**
 * Atualiza monitores-alvo do vídeo e reaplica se já estiver projetando.
 * @param {unknown} ids
 * @returns {boolean}
 */
export function setVideoTargetMonitorIds(ids) {
  const primaryId = screen.getPrimaryDisplay().id
  lastVideoMonitorIds = normalizeMonitorIds(ids, primaryId)

  broadcastVideoTargetsChanged(lastVideoMonitorIds)

  if (isVideoProjectingToScreens()) {
    openVideoScreensOnTargets(resolveExtendedTargets(lastVideoMonitorIds))
  }

  return true
}

/**
 * Expande a barra do controle de site para caber o painel de monitores.
 * @param {unknown} open
 * @returns {boolean}
 */
export function setSiteControlPanelOpen(open) {
  siteControlPanelOpen = Boolean(open)
  if (sourceWindow && !sourceWindow.isDestroyed()) {
    layoutControlBar(sourceWindow)
  }
  return true
}

/**
 * Popup de controle + espelho idêntico nas telas estendidas.
 * Play/pause no popup aparecem automaticamente nos espelhos (captura).
 *
 * @param {{
 *   url: string
 *   title?: string
 *   videoId?: string
 *   monitorIds?: number[]
 *   mode?: 'video' | 'site'
 *   withScreens?: boolean
 * }} payload
 */
function resolveExtendedTargets(monitorIds) {
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id
  const ids = Array.isArray(monitorIds)
    ? monitorIds.filter((id) => typeof id === 'number' && Number.isFinite(id))
    : []

  /** @type {import('electron').Display[]} */
  const targets = []
  for (const id of ids) {
    const display = displays.find((item) => item.id === id && item.id !== primaryId)
    if (display) targets.push(display)
  }
  return targets
}

function openSiteScreensOnTargets(loadUrl, targets) {
  closeMirrorWindowsOnly()
  for (const display of targets) {
    mirrorWindows.push(createSiteProjectionWindow(display, loadUrl))
    siteShieldWindows.push(createSiteShieldWindow(display))
  }
  if (targets.length > 0) {
    startSiteProjectionSync()
  }
  return targets.length > 0
}

let currentSourceFilePath = ''
let currentSourceTitle = ''

export async function openWebProjectionWindows(payload) {
  const input = payload ?? {}
  let effective = input

  currentSourceFilePath =
    typeof effective.filePath === 'string' ? effective.filePath.trim() : ''
  currentSourceTitle =
    typeof effective.title === 'string' ? effective.title.trim() : ''

  if (input.mode === 'presentation') {
      const filePath =
        typeof input.filePath === 'string' ? input.filePath.trim() : ''
      if (!filePath) return false

      // Engine: payload do item (escolha no dialog da liturgia) sobrepõe o
      // setting global. PowerPoint exporta PNGs pixel-perfect (LibreOffice
      // quebra formatação); PNGs alimentam o player de imagens (multi-tela).
      let preference = 'auto'
      if (
        input.presentationEngine === 'powerpoint' ||
        input.presentationEngine === 'libreoffice'
      ) {
        preference = input.presentationEngine
      } else {
        try {
          const rec = readWorkspaceRecord('ppt-engine')
          if (rec?.engine === 'powerpoint' || rec?.engine === 'libreoffice') {
            preference = rec.engine
          }
        } catch { /* default auto */ }
      }

      try {
        const { resolvePresentationEngine, exportPptxToPngs } = await import(
          './presentation-powerpoint.mjs'
        )
        let usedEngine = 'libreoffice'
        try {
          const { engine } = resolvePresentationEngine(preference)
          usedEngine = engine
        } catch (engineError) {
          // powerpoint pedida mas não instalada → fallback com aviso no log
          console.error('[projection] engine pedido indisponível:', engineError.message)
        }

        if (usedEngine === 'powerpoint') {
          try {
            const pngs = await exportPptxToPngs(filePath)
            effective = {
              ...input,
              mode: 'image',
              filePaths: pngs,
              __presentationEngine: 'powerpoint',
            }
          } catch (exportError) {
            console.error('[projection] export PowerPoint falhou, cai p/ LibreOffice:', exportError.message)
            usedEngine = 'libreoffice'
          }
        }

        if (usedEngine === 'libreoffice') {
          const pdfPath = await convertPresentationToPdf(filePath)
          effective = {
            ...input,
            filePath: pdfPath,
            // Player PDF; título/controles mantêm modo presentation.
            __presentationPdf: true,
          }
        }
      } catch (error) {
        console.error('[projection] presentation convert', error)
        return false
      }
  }

  const loadUrl =
    effective.mode === 'presentation' && effective.filePath
      ? resolveLocalPdfPlayerUrl(String(effective.filePath))
      : resolveSourceUrl(effective)
  if (!loadUrl) return false

  const mode =
    effective.mode === 'site'
      ? 'site'
      : effective.mode === 'pdf'
        ? 'pdf'
        : effective.mode === 'presentation'
          ? 'presentation'
          : effective.mode === 'image' ||
              (Array.isArray(effective.filePaths) &&
                effective.filePaths.length > 0)
            ? 'image'
            : 'video'
  const withScreens = effective.withScreens !== false
  const monitorIds = Array.isArray(effective.monitorIds)
    ? effective.monitorIds.filter(
        (id) => typeof id === 'number' && Number.isFinite(id),
      )
    : []

  // Site com controle já aberto: só projeta nas telas, sem recriar o popup.
  if (
    mode === 'site' &&
    withScreens &&
    sourceWindow &&
    !sourceWindow.isDestroyed() &&
    currentProjectionMode === 'site'
  ) {
    lastSiteMonitorIds = monitorIds
    if (isSiteProjectingToScreens()) return true
    const currentUrl = sourceWindow.webContents.getURL()
    const projectUrl =
      currentUrl && currentUrl !== 'about:blank' ? currentUrl : loadUrl
    return openSiteScreensOnTargets(
      projectUrl,
      resolveExtendedTargets(monitorIds),
    )
  }

  closeWebProjectionWindows()

  currentProjectionMode = mode

  if (mode === 'site') {
    lastSiteMonitorIds = monitorIds
  } else {
    lastVideoMonitorIds = monitorIds
  }

  const title =
    typeof effective.title === 'string' && effective.title.trim()
      ? mode === 'site'
        ? `Site — ${effective.title.trim()}`
        : mode === 'image'
          ? `Imagens — ${effective.title.trim()}`
          : mode === 'pdf'
            ? `PDF — ${effective.title.trim()}`
            : mode === 'presentation'
              ? `Apresentação — ${effective.title.trim()}`
              : `Player — ${effective.title.trim()}`
      : mode === 'site'
        ? SITE_WINDOW_TITLE
        : mode === 'image'
          ? 'Imagens — LouvorJA - PIANO'
          : mode === 'pdf'
            ? 'PDF — LouvorJA - PIANO'
            : mode === 'presentation'
              ? 'Apresentação — LouvorJA - PIANO'
              : SOURCE_WINDOW_TITLE

  sourceWindow =
    mode === 'site'
      ? createSiteSourceWindow(loadUrl, title)
      : createSourceWindow(loadUrl, title)

  // Hotkey global de alternância disponível enquanto houver projeção
  enableProjectionHotkey()

  if (!withScreens) {
    return true
  }

  const targets = resolveExtendedTargets(monitorIds)

  for (const display of targets) {
    if (mode === 'site') {
      mirrorWindows.push(createSiteProjectionWindow(display, loadUrl))
      siteShieldWindows.push(createSiteShieldWindow(display))
    } else if (
      mode === 'image' ||
      mode === 'pdf' ||
      mode === 'presentation'
    ) {
      mirrorWindows.push(createImageProjectionWindow(display, loadUrl))
    } else {
      mirrorWindows.push(createMirrorWindow(display))
    }
  }

  if (mode === 'site' && targets.length > 0) {
    startSiteProjectionSync()
  }

  return true
}

function openVideoScreensOnTargets(targets) {
  closeMirrorWindowsOnly()
  if (
    currentProjectionMode === 'image' ||
    currentProjectionMode === 'pdf' ||
    currentProjectionMode === 'presentation'
  ) {
    const loadUrl =
      sourceWindow && !sourceWindow.isDestroyed()
        ? sourceWindow.webContents.getURL()
        : ''
    if (!loadUrl || loadUrl === 'about:blank') return false
    for (const display of targets) {
      mirrorWindows.push(createImageProjectionWindow(display, loadUrl))
    }
    return targets.length > 0
  }

  for (const display of targets) {
    mirrorWindows.push(createMirrorWindow(display))
  }
  return targets.length > 0
}

/**
 * Liga/desliga a projeção do site nas telas estendidas a partir do controle.
 * @returns {boolean}
 */
export function toggleSiteProjectionScreens() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'site') {
    return false
  }

  if (mirrorWindows.some((win) => !win.isDestroyed())) {
    closeMirrorWindowsOnly()
    return true
  }

  const loadUrl = sourceWindow.webContents.getURL()
  if (!loadUrl || loadUrl === 'about:blank') return false

  const targets = resolveExtendedTargets(lastSiteMonitorIds)
  return openSiteScreensOnTargets(loadUrl, targets)
}

/**
 * Liga/desliga a projeção do vídeo nas telas estendidas a partir do controle.
 * @returns {boolean}
 */
export function toggleVideoProjectionScreens() {
  if (
    !sourceWindow ||
    sourceWindow.isDestroyed() ||
    !isCaptureProjectionMode()
  ) {
    return false
  }

  if (mirrorWindows.some((win) => !win.isDestroyed())) {
    closeMirrorWindowsOnly()
    return true
  }

  const targets = resolveExtendedTargets(lastVideoMonitorIds)
  return openVideoScreensOnTargets(targets)
}

export function isSiteProjectingToScreens() {
  return (
    currentProjectionMode === 'site' &&
    mirrorWindows.some((win) => !win.isDestroyed())
  )
}

export function isVideoProjectingToScreens() {
  return (
    isCaptureProjectionMode() &&
    mirrorWindows.some((win) => win && !win.isDestroyed())
  )
}

/** @param {unknown} _payload */
export function broadcastPlaybackSync(_payload) {
  // Mantido por compatibilidade de IPC — espelho é por captura, não precisa sync.
}

/**
 * @param {Electron.WebContents} requester
 */
export function getSourceMediaIdFor(requester) {
  if (!sourceWindow || sourceWindow.isDestroyed()) return null
  try {
    return sourceWindow.webContents.getMediaSourceId(requester)
  } catch (error) {
    console.error('[projection] getMediaSourceId', error)
    return null
  }
}

const REMOTE_PLAY_SCRIPT = `
(() => {
  const video =
    document.querySelector('video.html5-main-video') ||
    document.querySelector('video.video-stream') ||
    document.querySelector('video');

  if (video && video.paused) {
    const playBtn =
      document.querySelector('button.ytp-play-button') ||
      document.querySelector('.ytp-large-play-button');
    if (playBtn) playBtn.click();
    else {
      const p = video.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
    }
  } else if (!video) {
    const large = document.querySelector('.ytp-large-play-button');
    if (large) large.click();
    else return false;
  }

  const v =
    document.querySelector('video.html5-main-video') ||
    document.querySelector('video.video-stream') ||
    document.querySelector('video');
  return Boolean(v && !v.paused);
})()
`

const REMOTE_PAUSE_SCRIPT = `
(() => {
  const video =
    document.querySelector('video.html5-main-video') ||
    document.querySelector('video.video-stream') ||
    document.querySelector('video');
  if (!video) return false;
  if (!video.paused) {
    const pauseBtn = document.querySelector('button.ytp-play-button');
    if (pauseBtn) pauseBtn.click();
    else video.pause();
  }
  return Boolean(video.paused);
})()
`

const GET_PLAYBACK_STATE_SCRIPT = `
(() => {
  const video =
    document.querySelector('video.html5-main-video') ||
    document.querySelector('video.video-stream') ||
    document.querySelector('video');
  if (!video) return null;
  const volume = Math.min(1, Math.max(0, Number(video.volume) || 0));
  return {
    paused: Boolean(video.paused),
    currentTime: Number.isFinite(Number(video.currentTime)) ? Number(video.currentTime) : 0,
    duration: Number.isFinite(Number(video.duration)) ? Number(video.duration) : 0,
    muted: Boolean(video.muted) || volume === 0,
    volume,
  };
})()
`

const REMOTE_TOGGLE_MUTE_SCRIPT = `
(() => {
  const video =
    document.querySelector('video.html5-main-video') ||
    document.querySelector('video.video-stream') ||
    document.querySelector('video');
  if (!video) return null;

  const muteBtn = document.querySelector('button.ytp-mute-button');
  if (muteBtn) muteBtn.click();
  else video.muted = !video.muted;

  const volume = Math.min(1, Math.max(0, Number(video.volume) || 0));
  return {
    muted: Boolean(video.muted) || volume === 0,
    volume,
  };
})()
`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Play no popup — espelhos acompanham visualmente. */
export async function remotePlaySource() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'video') {
    return false
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const playing = await sourceWindow.webContents.executeJavaScript(
        REMOTE_PLAY_SCRIPT,
        true,
      )
      if (playing) return true
    } catch {
      // ainda carregando
    }
    await sleep(250)
  }

  return false
}

/** Pause no popup — espelhos acompanham visualmente. */
export async function remotePauseSource() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'video') {
    return false
  }
  try {
    return Boolean(
      await sourceWindow.webContents.executeJavaScript(REMOTE_PAUSE_SCRIPT, true),
    )
  } catch {
    return false
  }
}

/**
 * Seek no popup (segundos).
 * @param {number} seconds
 */
export async function remoteSeekSource(seconds) {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'video') {
    return false
  }
  const t = Number(seconds)
  if (!Number.isFinite(t) || t < 0) return false
  try {
    return Boolean(
      await sourceWindow.webContents.executeJavaScript(
        `(() => {
          const video =
            document.querySelector('video.html5-main-video') ||
            document.querySelector('video.video-stream') ||
            document.querySelector('video');
          if (!video) return false;
          video.currentTime = ${JSON.stringify(t)};
          return true;
        })()`,
        true,
      ),
    )
  } catch {
    return false
  }
}

/** Alterna mudo no popup — áudio só sai desta janela de controle. */
export async function remoteToggleMuteSource() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'video') {
    return null
  }
  try {
    return await sourceWindow.webContents.executeJavaScript(
      REMOTE_TOGGLE_MUTE_SCRIPT,
      true,
    )
  } catch {
    return null
  }
}

/**
 * Define o volume do vídeo no popup (0–1).
 * @param {number} volume
 */
export async function remoteSetVolumeSource(volume) {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'video') {
    return null
  }
  const next = Math.min(1, Math.max(0, Number(volume)))
  if (!Number.isFinite(next)) return null
  try {
    return await sourceWindow.webContents.executeJavaScript(
      `(() => {
        const video =
          document.querySelector('video.html5-main-video') ||
          document.querySelector('video.video-stream') ||
          document.querySelector('video');
        if (!video) return null;
        const value = ${JSON.stringify(next)};
        video.volume = value;
        video.muted = value <= 0;
        return {
          muted: Boolean(video.muted) || value <= 0,
          volume: Math.min(1, Math.max(0, Number(video.volume) || 0)),
        };
      })()`,
      true,
    )
  } catch {
    return null
  }
}

/** FilePath/título da mídia corrente (para o popup espelhar no Palco). */
export function getSourceMediaInfo() {
  return { filePath: currentSourceFilePath, title: currentSourceTitle }
}

/** Estado de playback do vídeo no popup (para a barra do operador). */
export async function getSourcePlaybackState() {
  if (!sourceWindow || sourceWindow.isDestroyed()) return null

  // Galeria de imagens / PDF / PPT: só o flag de projeção.
  if (
    currentProjectionMode === 'image' ||
    currentProjectionMode === 'pdf' ||
    currentProjectionMode === 'presentation'
  ) {
    return {
      paused: true,
      currentTime: 0,
      duration: 0,
      projecting: isVideoProjectingToScreens(),
    }
  }

  if (currentProjectionMode !== 'video') return null
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      GET_PLAYBACK_STATE_SCRIPT,
      true,
    )
    if (!state || typeof state !== 'object') return null
    return {
      ...state,
      projecting: isVideoProjectingToScreens(),
    }
  } catch {
    return null
  }
}

/** Avança para a próxima imagem na galeria do popup. */
export async function remoteImageNext() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'image') {
    return null
  }
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyGallery ? window.__liturgyGallery.next() : null))()`,
      true,
    )
    if (state && typeof state === 'object') {
      await syncImageMirrorsToIndex(Number(state.index) || 0)
    }
    return state
  } catch {
    return null
  }
}

/** Volta para a imagem anterior na galeria do popup. */
export async function remoteImagePrev() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'image') {
    return null
  }
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyGallery ? window.__liturgyGallery.prev() : null))()`,
      true,
    )
    if (state && typeof state === 'object') {
      await syncImageMirrorsToIndex(Number(state.index) || 0)
    }
    return state
  } catch {
    return null
  }
}

/** Índice atual da galeria de imagens no popup. */
export async function getImageSlideState() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'image') {
    return null
  }
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyGallery ? window.__liturgyGallery.getState() : null))()`,
      true,
    )
    if (!state || typeof state !== 'object') return null
    return {
      index: Number(state.index) || 0,
      total: Number(state.total) || 0,
      projecting: isVideoProjectingToScreens(),
    }
  } catch {
    return null
  }
}

/** Avança para a próxima página do PDF no popup. */
export async function remotePdfNext() {
  if (!sourceWindow || sourceWindow.isDestroyed() || !isPdfDocumentMode()) {
    return null
  }
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyPdf ? window.__liturgyPdf.next() : null))()`,
      true,
    )
    if (state && typeof state === 'object') {
      await syncPdfMirrorsToIndex(Number(state.index) || 0)
    }
    return state
  } catch {
    return null
  }
}

/** Volta para a página anterior do PDF no popup. */
export async function remotePdfPrev() {
  if (!sourceWindow || sourceWindow.isDestroyed() || !isPdfDocumentMode()) {
    return null
  }
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyPdf ? window.__liturgyPdf.prev() : null))()`,
      true,
    )
    if (state && typeof state === 'object') {
      await syncPdfMirrorsToIndex(Number(state.index) || 0)
    }
    return state
  } catch {
    return null
  }
}

/** Página atual do PDF no popup. */
export async function getPdfPageState() {
  if (!sourceWindow || sourceWindow.isDestroyed() || !isPdfDocumentMode()) {
    return null
  }
  try {
    const state = await sourceWindow.webContents.executeJavaScript(
      `(() => (window.__liturgyPdf ? window.__liturgyPdf.getState() : null))()`,
      true,
    )
    if (!state || typeof state !== 'object') return null
    return {
      index: Number(state.index) || 0,
      total: Number(state.total) || 0,
      projecting: isVideoProjectingToScreens(),
    }
  } catch {
    return null
  }
}

/** Rasteriza o slide/página atual do popup para o Palco (TV/browser).
 * Controle fica fora do sourceWindow, então a imagem contém só conteúdo. */
export async function captureSourceFrameBase64() {
  if (!sourceWindow || sourceWindow.isDestroyed()) return null
  try {
    // PDF/PPT convertido: canvas PDF.js é fonte real do slide. capturePage
    // pegava o frame cinza de loading antes do render/GPU finalizar.
    const canvasPng = await sourceWindow.webContents.executeJavaScript(
      "window.__liturgyPdf && window.__liturgyPdf.capturePng ? window.__liturgyPdf.capturePng() : null",
      true,
    )
    if (typeof canvasPng === 'string' && canvasPng.length > 32) return canvasPng
    // Modos pdf/presentation: o player sempre expõe __liturgyPdf. Canvas
    // vazio = PDF.js ainda renderizando — capturePage aqui devolve o frame
    // CINZA de loading (regressão "TV cinza" 13/10). Sem fallback: quem
    // chama (syncPptToTvs) retenta até o canvas ficar pronto.
    if (isPdfDocumentMode()) return null
    const image = await sourceWindow.webContents.capturePage()
    const png = image.toPNG()
    if (!png?.length) return null
    return png.toString('base64')
  } catch {
    return null
  }
}

/** Avança para o próximo slide da apresentação no popup. */
export async function remotePptNext() {
  return remotePdfNext()
}

/** Volta para o slide anterior da apresentação no popup. */
export async function remotePptPrev() {
  return remotePdfPrev()
}

/** Slide atual da apresentação no popup. */
export async function getPptSlideState() {
  return getPdfPageState()
}

/** Navegação do site no popup de controle. */
export async function getSourceNavigationState() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'site') {
    return null
  }
  try {
    const contents = sourceWindow.webContents
    return {
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
      projecting: isSiteProjectingToScreens(),
    }
  } catch {
    return null
  }
}

export function remoteGoBackSource() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'site') {
    return false
  }
  const contents = sourceWindow.webContents
  if (!contents.canGoBack()) return false
  contents.goBack()
  return true
}

export function remoteGoForwardSource() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'site') {
    return false
  }
  const contents = sourceWindow.webContents
  if (!contents.canGoForward()) return false
  contents.goForward()
  return true
}

export function remoteReloadSource() {
  if (!sourceWindow || sourceWindow.isDestroyed() || currentProjectionMode !== 'site') {
    return false
  }
  siteSourceReloadPending = true
  sourceWindow.webContents.reload()
  return true
}

export function registerProjectionCapturePermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (
      permission === 'media' ||
      permission === 'display-capture' ||
      permission === 'mediaKeySystem' ||
      permission === 'fullscreen' ||
      permission === 'clipboard-sanitized-write'
    ) {
      callback(true)
      return
    }
    callback(false)
  })
}
