import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted } from 'vue'

import { useStartingStore } from '@modules/starting/stores/useStartingStore'
import {
  isBootstrapComplete,
  mapBootstrapError,
  markBootstrapComplete,
  prepareFreshInstall,
  syncEssentialCatalogFromApi,
  syncRemoteConfig,
} from '@modules/starting/services/bootstrap-service'
import {
  ensureAlbumCovers,
  startCoverBackgroundSync,
} from '@modules/starting/services/cover-background-sync'
import { startCatalogBackgroundRefresh } from '@modules/starting/services/catalog-refresh'
import {
  getDesktopBridge,
  isDesktopApp,
  isElectronShell,
} from '@shared/services/desktop-bridge'
import { isProjectionPopupLocation } from '@shared/services/projection-window-location'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dismissStaticHtmlSplash() {
  const staticSplash = document.getElementById('boot-splash')
  if (staticSplash) {
    staticSplash.hidden = true
  }
}

export function useAppBootstrap() {
  const store = useStartingStore()
  const {
    isVisible,
    showContent,
    isAppReady,
    progress,
    isFirstBoot,
    hasError,
    statusKey,
  } = storeToRefs(store)

  let warmInterval: ReturnType<typeof setInterval> | null = null

  function clearWarmInterval() {
    if (warmInterval) {
      clearInterval(warmInterval)
      warmInterval = null
    }
  }

  async function runWarmBoot() {
    store.phase = 'warming'
    store.isFirstBoot = false
    store.setStatus('starting.status.loading')
    store.setProgress(0)

    let step = 0
    await new Promise<void>((resolve) => {
      warmInterval = setInterval(() => {
        step += 1
        store.setProgress(Math.min(100, step * 6))
        if (step >= 17) {
          clearWarmInterval()
          store.setProgress(100)
          resolve()
        }
      }, 100)
    })

    await delay(300)
    store.hide()
    // Pré-aquece a Central de Mídia enquanto o usuário ainda não abriu a aba.
    void import('@modules/albums/stores/useAlbumsStore').then(({ useAlbumsStore }) => {
      void useAlbumsStore().hydrateCatalog()
    })
    // Capas faltantes em background — sem atrasar a UI.
    window.setTimeout(() => {
      void startCoverBackgroundSync()
    }, 800)
    // Cache de categorias cura em background; não toca o bootstrap retomável (#337).
    window.setTimeout(() => {
      void startCatalogBackgroundRefresh()
    }, 1200)
  }

  async function runFirstBoot() {
    store.revealOverlay()
    store.phase = 'preparing'
    store.isFirstBoot = true
    store.resetError()
    store.setProgress(0)
    store.setStatus('starting.status.preparingInstall')

    await prepareFreshInstall()

    store.phase = 'fetching-config'
    store.setStatus('starting.status.preparing')
    await syncRemoteConfig()

    store.phase = 'downloading'
    store.setStatus('starting.status.downloading')
    store.setProgress(0)

    await syncEssentialCatalogFromApi((value) => {
      store.phase = 'downloading'
      store.setStatus('starting.status.downloading')
      store.setProgress(value)
    })

    store.phase = 'syncing-covers'
    store.setStatus('starting.status.syncingCovers')
    store.setProgress(0)
    await ensureAlbumCovers({
      skipIfSynced: false,
      onProgress: (value) => {
        store.phase = 'syncing-covers'
        store.setStatus('starting.status.syncingCovers')
        store.setProgress(value)
      },
    })

    store.setProgress(100)
    store.setStatus('starting.status.done')
    await markBootstrapComplete()
    await delay(1000)
    window.location.reload()
  }

  async function startBootstrap() {
    dismissStaticHtmlSplash()

    // Janela de projeção: nunca mostra boot (legado FirstBootLoader).
    if (isProjectionPopupLocation()) {
      store.hide()
      return
    }

    store.revealOverlay()

    // Browser puro: splash breve e libera o app.
    if (!isElectronShell()) {
      store.setStatus('starting.status.loading')
      store.setProgress(100)
      await delay(400)
      store.hide()
      return
    }

    // Shell Electron sem preload/bridge — mantém splash com erro (não esconde).
    if (!isDesktopApp() || !getDesktopBridge()) {
      store.markError('starting.status.bridgeMissing')
      return
    }

    store.phase = 'checking'
    store.setStatus('starting.status.booting')

    const complete = await isBootstrapComplete()
    if (!complete) {
      await runFirstBoot()
      return
    }

    await runWarmBoot()
  }

  async function retryBootstrap() {
    store.resetError()
    store.setProgress(0)
    store.setStatus('starting.status.retry')
    try {
      if (!isDesktopApp() || !getDesktopBridge()) {
        store.markError('starting.status.bridgeMissing')
        return
      }
      await runFirstBoot()
    } catch (error) {
      console.error('[starting] erro na sincronização inicial', error)
      store.markError(mapBootstrapError(error))
    }
  }

  async function checkAndBootstrap() {
    try {
      await startBootstrap()
    } catch (error) {
      console.error('[starting] erro no bootstrap', error)
      if (isProjectionPopupLocation()) {
        store.hide()
        return
      }
      store.revealOverlay()
      store.markError(mapBootstrapError(error))
    }
  }

  onMounted(() => {
    dismissStaticHtmlSplash()
    if (isProjectionPopupLocation()) {
      store.hide()
      return
    }
    store.revealOverlay()
    void checkAndBootstrap()
  })

  onUnmounted(() => {
    clearWarmInterval()
  })

  return {
    isVisible,
    showContent,
    isAppReady,
    progress,
    isFirstBoot,
    hasError,
    statusKey,
    retryBootstrap,
  }
}
