import path from 'node:path'
import { existsSync, mkdirSync, writeFile } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, net } from 'electron'

import { detectClassoInstallation, probeClassoRegistry } from '../classo-detect.mjs'
import {
  analyzeLegacyMediaImport,
  importLegacyMediaItems,
  resolveLegacyMediaConfigFromSelection,
} from '../legacy-media-import.mjs'
import {
  getWindowsMediaFolderStatus,
  migrateWindowsMediaFolder,
} from '../media-folder-migrate.mjs'

import {
  checkMediaFile,
  checkMediaFiles,
  clearWorkspaceData,
  deleteMediaFile,
  downloadCatalogDatabase,
  downloadMediaFile,
  extractCatalogDatabase,
  readWorkspaceRecord,
  writeWorkspaceRecord,
} from '../workspace.mjs'
import { ensureWorkspaceDirectories, getWorkspacePaths } from '../paths.mjs'
import {
  ensureSorteioDefaultAudio,
  importSorteioCustomAudio,
  deleteSorteioCustomAudio,
} from '../sorteio-audio.mjs'
import { writeWindowsMediaRootOverride } from '../windows-media-root.mjs'
import {
  buildBackupFileName,
  buildLocalStorageRestoreScript,
  buildLocalStorageSnapshotScript,
  createAppBackupArchive,
  readRestoredBrowserStorage,
  restoreAppBackupArchive,
} from '../app-backup.mjs'
import { registerDisplayIpc } from './displays.mjs'
import { registerDialogIpc, registerReadBinaryFileIpc } from './dialog.mjs'
import { probeMediaDurationMsMain } from './media-probe.mjs'
import {
  detectInstalledPresentationEngines,
  EXTERNAL_PRESENTATION_ENGINES,
  openPresentationExternal,
  setCustomPresentationApp,
} from './presentation-external.mjs'
import {
  getExternalPlayerPreference,
  setExternalPlayerPreference,
  getCustomExternalPlayers,
  removeCustomExternalPlayer,
  playInExternalPlayer,
  detectInstalledPlayers,
} from '../external-player.mjs'
import {
  hasPresentationOffice,
} from './presentation-convert.mjs'
import {
  broadcastPlaybackSync,
  closeAllProjectionWindows,
  closeWebProjectionWindows,
  getSourceMediaIdFor,
  getImageSlideState,
  getPdfPageState,
  getPptSlideState,
  getSourceNavigationState,
  getSourcePlaybackState,
  captureSourceFrameBase64,
  getVideoTargetMonitorIds,
  openWebProjectionWindows,
  registerProjectionCapturePermissions,
  remoteGoBackSource,
  remoteGoForwardSource,
  remoteImageNext,
  remoteImagePrev,
  remotePdfNext,
  remotePdfPrev,
  remotePptNext,
  remotePptPrev,
  remotePauseSource,
  remotePlaySource,
  remoteReloadSource,
  remoteSeekSource,
  remoteSetVolumeSource,
  remoteToggleMuteSource,
  setSiteControlPanelOpen,
  setSiteTargetMonitorIds,
  getSiteTargetMonitorIds,
  setVideoTargetMonitorIds,
  toggleSiteProjectionScreens,
  toggleVideoProjectionScreens,
  getSourceMediaInfo,
  isExternalProjectionAlive, } from './web-projection.mjs'
import { collectAliveProjectionWindows, isProjectionPopupWindow } from '../projection-hotkey.mjs'

export function registerWorkspaceIpc() {
  registerDisplayIpc()
  registerDialogIpc()
  registerReadBinaryFileIpc()
  registerProjectionCapturePermissions()

  // Wakeup do receiver (spec multi-telas): abre o app Palco em devices
  // com dev mode (simulador/TV) via ares-launch. Best-effort: falha
  // silenciosa — sem device, o receiver browser/simulador manual segue.
  const wakeDebounce = { last: 0 }
  ipcMain.handle('palco:wake', async () => {
    const now = Date.now()
    if (now - wakeDebounce.last < 30_000) return { ok: false, skipped: 'debounce' }
    wakeDebounce.last = now
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const exec = promisify(execFile)
    const npmBin = `${process.env.HOME}/.npm-global/bin`
    const results = []
    for (const dev of ['emulator', 'tv']) {
      try {
        await exec(`${npmBin}/ares-launch`, ['-d', dev, 'com.piano.louvorja.palco'], { timeout: 8000 })
        results.push(`${dev}:ok`)
      } catch {
        results.push(`${dev}:skip`)
      }
    }
    return { ok: results.some((r) => r.endsWith(':ok')), results }
  })

  ipcMain.handle('projection:open-url', async (_event, payload) => {
    try {
      return await openWebProjectionWindows(payload ?? {})
    } catch (error) {
      console.error('[ipc] projection:open-url', error)
      return false
    }
  })

  ipcMain.handle('presentation:detect-office', () => {
    try {
      return hasPresentationOffice()
    } catch (error) {
      console.error('[ipc] presentation:detect-office', error)
      return false
    }
  })

  ipcMain.handle('presentation:detect-engines', () => detectInstalledPresentationEngines())

  // Engine de apresentações: 'auto' (padrão Piano) até o usuário escolher outro.
  ipcMain.handle('presentation:get-engine', () => {
    try {
      const rec = readWorkspaceRecord('ppt-engine')
      const engine = rec?.engine
      if (engine === 'auto' || EXTERNAL_PRESENTATION_ENGINES.includes(engine)) {
        return engine
      }
      return 'auto'
    } catch {
      return 'auto'
    }
  })
  ipcMain.handle('presentation:set-engine', (_event, engine) => {
    if (engine !== 'auto' && !EXTERNAL_PRESENTATION_ENGINES.includes(engine)) {
      return false
    }
    return writeWorkspaceRecord('ppt-engine', { engine })
  })

  // Abre a apresentação no aplicativo externo (PowerPoint/Impress) em
  // modo slideshow — escolha explícita do usuário no item da liturgia.
  ipcMain.handle('presentation:open-external', async (_event, filePath, engine) => {
    try {
      return await openPresentationExternal(String(filePath ?? ''), engine)
    } catch (error) {
      console.error('[ipc] presentation:open-external', error)
      return { ok: false, error: 'unexpected' }
    }
  })

  // App externo custom de apresentação (Keynote, OnlyOffice, WPS...)
  ipcMain.handle(
    'presentation:set-custom-app',
    (_event, appPath) => setCustomPresentationApp(String(appPath ?? '')),
  )

  // Player HTML avisou que o vídeo acabou → fecha projeção (autoclose).
  ipcMain.on('projection:video-ended', () => {
    try {
      closeWebProjectionWindows()
    } catch (error) {
      console.error('[ipc] projection:video-ended', error)
    }
  })

  ipcMain.handle('projection:close-url', () => {
    try {
      closeAllProjectionWindows()
      return true
    } catch (error) {
      console.error('[ipc] projection:close-url', error)
      return false
    }
  })

  ipcMain.handle('projection:external-alive', () => {
    try {
      // Fonte única: popups (hinos/slides) + web-projection (vídeo/pdf/site)
      const hasPopup = collectAliveProjectionWindows().some((win) => isProjectionPopupWindow(win.webContents.getURL()))
      return Boolean(hasPopup || isExternalProjectionAlive())
    } catch {
      return false
    }
  })

  ipcMain.handle('projection:get-source-media-id', (event) => {
    try {
      return getSourceMediaIdFor(event.sender)
    } catch (error) {
      console.error('[ipc] projection:get-source-media-id', error)
      return null
    }
  })

  ipcMain.on('projection:playback-sync', (_event, payload) => {
    try {
      broadcastPlaybackSync(payload)
    } catch (error) {
      console.error('[ipc] projection:playback-sync', error)
    }
  })

  ipcMain.handle('projection:remote-play', async () => {
    try {
      return await remotePlaySource()
    } catch (error) {
      console.error('[ipc] projection:remote-play', error)
      return false
    }
  })

  ipcMain.handle('projection:remote-pause', async () => {
    try {
      return await remotePauseSource()
    } catch (error) {
      console.error('[ipc] projection:remote-pause', error)
      return false
    }
  })

  ipcMain.handle('projection:remote-seek', async (_event, seconds) => {
    try {
      return await remoteSeekSource(seconds)
    } catch (error) {
      console.error('[ipc] projection:remote-seek', error)
      return false
    }
  })

  ipcMain.handle('projection:remote-toggle-mute', async () => {
    try {
      return await remoteToggleMuteSource()
    } catch (error) {
      console.error('[ipc] projection:remote-toggle-mute', error)
      return null
    }
  })

  ipcMain.handle('projection:remote-set-volume', async (_event, volume) => {
    try {
      return await remoteSetVolumeSource(volume)
    } catch (error) {
      console.error('[ipc] projection:remote-set-volume', error)
      return null
    }
  })

  ipcMain.handle('projection:get-source-media-info', () => {
    try {
      return getSourceMediaInfo()
    } catch (error) {
      console.error('[ipc] projection:get-source-media-info', error)
      return { filePath: '', title: '' }
    }
  })

  ipcMain.handle('projection:get-playback-state', async () => {
    try {
      return await getSourcePlaybackState()
    } catch (error) {
      console.error('[ipc] projection:get-playback-state', error)
      return null
    }
  })

  ipcMain.handle('projection:get-navigation-state', async () => {
    try {
      return await getSourceNavigationState()
    } catch (error) {
      console.error('[ipc] projection:get-navigation-state', error)
      return null
    }
  })

  ipcMain.handle('projection:remote-go-back', () => {
    try {
      return remoteGoBackSource()
    } catch (error) {
      console.error('[ipc] projection:remote-go-back', error)
      return false
    }
  })

  ipcMain.handle('projection:remote-go-forward', () => {
    try {
      return remoteGoForwardSource()
    } catch (error) {
      console.error('[ipc] projection:remote-go-forward', error)
      return false
    }
  })

  ipcMain.handle('projection:remote-reload', () => {
    try {
      return remoteReloadSource()
    } catch (error) {
      console.error('[ipc] projection:remote-reload', error)
      return false
    }
  })

  ipcMain.handle('projection:toggle-site-screens', () => {
    try {
      return toggleSiteProjectionScreens()
    } catch (error) {
      console.error('[ipc] projection:toggle-site-screens', error)
      return false
    }
  })

  ipcMain.handle('projection:toggle-video-screens', () => {
    try {
      return toggleVideoProjectionScreens()
    } catch (error) {
      console.error('[ipc] projection:toggle-video-screens', error)
      return false
    }
  })

  ipcMain.handle('projection:remote-image-next', async () => {
    try {
      return await remoteImageNext()
    } catch (error) {
      console.error('[ipc] projection:remote-image-next', error)
      return null
    }
  })

  ipcMain.handle('projection:remote-image-prev', async () => {
    try {
      return await remoteImagePrev()
    } catch (error) {
      console.error('[ipc] projection:remote-image-prev', error)
      return null
    }
  })

  ipcMain.handle('projection:get-image-slide-state', async () => {
    try {
      return await getImageSlideState()
    } catch (error) {
      console.error('[ipc] projection:get-image-slide-state', error)
      return null
    }
  })

  ipcMain.handle('projection:remote-pdf-next', async () => {
    try {
      return await remotePdfNext()
    } catch (error) {
      console.error('[ipc] projection:remote-pdf-next', error)
      return null
    }
  })

  ipcMain.handle('projection:remote-pdf-prev', async () => {
    try {
      return await remotePdfPrev()
    } catch (error) {
      console.error('[ipc] projection:remote-pdf-prev', error)
      return null
    }
  })

  ipcMain.handle('projection:get-pdf-page-state', async () => {
    try {
      return await getPdfPageState()
    } catch (error) {
      console.error('[ipc] projection:get-pdf-page-state', error)
      return null
    }
  })

  ipcMain.handle('projection:remote-ppt-next', async () => {
    try {
      return await remotePptNext()
    } catch (error) {
      console.error('[ipc] projection:remote-ppt-next', error)
      return null
    }
  })

  ipcMain.handle('projection:remote-ppt-prev', async () => {
    try {
      return await remotePptPrev()
    } catch (error) {
      console.error('[ipc] projection:remote-ppt-prev', error)
      return null
    }
  })

  ipcMain.handle('projection:capture-source-frame', async () => {
    try {
      return await captureSourceFrameBase64()
    } catch (error) {
      console.error('[ipc] projection:capture-source-frame', error)
      return null
    }
  })

  ipcMain.handle('projection:get-ppt-slide-state', async () => {
    try {
      return await getPptSlideState()
    } catch (error) {
      console.error('[ipc] projection:get-ppt-slide-state', error)
      return null
    }
  })

  ipcMain.handle('projection:get-site-target-monitors', () => {
    try {
      return getSiteTargetMonitorIds()
    } catch (error) {
      console.error('[ipc] projection:get-site-target-monitors', error)
      return []
    }
  })

  ipcMain.handle('projection:set-site-target-monitors', (_event, ids) => {
    try {
      return setSiteTargetMonitorIds(ids)
    } catch (error) {
      console.error('[ipc] projection:set-site-target-monitors', error)
      return false
    }
  })

  ipcMain.handle('projection:get-video-target-monitors', () => {
    try {
      return getVideoTargetMonitorIds()
    } catch (error) {
      console.error('[ipc] projection:get-video-target-monitors', error)
      return []
    }
  })

  ipcMain.handle('projection:set-video-target-monitors', (_event, ids) => {
    try {
      return setVideoTargetMonitorIds(ids)
    } catch (error) {
      console.error('[ipc] projection:set-video-target-monitors', error)
      return false
    }
  })

  ipcMain.handle('projection:set-site-control-panel-open', (_event, open) => {
    try {
      return setSiteControlPanelOpen(open)
    } catch (error) {
      console.error('[ipc] projection:set-site-control-panel-open', error)
      return false
    }
  })

  ipcMain.handle('workspace:get-record', (_event, filename) => {
    try {
      return readWorkspaceRecord(filename)
    } catch {
      return null
    }
  })

  ipcMain.handle('workspace:save-record', (_event, filename, data) => {
    try {
      return writeWorkspaceRecord(filename, data)
    } catch {
      return false
    }
  })

  ipcMain.handle('workspace:clear', (_event, options) => {
    try {
      return clearWorkspaceData(options ?? {})
    } catch (error) {
      console.error('[ipc] workspace:clear', error)
      return false
    }
  })

  // Download de arquivo remoto pra pasta Media/provai-e-vede/ (offline-first).
  // Retorna o caminho local absoluto ou null em falha.
  ipcMain.handle('workspace:download-to-media', async (_event, url, fileName) => {
    try {
      const { media } = getWorkspacePaths()
      const targetDir = path.join(media, 'provai-e-vede')
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
      const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
      const destPath = path.join(targetDir, safeName)
      const response = await net.fetch(String(url))
      if (!response.ok) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      await writeFile(destPath, buffer)
      return destPath
    } catch (error) {
      console.error('[ipc] workspace:download-to-media', error)
      return null
    }
  })

  ipcMain.handle('random:ensure-default-audio', () => {
    try {
      const { media } = getWorkspacePaths()
      const filePath = ensureSorteioDefaultAudio(media)
      return { ok: true, relativePath: 'modulos/sorteios/sorteio-default-piano.mp3', filePath }
    } catch (error) {
      console.error('[ipc] random:ensure-default-audio', error)
      return { ok: false }
    }
  })

  ipcMain.handle('random:import-audio', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title: 'Escolher áudio do sorteio',
        filters: [
          {
            name: 'Áudio',
            extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
          },
        ],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths?.[0]) {
        return { ok: false, reason: 'cancelled' }
      }
      const { media } = getWorkspacePaths()
      return importSorteioCustomAudio(media, result.filePaths[0])
    } catch (error) {
      console.error('[ipc] random:import-audio', error)
      return { ok: false, reason: 'error' }
    }
  })

  ipcMain.handle('random:delete-audio', (_event, fileName) => {
    try {
      const { media } = getWorkspacePaths()
      return deleteSorteioCustomAudio(media, fileName)
    } catch (error) {
      console.error('[ipc] random:delete-audio', error)
      return { ok: false, reason: 'error' }
    }
  })

  ipcMain.handle('catalog:download-database', async (event) => {
    try {
      return await downloadCatalogDatabase((data) => {
        event.sender.send('catalog:download-progress', data)
      })
    } catch (error) {
      console.error('[ipc] catalog:download-database', error)
      throw error
    }
  })

  ipcMain.handle('catalog:extract-database', async (event) => {
    try {
      return await extractCatalogDatabase((data) => {
        event.sender.send('catalog:extract-progress', data)
      })
    } catch (error) {
      console.error('[ipc] catalog:extract-database', error)
      throw error
    }
  })

  // Detector da instalação do LouvorJA Classo (Delphi) — issue #142
  ipcMain.handle('classo:detect', () => {
    try {
      return detectClassoInstallation({ registryProbe: probeClassoRegistry })
    } catch (error) {
      console.error('[ipc] classo:detect', error)
      return { found: false, root: null, media: { albums: [], totalBytes: 0 }, dataFiles: null }
    }
  })

  function legacyMediaAnalyzeOpts(selectedPath) {
    const picked =
      typeof selectedPath === 'string' && selectedPath.trim()
        ? selectedPath.trim()
        : ''
    if (picked) {
      const resolved = resolveLegacyMediaConfigFromSelection(picked)
      return {
        candidates: resolved ? [resolved] : [],
        registryConfigProbe: () => null,
      }
    }
    return {
      registryConfigProbe: () => {
        const root = probeClassoRegistry()
        if (!root) return null
        return root.replace(/[\\/]+$/, '') + '\\config'
      },
    }
  }

  ipcMain.handle('legacy-media:pick-folder', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title:
          'Selecione a pasta raiz do Louvor JA legado ou a pasta de mídia (config)',
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths?.[0]) return null
      return result.filePaths[0]
    } catch (error) {
      console.error('[ipc] legacy-media:pick-folder', error)
      return null
    }
  })

  // Pasta de mídia compartilhada (Windows): status / escolher / migrar
  ipcMain.handle('media-folder:status', () => {
    try {
      if (process.platform !== 'win32') {
        return { currentPath: '', defaultPath: '', isCustom: false }
      }
      return getWindowsMediaFolderStatus()
    } catch (error) {
      console.error('[ipc] media-folder:status', error)
      return { currentPath: '', defaultPath: '', isCustom: false }
    }
  })

  ipcMain.handle('media-folder:pick', async (event) => {
    try {
      if (process.platform !== 'win32') return null
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title: 'Selecione a pasta base (será criado LouvorJA-PIANO\\Media dentro dela)',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths?.[0]) return null
      return result.filePaths[0]
    } catch (error) {
      console.error('[ipc] media-folder:pick', error)
      return null
    }
  })

  ipcMain.handle('media-folder:migrate', (_event, targetPath) => {
    try {
      if (process.platform !== 'win32') {
        return { ok: false, path: null, reason: 'not-windows' }
      }
      return migrateWindowsMediaFolder(String(targetPath ?? ''))
    } catch (error) {
      console.error('[ipc] media-folder:migrate', error)
      return { ok: false, path: null, reason: 'error' }
    }
  })

  ipcMain.handle('backup:create', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const defaultName = buildBackupFileName()
      const result = await dialog.showSaveDialog(win ?? undefined, {
        title: 'Salvar backup do LouvorJA - PIANO',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      })
      if (result.canceled || !result.filePath) {
        return { ok: false, reason: 'cancelled' }
      }
      let destZip = result.filePath
      if (!destZip.toLowerCase().endsWith('.zip')) destZip = `${destZip}.zip`

      const paths = getWorkspacePaths()
      const sendProgress = (payload) => {
        try {
          if (!event.sender.isDestroyed()) event.sender.send('backup:progress', payload)
        } catch {
          /* ignore */
        }
      }
      sendProgress({ current: 0, total: 0, zipPath: destZip })
      let browserStorage = {}
      try {
        if (!event.sender.isDestroyed()) {
          browserStorage = await event.sender.executeJavaScript(
            buildLocalStorageSnapshotScript(),
            true,
          )
        }
      } catch (error) {
        console.warn('[ipc] backup localStorage snapshot', error)
      }
      await createAppBackupArchive({
        dataRoot: paths.root,
        mediaRoot: paths.media,
        mediaFolders: {
          covers: paths.covers,
          music: paths.music,
          images: paths.images,
        },
        destZip,
        onProgress: sendProgress,
        browserStorage: browserStorage && typeof browserStorage === 'object' ? browserStorage : {},
      })
      return { ok: true, path: destZip }
    } catch (error) {
      console.error('[ipc] backup:create', error)
      return { ok: false, reason: 'error' }
    }
  })

  ipcMain.handle('backup:restore', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title: 'Selecionar backup do LouvorJA - PIANO',
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths?.[0]) {
        return { ok: false, reason: 'cancelled' }
      }

      if (process.platform === 'win32') {
        writeWindowsMediaRootOverride(null)
      }

      const { root } = getWorkspacePaths()
      const sendProgress = (payload) => {
        try {
          if (!event.sender.isDestroyed()) event.sender.send('backup:progress', payload)
        } catch {
          /* ignore */
        }
      }
      sendProgress({ current: 0, total: 0, zipPath: result.filePaths[0] })
      await restoreAppBackupArchive({
        zipFile: result.filePaths[0],
        destRoot: root,
        onProgress: sendProgress,
      })
      const browserStorage = readRestoredBrowserStorage(root)
      if (browserStorage) {
        try {
          if (!event.sender.isDestroyed()) {
            await event.sender.executeJavaScript(
              buildLocalStorageRestoreScript(browserStorage),
              true,
            )
          }
        } catch (error) {
          console.warn('[ipc] backup localStorage restore', error)
        }
      }
      ensureWorkspaceDirectories()
      return { ok: true }
    } catch (error) {
      console.error('[ipc] backup:restore', error)
      return { ok: false, reason: 'error', message: String(error?.message || error) }
    }
  })

  // Importação de mídia do Louvor JA legado (Windows: config/capas|imagens|musicas)
  ipcMain.handle('legacy-media:analyze', (_event, selectedPath) => {
    try {
      const analysis = analyzeLegacyMediaImport(legacyMediaAnalyzeOpts(selectedPath))
      // Não serializa absolutePath de todos os itens na resposta leve — só
      // contagens. O import reanalisa no main.
      return {
        found: analysis.found,
        configDir: analysis.configDir,
        lang: analysis.lang,
        scanned: analysis.scanned,
        missing: analysis.missing,
        present: analysis.present,
        totalBytes: analysis.totalBytes,
        missingBytes: analysis.missingBytes,
        counts: analysis.counts,
      }
    } catch (error) {
      console.error('[ipc] legacy-media:analyze', error)
      return {
        found: false,
        configDir: null,
        lang: 'pt',
        scanned: 0,
        missing: 0,
        present: 0,
        totalBytes: 0,
        missingBytes: 0,
        counts: { covers: 0, music: 0, slides: 0 },
      }
    }
  })

  ipcMain.handle('legacy-media:import', async (event, selectedPath) => {
    try {
      const analysis = analyzeLegacyMediaImport(legacyMediaAnalyzeOpts(selectedPath))
      if (!analysis.found) {
        return { ok: false, imported: 0, skipped: 0, failed: 0, total: 0, reason: 'not-found' }
      }
      if (analysis.itemsToImport.length === 0) {
        return { ok: true, imported: 0, skipped: analysis.present, failed: 0, total: 0, reason: 'nothing-to-import' }
      }

      const result = importLegacyMediaItems(analysis.itemsToImport, (progress) => {
        event.sender.send('legacy-media:import-progress', progress)
      })
      return { ok: true, ...result, reason: 'done' }
    } catch (error) {
      console.error('[ipc] legacy-media:import', error)
      return { ok: false, imported: 0, skipped: 0, failed: 0, total: 0, reason: 'error' }
    }
  })

  ipcMain.handle('media:download', async (_event, url, mediaType, filename) => {
    try {
      return await downloadMediaFile(url, mediaType, filename)
    } catch (error) {
      console.error('[ipc] media:download', error)
      return false
    }
  })

  ipcMain.handle('media:check', (_event, mediaType, filename) => {
    return checkMediaFile(mediaType, filename)
  })

  ipcMain.handle('media:check-many', (_event, mediaType, filenames) => {
    return checkMediaFiles(mediaType, filenames)
  })

  ipcMain.handle('media:delete', (_event, mediaType, filename) => {
    return deleteMediaFile(mediaType, filename)
  })

  ipcMain.handle('media:probe-duration', async (_event, path) => {
    try {
      return await probeMediaDurationMsMain(String(path ?? ''))
    } catch (error) {
      console.error('[ipc] media:probe-duration', error)
      return 0
    }
  })

  // Player externo (app#177): preferência + play no player do usuário
  ipcMain.handle('external-player:get', () => getExternalPlayerPreference())
  ipcMain.handle('external-player:detect', () => detectInstalledPlayers())
  ipcMain.handle('external-player:list-custom', () => getCustomExternalPlayers())
  ipcMain.handle('external-player:set', (_event, player) =>
    setExternalPlayerPreference(String(player ?? 'associated')),
  )
  ipcMain.handle('external-player:remove-custom', (_event, binPath) =>
    removeCustomExternalPlayer(String(binPath ?? '')),
  )
  ipcMain.handle('external-player:play', async (_event, filePath, player) =>
    playInExternalPlayer(String(filePath ?? ''), player),
  )
}
