import { ipcMain } from 'electron'

/**
 * Seletor de telas dos players igual ao do app: a Tela retorno e as Conexões
 * Remotas (nome e marca) vivem na janela principal; o player pergunta por
 * aqui e devolve a marca que o operador mudar nele.
 */

const EMPTY = { returnDisplayId: null, remotes: [] }

/** @param {unknown} raw */
export function normalizeScreenContext(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  const value = /** @type {Record<string, unknown>} */ (raw)
  const returnDisplayId = typeof value.returnDisplayId === 'number' && Number.isFinite(value.returnDisplayId) ? value.returnDisplayId : null
  const remotes = Array.isArray(value.remotes)
    ? value.remotes
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => ({ id: item.id, name: item.name, selected: item.selected !== false }))
    : []
  return { returnDisplayId, remotes }
}

/** @param {() => import('electron').BrowserWindow | null} getMainWindow */
function mainContents(getMainWindow) {
  const win = getMainWindow()
  return win && !win.isDestroyed() && !win.webContents.isDestroyed() ? win.webContents : null
}

/** @param {() => import('electron').BrowserWindow | null} getMainWindow */
export function registerScreenContextIpc(getMainWindow) {
  ipcMain.handle('projection:screen-context', async () => {
    const contents = mainContents(getMainWindow)
    if (!contents) return { ...EMPTY }
    try {
      return normalizeScreenContext(await contents.executeJavaScript('window.__pianoScreenContext ? window.__pianoScreenContext() : null', true))
    } catch {
      return { ...EMPTY }
    }
  })

  ipcMain.handle('projection:set-remote-selected', async (_event, payload) => {
    const id = typeof payload?.id === 'string' ? payload.id : ''
    if (!id || typeof payload?.selected !== 'boolean') return false
    const contents = mainContents(getMainWindow)
    if (!contents) return false
    try {
      return (await contents.executeJavaScript(
        `window.__pianoSetRemoteSelected ? window.__pianoSetRemoteSelected(${JSON.stringify(id)}, ${payload.selected}) : false`,
        true,
      )) === true
    } catch {
      return false
    }
  })
}
