// IPC do download-batch (Provai e Vede em background).
// Singleton do batch no MAIN; handlers:
//   download-batch:enqueue  — enfileira [{id,url,fileName}]
//   download-batch:cancel   — cancela item
//   download-batch:retry    — re-enfileira item failed
//   download-batch:pending  — lista pendentes (para o header/popover no boot)
// Eventos pro renderer (webContents.send): download-progress, download-item-done,
//   download-item-failed, download-item-cancelled, download-batch-done.
import { ipcMain, net, app } from 'electron'
import path from 'node:path'
import { getWorkspacePaths } from '../paths.mjs'
import { createDownloadBatch } from './download-batch.mjs'
import { notifyDownloadComplete } from './download-notify.mjs'
import { resolveAppLocale } from '../locale.mjs'

let batchSingleton = null

export function registerDownloadBatchIpc(getMainWindow) {
  if (batchSingleton) return batchSingleton

  // Emit dinâmico: resolve a mainWindow a cada evento (janela pode ser
  // recriada; download continua em background).
  const emit = (channel, payload) => {
    try {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
    } catch {
      // janela fechada: download segue em background
    }
  }
  const proxySender = { send: emit, isDestroyed: () => false }

  batchSingleton = createDownloadBatch({
    mediaDir: getWorkspacePaths().media,
    queuePath: path.join(app.getPath('userData'), 'download-queue.json'),
    sender: proxySender,
    fetch: (url, init) => net.fetch(url, init),
    retries: 3,
  })

  ipcMain.handle('download-batch:enqueue', (_e, items) => {
    batchSingleton.enqueue(Array.isArray(items) ? items : [])
    return { ok: true }
  })
  ipcMain.handle('download-batch:cancel', (_e, id) => {
    batchSingleton.cancel(String(id))
    return { ok: true }
  })
  ipcMain.handle('download-batch:retry', (_e, id) => {
    batchSingleton.retry(String(id))
    return { ok: true }
  })
  ipcMain.handle('download-batch:pending', () => batchSingleton.getPending())

  // Rehidratação no boot: itens 'active' viram pending e a fila retoma.
  batchSingleton.resume()

  // T2/R3: notificação OS quando um batch conclui (locale do app).
  batchSingleton.onBatchDone?.((summary) => {
    notifyDownloadComplete(summary, resolveAppLocale(app.getLocale()))
  })
  return batchSingleton
}
