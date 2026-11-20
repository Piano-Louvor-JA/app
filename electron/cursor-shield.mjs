/**
 * Camada transparente por cima da área do vídeo no popup do player.
 *
 * As telas projetadas são uma captura da página do player, e a captura desenha o ponteiro do
 * mouse quando ele está sobre essa página. Com esta camada por cima, o mouse fica sobre ELA:
 * o operador vê a seta normalmente no player e a captura (projeção) não recebe ponteiro.
 * Fica abaixo da tela de carregamento e da barra de controle.
 */
export const CURSOR_SHIELD_HTML =
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
  'html,body{margin:0;width:100%;height:100%;background:transparent;cursor:default;overflow:hidden}' +
  '</style></head><body></body></html>'

/**
 * @param {import('electron').BrowserWindow} win
 * @param {{ WebContentsView: typeof import('electron').WebContentsView, barHeight: number,
 *   onEscape?: () => void }} deps
 * @returns {() => void} remove a camada
 */
export function attachCursorShield(win, { WebContentsView, barHeight, onEscape }) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  })
  view.setBackgroundColor('#00000000')
  win.contentView.addChildView(view)

  const layout = () => {
    if (win.isDestroyed()) return
    const [width, height] = win.getContentSize()
    view.setBounds({ x: 0, y: 0, width, height: Math.max(0, height - barHeight) })
  }
  layout()
  void view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(CURSOR_SHIELD_HTML)}`)

  // Com o foco na camada (depois de um clique), o Esc continua fechando o player.
  view.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') onEscape?.()
  })
  win.on('resize', layout)

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    try { win.off('resize', layout) } catch { /* janela fechada */ }
    try { if (!win.isDestroyed()) win.contentView.removeChildView(view) } catch { /* janela fechada */ }
    try { if (!view.webContents.isDestroyed()) view.webContents.close() } catch { /* ignore */ }
  }
  win.once('closed', dispose)
  return dispose
}
