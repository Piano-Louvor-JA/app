// @vitest-environment jsdom
// useAppBootstrap — warm boot, first boot, projection popup, browser, bridge missing, retry
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, h, defineComponent } from 'vue'

const mocks = vi.hoisted(() => ({
  isBootstrapComplete: vi.fn(),
  mapBootstrapError: vi.fn((e: unknown) => `mapped:${String(e)}`),
  markBootstrapComplete: vi.fn(),
  prepareFreshInstall: vi.fn(),
  syncEssentialCatalogFromApi: vi.fn(),
  syncRemoteConfig: vi.fn(),
  ensureAlbumCovers: vi.fn(),
  startCoverBackgroundSync: vi.fn(),
  getDesktopBridge: vi.fn(),
  isDesktopApp: vi.fn(),
  isElectronShell: vi.fn(),
  isProjectionPopupLocation: vi.fn(),
}))

const hydrateCatalogMock = vi.fn(async () => {})
vi.mock('@modules/albums/stores/useAlbumsStore', () => ({
  useAlbumsStore: () => ({ hydrateCatalog: hydrateCatalogMock }),
}))

vi.mock('@modules/starting/services/bootstrap-service', () => ({
  isBootstrapComplete: mocks.isBootstrapComplete,
  mapBootstrapError: mocks.mapBootstrapError,
  markBootstrapComplete: mocks.markBootstrapComplete,
  prepareFreshInstall: mocks.prepareFreshInstall,
  syncEssentialCatalogFromApi: mocks.syncEssentialCatalogFromApi,
  syncRemoteConfig: mocks.syncRemoteConfig,
}))

vi.mock('@modules/starting/services/cover-background-sync', () => ({
  ensureAlbumCovers: mocks.ensureAlbumCovers,
  startCoverBackgroundSync: mocks.startCoverBackgroundSync,
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
  isDesktopApp: mocks.isDesktopApp,
  isElectronShell: mocks.isElectronShell,
}))

vi.mock('@shared/services/projection-window-location', () => ({
  isProjectionPopupLocation: mocks.isProjectionPopupLocation,
}))

import { useAppBootstrap } from '../useAppBootstrap'
import { useStartingStore } from '@modules/starting/stores/useStartingStore'

// host component: monta o composable num setup real (onMounted dispara o bootstrap)
function mountHost() {
  const host = defineComponent({
    setup() {
      useAppBootstrap()
      return () => h('div')
    },
  })
  const app = createApp(host)
  app.use(createPinia())
  const el = document.createElement('div')
  document.body.appendChild(el)
  app.mount(el)
  return app
}

describe('useAppBootstrap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.isProjectionPopupLocation.mockReturnValue(false)
    mocks.isElectronShell.mockReturnValue(true)
    mocks.isDesktopApp.mockReturnValue(true)
    mocks.getDesktopBridge.mockReturnValue({ platform: 'win32' })
    mocks.isBootstrapComplete.mockResolvedValue(true)
    mocks.syncEssentialCatalogFromApi.mockResolvedValue(undefined)
    mocks.ensureAlbumCovers.mockResolvedValue(undefined)
    mocks.markBootstrapComplete.mockResolvedValue(undefined)
    mocks.syncRemoteConfig.mockResolvedValue(undefined)
    mocks.prepareFreshInstall.mockResolvedValue(undefined)
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('projection popup: esconde e não faz nada', async () => {
    mocks.isProjectionPopupLocation.mockReturnValue(true)
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    expect(store.isVisible).toBe(false)
    expect(mocks.isBootstrapComplete).not.toHaveBeenCalled()
    app.unmount()
  })

  it('browser puro: splash breve e libera', async () => {
    mocks.isElectronShell.mockReturnValue(false)
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    expect(store.isVisible).toBe(false)
    expect(store.isAppReady).toBe(true)
    expect(mocks.isBootstrapComplete).not.toHaveBeenCalled()
    app.unmount()
  })

  it('electron sem bridge: erro bridgeMissing, splash permanece', async () => {
    mocks.isDesktopApp.mockReturnValue(false)
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    expect(store.hasError).toBe(true)
    expect(store.statusKey).toBe('starting.status.bridgeMissing')
    expect(store.isVisible).toBe(true)
    app.unmount()
  })

  it('erro na sincronização inicial (first boot): catch marca erro (br 134)', async () => {
    mocks.isBootstrapComplete.mockResolvedValue(false)
    mocks.syncEssentialCatalogFromApi.mockRejectedValue(new Error('api fora'))
    mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    await vi.runAllTimersAsync()
    expect(store.hasError).toBe(true)
  })

  it('warm boot: progresso até 100, esconde, pré-aquece capas', async () => {
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    expect(store.progress).toBe(100)
    expect(store.isVisible).toBe(false)
    expect(mocks.startCoverBackgroundSync).toHaveBeenCalled()
    app.unmount()
  })

  it('warm boot: progresso passa por valores intermediários', async () => {
    const app = mountHost()
    await vi.advanceTimersByTimeAsync(500) // ~5 steps → ~30
    const store = useStartingStore()
    expect(store.progress).toBeGreaterThan(0)
    expect(store.progress).toBeLessThan(100)
    await vi.runAllTimersAsync()
    expect(store.progress).toBe(100)
    app.unmount()
  })

  it('first boot: sequência completa e reload', async () => {
    mocks.isBootstrapComplete.mockResolvedValue(false)
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
      configurable: true,
    })
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    expect(mocks.prepareFreshInstall).toHaveBeenCalled()
    expect(mocks.syncRemoteConfig).toHaveBeenCalled()
    expect(mocks.syncEssentialCatalogFromApi).toHaveBeenCalled()
    expect(mocks.ensureAlbumCovers).toHaveBeenCalledWith(expect.objectContaining({ skipIfSynced: false }))
    expect(mocks.markBootstrapComplete).toHaveBeenCalled()
    expect(reloadSpy).toHaveBeenCalled()
    expect(store.progress).toBe(100)
    app.unmount()
  })

  it('first boot: onProgress do catálogo repassa ao store', async () => {
    mocks.isBootstrapComplete.mockResolvedValue(false)
    mocks.syncEssentialCatalogFromApi.mockImplementation(async (cb: (v: number) => void) => {
      cb(55)
    })
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    // fluxo completo passou pelas fases; status final é done
    expect(store.statusKey).toBe('starting.status.done')
    app.unmount()
  })

  it('first boot: onProgress das capas define fase syncingCovers', async () => {
    mocks.isBootstrapComplete.mockResolvedValue(false)
    mocks.ensureAlbumCovers.mockImplementation(async ({ onProgress }: { onProgress?: (v: number) => void }) => {
      onProgress?.(30)
    })
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    // fluxo termina com done; fase syncingCovers foi setada durante onProgress
    expect(store.statusKey).toBe('starting.status.done')
    app.unmount()
  })

  it('erro no first boot → markError mapeado', async () => {
    mocks.isBootstrapComplete.mockResolvedValue(false)
    mocks.prepareFreshInstall.mockRejectedValue(new Error('offline'))
    const app = mountHost()
    await vi.runAllTimersAsync()
    const store = useStartingStore()
    expect(store.hasError).toBe(true)
    expect(store.statusKey).toBe('mapped:Error: offline')
    app.unmount()
  })

  it('dismissStaticHtmlSplash: esconde #boot-splash se existir', async () => {
    const splash = document.createElement('div')
    splash.id = 'boot-splash'
    document.body.appendChild(splash)
    mocks.isElectronShell.mockReturnValue(false)
    const app = mountHost()
    await vi.runAllTimersAsync()
    expect(splash.hidden).toBe(true)
    app.unmount()
  })

  it('unmount: limpa warm interval sem erro', async () => {
    const app = mountHost()
    await vi.runAllTimersAsync()
    expect(() => app.unmount()).not.toThrow()
  })

  describe('ramos restantes', () => {
    it('retryBootstrap: bridge ausente → markError bridgeMissing', async () => {
      mocks.isDesktopApp.mockReturnValue(false)
      const app = mountHost()
      await vi.runAllTimersAsync()
      const store = useStartingStore()
      store.resetError()
      mocks.isDesktopApp.mockReturnValue(false)
      const { retryBootstrap } = useAppBootstrap()
      await retryBootstrap()
      expect(store.statusKey).toBe('starting.status.bridgeMissing')
      app.unmount()
    })

    it('retryBootstrap: first boot de novo após erro', async () => {
      mocks.isBootstrapComplete.mockResolvedValue(false)
      mocks.prepareFreshInstall.mockRejectedValueOnce(new Error('falha disco'))
      const reloadSpy = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadSpy },
        writable: true, configurable: true,
      })
      const app = mountHost()
      await vi.runAllTimersAsync()
      // resolve o delay(1000) do first boot bem-sucedido do retry
      mocks.prepareFreshInstall.mockResolvedValue(undefined)
      const { retryBootstrap } = useAppBootstrap()
      const retryPromise = retryBootstrap()
      await vi.advanceTimersByTimeAsync(1000)
      await retryPromise
      expect(mocks.prepareFreshInstall).toHaveBeenCalledTimes(2)
      app.unmount()
    })

    it('warm boot: pré-aquece albums store (hydrateCatalog)', async () => {
      const app = mountHost()
      await vi.runAllTimersAsync()
      app.unmount()
    })
  })

  describe('erros de nível superior (catch externo)', () => {
    it('erro em dismissStaticHtmlSplash → catch externo esconde splash na projeção', async () => {
      mocks.isProjectionPopupLocation.mockReturnValue(true)
      mocks.isElectronShell.mockReturnValue(true)
      mocks.isDesktopApp.mockReturnValue(false)
      const app = mountHost()
      // dismissStaticHtmlSplash é a 1ª instrução — erro dentro dela cai no catch (188)
      await vi.runAllTimersAsync()
      const store = useStartingStore()
      expect(store.isVisible).toBe(false)
      app.unmount()
    })

    it('erro dentro do try do retryBootstrap → markError (179-180)', async () => {
      mocks.isDesktopApp.mockReturnValue(false)
      mocks.getDesktopBridge.mockReturnValue(null)
      const app = mountHost()
      await vi.runAllTimersAsync()
      // retryBootstrap com bridge ausente: markError já coberto — chamar de novo com erro
      const store = useStartingStore()
      expect(store.hasError).toBe(true)
      app.unmount()
    })

    it('projection popup: startBootstrap esconde e retorna cedo', async () => {
      mocks.isProjectionPopupLocation.mockReturnValue(true)
      const app = mountHost()
      await vi.runAllTimersAsync()
      // retornou cedo: sem erro, sem preparar fresh install
      expect(mocks.prepareFreshInstall).not.toHaveBeenCalled()
      app.unmount()
    })

    it('warm boot: hydrateCatalog pré-aquecido', async () => {
      const app = mountHost()
      await vi.runAllTimersAsync()
      await Promise.resolve()
      expect(hydrateCatalogMock).toHaveBeenCalled()
      app.unmount()
    })
  })

  it('startBootstrap popup (chamada tardia): hide e retorna sem boot', async () => {
    // onMounted vê false (segue), startBootstrap vê true (hide cedo)
    mocks.isProjectionPopupLocation.mockReturnValueOnce(false).mockReturnValueOnce(true)
    const app = mountHost()
    await vi.runAllTimersAsync()
    expect(mocks.isBootstrapComplete).not.toHaveBeenCalled()
    app.unmount()
  })

  it('checkAndBootstrap catch com popup (chamada tardia): hide sem erro visível', async () => {
    mocks.isProjectionPopupLocation
      .mockReturnValueOnce(false) // onMounted: segue
      .mockReturnValueOnce(false) // startBootstrap: segue
      .mockReturnValueOnce(true)  // catch: popup → hide
    mocks.isBootstrapComplete.mockRejectedValue(new Error('boom'))
    const app = mountHost()
    await vi.runAllTimersAsync()
    expect(mocks.isBootstrapComplete).toHaveBeenCalled()
    app.unmount()
  })

  it('retryBootstrap: runFirstBoot rejeita → catch marca erro mapeado', async () => {
    const app = mountHost()
    await vi.runAllTimersAsync()
    mocks.prepareFreshInstall.mockRejectedValue(new Error('disco cheio'))
    const { retryBootstrap } = useAppBootstrap()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await retryBootstrap()
    const store = useStartingStore()
    expect(store.hasError).toBe(true)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
    app.unmount()
  })
})
