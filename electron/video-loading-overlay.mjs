/**
 * Tela de carregamento do player de vídeo do YouTube (popup do operador).
 *
 * Enquanto a cópia é preparada e o YouTube monta o vídeo, a janela fica preta
 * (fundo + véu que esconde carregamento e anúncio). Esta camada fica por cima
 * da área do vídeo — acima da página, abaixo da barra de controle — e sobrevive
 * às trocas de página da janela (about:blank → cópia/YouTube):
 *   carregando → logo do Piano pulsando + "Carregando…"
 *   pronto     → "Pronto para tocar" (o vídeo carregou e espera o play)
 *   tocando    → some; volta só se a janela trocar de página de novo.
 * É uma WebContentsView, então não entra na captura das telas de projeção.
 */
import { pianoLogoSvg } from './piano-logo.mjs'

const POLL_MS = 400
/** Sem vídeo depois disso: avisa que está demorando (rede lenta / cópia sendo preparada). */
const SLOW_MS = 25000

/** Estado do vídeo dentro da página (YouTube ou player local da cópia). */
export const VIDEO_STATE_SCRIPT = `(() => {
  const player = document.getElementById('movie_player');
  const video = (player && player.querySelector('video')) || document.querySelector('video');
  if (!video) return 'loading';
  const ad = !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
  if (ad) return 'loading';
  if (!video.paused && video.currentTime > 0) return 'playing';
  if (video.readyState >= 2) return 'ready';
  return 'loading';
})()`

/**
 * O que a camada mostra.
 * @param {'loading' | 'ready' | 'playing' | null} videoState  `null` = página trocando
 * @param {{ started: boolean, sinceMs: number }} ctx
 * @returns {{ view: 'loading' | 'slow' | 'ready' | 'hidden', started: boolean }}
 */
export function overlayFor(videoState, { started, sinceMs }) {
  if (videoState === 'playing' || started) return { view: 'hidden', started: true }
  if (videoState === 'ready') return { view: 'ready', started: false }
  return { view: sinceMs >= SLOW_MS ? 'slow' : 'loading', started: false }
}

export const OVERLAY_HTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden;user-select:none;-webkit-user-select:none;cursor:default}
.s{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;background:radial-gradient(circle at 50% 45%,#16162a 0%,#000 70%)}
.l{width:96px;height:96px;animation:p 1.6s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(252,206,2,.25))}
.t{color:#f2f2f5;font-size:18px;font-weight:600;letter-spacing:.3px}
.t .d::after{content:'';animation:d 1.4s steps(4,end) infinite}
.m{max-width:340px;color:rgba(242,242,245,.6);font-size:13px;line-height:1.45;min-height:1em}
.ready .l{animation:none;opacity:1}
.ready .t{color:#fcce02}
.play{display:none;width:44px;height:44px;border-radius:50%;background:#fcce02;place-items:center}
.play::before{content:'';margin-left:4px;border-left:15px solid #12121c;border-top:10px solid transparent;border-bottom:10px solid transparent}
.ready .play{display:grid}
@keyframes p{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.9)}}
@keyframes d{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
@media (prefers-reduced-motion: reduce){.l,.t .d::after{animation:none}}
</style></head><body><div class="s" id="s">
${pianoLogoSvg('l')}
<div class="t" id="t">Carregando<span class="d"></span></div>
<div class="play" aria-hidden="true"></div>
<div class="m" id="m">Preparando o vídeo para tocar.</div>
</div><script>
window.__setOverlay = function (view) {
  var s = document.getElementById('s'), t = document.getElementById('t'), m = document.getElementById('m');
  s.classList.toggle('ready', view === 'ready');
  if (view === 'ready') { t.textContent = 'Pronto para tocar'; m.textContent = 'Aperte o play na barra abaixo.'; return; }
  t.innerHTML = 'Carregando<span class="d"></span>';
  m.textContent = view === 'slow' ? 'Está demorando mais que o normal. Confira a conexão com a internet.' : 'Preparando o vídeo para tocar.';
};
</script></body></html>`

/**
 * Coloca a camada na janela do player. Devolve a função que a remove.
 * @param {import('electron').BrowserWindow} win
 * @param {{ WebContentsView: typeof import('electron').WebContentsView, barHeight: number, getControlBar?: () => import('electron').WebContentsView | null }} deps
 */
export function attachVideoLoadingOverlay(win, { WebContentsView, barHeight, getControlBar }) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false },
  })
  view.setBackgroundColor('#000000')
  win.contentView.addChildView(view)
  // A barra de controle continua por cima (re-adicionar leva a view para o topo).
  const bar = getControlBar?.()
  if (bar) win.contentView.addChildView(bar)

  const layout = () => {
    if (win.isDestroyed()) return
    const [width, height] = win.getContentSize()
    view.setBounds({ x: 0, y: 0, width, height: Math.max(0, height - barHeight) })
  }
  layout()
  void view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`)

  let started = false
  let since = Date.now()
  let shown = ''
  let disposed = false

  const render = (next) => {
    if (next === shown || view.webContents.isDestroyed()) return
    shown = next
    view.setVisible(next !== 'hidden')
    if (next !== 'hidden') {
      void view.webContents.executeJavaScript(`window.__setOverlay && window.__setOverlay(${JSON.stringify(next)})`).catch(() => {})
    }
  }

  const tick = async () => {
    if (disposed || win.isDestroyed()) return
    let state = null
    try {
      state = await win.webContents.executeJavaScript(VIDEO_STATE_SCRIPT, true)
    } catch {
      state = null // página trocando
    }
    if (disposed) return
    const result = overlayFor(state, { started, sinceMs: Date.now() - since })
    started = result.started
    render(result.view)
  }

  // Nova página (about:blank → cópia → YouTube): volta a mostrar até o vídeo tocar.
  const onNavigate = (event, _url, isInPlace, isMainFrame) => {
    // Electron novo passa os dados no próprio evento; o antigo, em argumentos.
    const mainFrame = typeof event?.isMainFrame === 'boolean' ? event.isMainFrame : isMainFrame
    const sameDocument = typeof event?.isSameDocument === 'boolean' ? event.isSameDocument : isInPlace
    if (mainFrame === false || sameDocument) return
    started = false
    since = Date.now()
    render('loading')
  }
  win.webContents.on('did-start-navigation', onNavigate)
  view.webContents.once('did-finish-load', () => { shown = ''; void tick() })
  const timer = setInterval(() => { void tick() }, POLL_MS)

  const dispose = () => {
    if (disposed) return
    disposed = true
    clearInterval(timer)
    try { win.webContents.off('did-start-navigation', onNavigate) } catch { /* janela fechada */ }
    try { if (!win.isDestroyed()) win.contentView.removeChildView(view) } catch { /* janela fechada */ }
    try { if (!view.webContents.isDestroyed()) view.webContents.close() } catch { /* ignore */ }
  }
  win.once('closed', dispose)
  return dispose
}
