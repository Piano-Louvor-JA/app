import { app, BrowserWindow, ipcMain, net } from 'electron'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { getWorkspacePaths } from '../paths.mjs'
import { createFontService } from './service.mjs'
import { registerFontsIpc } from './ipc.mjs'

export async function registerDesktopFonts() {
  function trustedUrl(value) {
    try {
      const url = new URL(value)
      const base = new URL(globalThis.__rendererBaseUrl ?? process.env.VITE_DEV_SERVER_URL ?? pathToFileURL(path.join(app.getAppPath(), 'dist/index.html')).href)
      return url.protocol === 'file:' ? url.origin === base.origin && url.pathname === base.pathname : url.origin === base.origin
    } catch { return false }
  }
  const trusted = event => Boolean(BrowserWindow.fromWebContents(event.sender)) && event.senderFrame === event.sender.mainFrame && trustedUrl(event.senderFrame.url)
  const service = createFontService({
    mediaRoot: () => getWorkspacePaths().media,
    fetch: (url, options) => net.fetch(url, options),
    referencedIds: async () => {
      const references = new Set()
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed() || !trustedUrl(window.webContents.getURL())) continue
        // Fixed script reads the same preference snapshot as the renderer service.
        // No renderer-supplied ids or code are trusted for deletion decisions.
        const ids = await window.webContents.executeJavaScript(`(() => {
          const prefs = JSON.parse(localStorage.getItem('user_data') || '{}')['fonts.preferences.v1'];
          return prefs ? [prefs.systemFamilyId, ...Object.values(prefs.stageFamilyIds || {})].filter(id => typeof id === 'string') : [];
        })()`)
        ids.forEach(id => references.add(id))
      }
      return [...references]
    },
  })
  try { await service.cleanup() } catch (error) { console.warn('[fonts] cache cleanup unavailable:', error.message) }
  registerFontsIpc(ipcMain, service, { trusted })
}
