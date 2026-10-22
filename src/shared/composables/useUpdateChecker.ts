import { ref } from 'vue'

export interface UpdateInfo {
  available: boolean
  version: string | null
  releaseNotes: string | null
  progress: number
  downloaded: boolean
  error: string | null
}

interface ElectronUpdaterAPI {
  check: () => Promise<{ available: boolean; version?: string; releaseNotes?: string; manualInstall?: boolean }>
  download: () => Promise<{ success: boolean; error?: string; manual?: boolean }>
  install: () => void
  onAvailable: (cb: (_: unknown, data: { version: string; releaseNotes: string; manualInstall?: boolean }) => void) => void
  onProgress: (cb: (_: unknown, data: { progress: number }) => void) => void
  onDownloaded: (cb: () => void) => void
  onError: (cb: (_: unknown, data: { message: string }) => void) => void
}

interface ElectronAPI {
  louvorja?: {
    updater?: ElectronUpdaterAPI
  }
}

/**
 * Lê o electronAPI do window de forma type-safe.
 * Retorna undefined em browser (web) ou quando preload não expõe.
 */
function getElectronUpdaterAPI(): ElectronUpdaterAPI | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as ElectronAPI
  return w.louvorja?.updater
}

function createUpdateState() {
  const hasUpdate = ref(false)
  const manualInstall = ref(false)
  const newVersion = ref<string | null>(null)
  const releaseNotes = ref<string | null>(null)
  const downloadProgress = ref(0)
  const isDownloading = ref(false)
  const isDownloaded = ref(false)
  const error = ref<string | null>(null)
  const isChecking = ref(false)
  const hasChecked = ref(false)
  const dismissed = ref(
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('update-dismissed') === 'true',
  )

  function dismiss() {
    dismissed.value = true
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('update-dismissed', 'true')
    }
  }

  function reset() {
    hasUpdate.value = false
    manualInstall.value = false
    newVersion.value = null
    releaseNotes.value = null
    downloadProgress.value = 0
    isDownloading.value = false
    isDownloaded.value = false
    error.value = null
    isChecking.value = false
    hasChecked.value = false
    dismissed.value =
      typeof sessionStorage !== 'undefined' && sessionStorage.getItem('update-dismissed') === 'true'
  }

  return {
    hasUpdate,
    manualInstall,
    newVersion,
    releaseNotes,
    downloadProgress,
    isDownloading,
    isDownloaded,
    error,
    isChecking,
    hasChecked,
    dismissed,
    dismiss,
    reset,
  }
}

/**
 * Estado global singleton — compartilhado entre todas as chamadas
 * do composable. Garante que App.vue (init), UpdateBanner (display)
 * e UpdateDialog (download/install) operem sobre o mesmo estado.
 */
const state = createUpdateState()

/**
 * Composable que gerencia o ciclo de atualização do Electron.
 * Escuta IPC events do main process e expõe estado reativo.
 * Usa estado global para todas as instâncias compartilharem.
 */
export function useUpdateChecker() {
  function getAPI(): ElectronUpdaterAPI | undefined {
    return getElectronUpdaterAPI()
  }

  async function checkForUpdates() {
    const api = getAPI()
    if (!api) {
      state.hasChecked.value = true
      return
    }

    state.isChecking.value = true
    state.error.value = null

    try {
      const result = await api.check()
      state.hasChecked.value = true
      if (result.available) {
        state.hasUpdate.value = true
        state.newVersion.value = result.version ?? null
        state.releaseNotes.value = result.releaseNotes ?? null
        state.manualInstall.value = result.manualInstall === true
      }
    } catch {
      state.hasChecked.value = true
      state.error.value = 'Falha ao verificar atualizações'
    } finally {
      state.isChecking.value = false
    }
  }

  async function downloadUpdate() {
    if (!state.hasUpdate.value) return

    const api = getAPI()
    if (!api) return

    state.isDownloading.value = true
    state.error.value = null

    try {
      const result = await api.download()
      if (result.success && result.manual) {
        state.manualInstall.value = true
        state.isDownloading.value = false
        return
      }
      if (!result.success) {
        const msg = result.error || ''
        if (msg.includes('404')) {
          state.hasUpdate.value = false
          state.newVersion.value = null
          state.releaseNotes.value = null
          state.dismissed.value = true
        } else {
          state.error.value = 'Não foi possível baixar a atualização. Tente novamente mais tarde.'
        }
        state.isDownloading.value = false
      }
    } catch {
      state.error.value = 'Falha no download. Verifique sua conexão.'
      state.isDownloading.value = false
    }
  }

  function installUpdate() {
    if (!state.isDownloaded.value) return
    getAPI()?.install()
  }

  /** Registra IPC listeners. Chamar dentro de onMounted/setup. */
  function init() {
    const api = getAPI()
    if (!api) return

    api.onAvailable((_, data) => {
      state.hasUpdate.value = true
      state.newVersion.value = data.version
      state.releaseNotes.value = data.releaseNotes
      state.manualInstall.value = data.manualInstall === true
    })

    api.onProgress((_, data) => {
      state.downloadProgress.value = data.progress
    })

    api.onDownloaded(() => {
      state.isDownloading.value = false
      state.isDownloaded.value = true
      state.downloadProgress.value = 100
    })

    api.onError((_, data) => {
      const msg = data.message || ''

      // Erro 404 = release não encontrada (foi removida ou ainda não publicada)
      if (msg.includes('404')) {
        state.hasUpdate.value = false
        state.newVersion.value = null
        state.releaseNotes.value = null
        state.error.value = null
        state.isDownloading.value = false
        state.dismissed.value = true
        return
      }

      // Traduz erros comuns do electron-updater
      if (msg.includes('Cannot download') || msg.includes('net::ERR')) {
        state.error.value = 'Não foi possível baixar a atualização. Verifique sua conexão com a internet.'
      } else if (msg.includes('signature') || msg.includes('verification')) {
        state.error.value = 'A atualização não pôde ser verificada. Tente novamente mais tarde.'
      } else if (msg.includes('permission') || msg.includes('EACCES')) {
        state.error.value = 'Permissão negada. Execute o aplicativo como administrador.'
      } else {
        state.error.value = 'Falha na atualização. Tente novamente mais tarde.'
      }

      state.isDownloading.value = false
    })

    setTimeout(checkForUpdates, 3000)
  }

  return {
    ...state,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    init,
  }
}
