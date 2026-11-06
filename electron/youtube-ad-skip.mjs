import { app, webContents, webFrameMain } from 'electron'

/**
 * Pula anúncios em vídeo do player do YouTube.
 *
 * O anúncio em vídeo vem do mesmo servidor do conteúdo e é anunciado na
 * resposta do player, então filtro de rede não o pega. Aqui o script roda
 * só nos frames do YouTube: enquanto o player está em anúncio (`ad-showing`)
 * o vídeo fica invisível e mudo, é levado ao fim e o "Pular" é clicado.
 * Nada de CSP nem filtros cosméticos globais (app#177).
 */

/**
 * Roda dentro da página do YouTube (serializada por `youtubeAdSkipScript`):
 * não pode referenciar nada de fora da função.
 * @param {boolean} enabled
 */
function adSkipInPage(enabled) {
  const STYLE_ID = 'louvorja-yt-ad-skip'
  const CSS = [
    '.ad-showing video, .ad-interrupting video { opacity: 0 !important; }',
    '.ytp-ad-overlay-container, .ytp-ad-image-overlay, .ytp-ad-text-overlay,',
    '.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-ad-module,',
    '#player-ads, #masthead-ad, ytd-ad-slot-renderer, ytd-display-ad-renderer,',
    'ytd-companion-slot-renderer, ytd-action-companion-ad-renderer,',
    'ytd-promoted-sparkles-web-renderer, ytd-in-feed-ad-layout-renderer',
    '{ display: none !important; }',
  ].join('\n')
  const SKIP_BUTTONS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.videoAdUiSkipButton',
  ].join(', ')

  const state =
    window.__louvorjaYtAdSkip ||
    (window.__louvorjaYtAdSkip = { enabled: false, saved: null, timer: null, observer: null, observed: null })

  const findPlayer = () => {
    const player = document.querySelector('#movie_player, .html5-video-player')
    return { player, video: player ? player.querySelector('video') : null }
  }

  const restore = (video) => {
    if (state.saved && video) {
      video.muted = state.saved.muted
      video.playbackRate = state.saved.playbackRate
    }
    state.saved = null
  }

  state.tick = () => {
    if (!state.enabled) return
    const { player, video } = findPlayer()
    if (!player || !video) return
    if (state.observer && state.observed !== player) {
      state.observer.observe(player, { attributes: true, attributeFilter: ['class'] })
      state.observed = player
    }

    const inAd = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')
    if (!inAd) {
      restore(video)
      return
    }
    if (!state.saved) state.saved = { muted: video.muted, playbackRate: video.playbackRate }
    video.muted = true
    try {
      video.playbackRate = 16
    } catch {
      // alguns anúncios recusam taxa alta; o seek abaixo resolve
    }
    const duration = video.duration
    if (Number.isFinite(duration) && duration > 0 && video.currentTime < duration) {
      video.currentTime = duration
    }
    document.querySelectorAll(SKIP_BUTTONS).forEach((button) => button.click())
  }

  if (!enabled) {
    state.enabled = false
    restore(findPlayer().video)
    if (state.timer) clearInterval(state.timer)
    if (state.observer) state.observer.disconnect()
    state.timer = null
    state.observer = null
    state.observed = null
    const style = document.getElementById(STYLE_ID)
    if (style) style.remove()
    return false
  }

  state.enabled = true
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    ;(document.head || document.documentElement).appendChild(style)
  }
  if (!state.observer) state.observer = new MutationObserver(() => state.tick())
  if (!state.timer) state.timer = setInterval(() => state.tick(), 250)
  state.tick()
  return true
}

/** @param {boolean} enabled */
export function youtubeAdSkipScript(enabled) {
  return `(${adSkipInPage.toString()})(${enabled === true})`
}

/** @param {string} url */
export function isYoutubeFrameUrl(url) {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') return false
    return ['youtube.com', 'youtube-nocookie.com'].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  } catch {
    return false
  }
}

let enabled = false
let listening = false
let watched = new WeakSet()

function inject(frame, on) {
  if (!frame || !isYoutubeFrameUrl(frame.url)) return
  try {
    void Promise.resolve(frame.executeJavaScript(youtubeAdSkipScript(on), true)).catch(() => {})
  } catch {
    // frame descartado entre o evento e a injeção
  }
}

function frameFromIds(processId, routingId) {
  try {
    return webFrameMain.fromId(processId, routingId)
  } catch {
    return null
  }
}

function watch(contents) {
  if (!contents || watched.has(contents)) return
  watched.add(contents)
  contents.on('did-frame-navigate', (_event, _url, _code, _status, _isMainFrame, processId, routingId) => {
    if (enabled) inject(frameFromIds(processId, routingId), true)
  })
  contents.on('did-frame-finish-load', (_event, _isMainFrame, processId, routingId) => {
    if (enabled) inject(frameFromIds(processId, routingId), true)
  })
}

function openContents() {
  return webContents.getAllWebContents().filter((contents) => !contents.isDestroyed())
}

function forEachOpenYoutubeFrame(fn) {
  for (const contents of openContents()) {
    let frames = []
    try {
      frames = contents.mainFrame.framesInSubtree
    } catch {
      continue
    }
    frames.forEach(fn)
  }
}

export function enableYoutubeAdSkip() {
  enabled = true
  if (!listening) {
    listening = true
    app.on('web-contents-created', (_event, contents) => watch(contents))
  }
  openContents().forEach(watch)
  forEachOpenYoutubeFrame((frame) => inject(frame, true))
}

export function disableYoutubeAdSkip() {
  if (!enabled) return
  enabled = false
  forEachOpenYoutubeFrame((frame) => inject(frame, false))
}

export function _resetYoutubeAdSkipForTests() {
  enabled = false
  listening = false
  watched = new WeakSet()
}
