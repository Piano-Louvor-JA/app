import { BrowserWindow, ipcMain } from 'electron'

/**
 * Controles da titlebar customizada (frame: false) — espelha o legado.
 * @param {() => import('electron').BrowserWindow | null} getMainWindow
 */
export function registerWindowIpc(getMainWindow) {
  ipcMain.handle('window:control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    if (action === 'minimize') {
      win.minimize()
      return true
    }
    if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return true
    }
    if (action === 'close') {
      const main = getMainWindow()
      if (main && win.id === main.id) {
        win.close()
      } else {
        win.close()
      }
      return true
    }
    if (action === 'is-maximized') {
      return win.isMaximized()
    }
    return null
  })

  ipcMain.handle('window:capture-preview', (event, rect) =>
    capturePreview(BrowserWindow.fromWebContents(event.sender), rect),
  )
}

/** Largura máxima da miniatura de uma página minimizada. */
const PREVIEW_WIDTH = 320
const PREVIEW_JPEG_QUALITY = 70

/** @returns {{ x: number, y: number, width: number, height: number } | null} */
function normalizeRect(rect) {
  if (typeof rect !== 'object' || rect === null) return null
  const values = [rect.x, rect.y, rect.width, rect.height]
  if (!values.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const [x, y, width, height] = values.map(Math.round)
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/**
 * Miniatura de uma área da janela (prévia de página minimizada): JPEG
 * reduzido para até 320 px de largura, em data URL. Qualquer falha = null
 * (o renderer mostra a prévia em cartão).
 * @param {import('electron').BrowserWindow | null} win
 * @param {unknown} rect retângulo em DIP da janela
 */
async function capturePreview(win, rect) {
  const area = normalizeRect(rect)
  if (!area || !win || win.isDestroyed()) return null
  try {
    const image = await win.webContents.capturePage(area)
    if (image.isEmpty()) return null
    const width = Math.min(PREVIEW_WIDTH, image.getSize().width)
    const jpeg = image.resize({ width }).toJPEG(PREVIEW_JPEG_QUALITY)
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}

/** @param {import('electron').BrowserWindow} win */
/** `app-command` do Windows (botões laterais do mouse, teclas multimídia) → direção do histórico. */
const HISTORY_APP_COMMANDS = {
  'browser-backward': 'back',
  'browser-forward': 'forward',
}

/**
 * Voltar/avançar do histórico de navegação vindos do sistema. No Windows os
 * botões laterais do mouse podem chegar só como `app-command`, sem `mouseup`
 * no DOM; o renderer deduplica quando chegam os dois.
 * @param {import('electron').BrowserWindow} win
 */
export function attachHistoryAppCommand(win) {
  win.on('app-command', (_event, command) => {
    const direction = HISTORY_APP_COMMANDS[command]
    if (!direction || win.isDestroyed()) return
    win.webContents.send('window:history-command', direction)
  })
}

export function attachWindowStateEvents(win) {
  win.on('maximize', () => {
    win.webContents.send('window:maximized-state', true)
  })
  win.on('unmaximize', () => {
    win.webContents.send('window:maximized-state', false)
  })

  // Sincroniza UI de zoom com Ctrl+/Ctrl− (zoom nativo do Chromium)
  win.webContents.on('zoom-changed', (_event, direction) => {
    if (win.isDestroyed()) return
    const factor = win.webContents.getZoomFactor()
    win.webContents.send('zoom:changed', { factor, direction })
  })
}
