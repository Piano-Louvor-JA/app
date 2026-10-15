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
