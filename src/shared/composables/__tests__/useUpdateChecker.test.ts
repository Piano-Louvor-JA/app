// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateChecker } from '../useUpdateChecker'

// Mock electronAPI global
const mockUpdater = {
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  onAvailable: vi.fn(),
  onProgress: vi.fn(),
  onDownloaded: vi.fn(),
  onError: vi.fn(),
}

describe('useUpdateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    sessionStorage.clear()
    ;(window as any).louvorja = { updater: mockUpdater }
    // Resetar estado global do singleton entre testes
    const { reset } = useUpdateChecker()
    reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as any).louvorja
  })

  describe('estado inicial', () => {
    it('começa sem update e não dismissed', () => {
      const { hasUpdate, dismissed, newVersion, downloadProgress, error, isDownloading, isDownloaded } = useUpdateChecker()
      expect(hasUpdate.value).toBe(false)
      expect(dismissed.value).toBe(false)
      expect(newVersion.value).toBeNull()
      expect(downloadProgress.value).toBe(0)
      expect(isDownloading.value).toBe(false)
      expect(isDownloaded.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('começa dismissed se sessionStorage tem flag', () => {
      sessionStorage.setItem('update-dismissed', 'true')
      const { reset, dismissed } = useUpdateChecker()
      reset() // relê sessionStorage após setar flag
      expect(dismissed.value).toBe(true)
    })
  })

  describe('dismiss', () => {
    it('marca dismissed=true e salva no sessionStorage', () => {
      const { dismissed, dismiss } = useUpdateChecker()
      expect(dismissed.value).toBe(false)
      dismiss()
      expect(dismissed.value).toBe(true)
      expect(sessionStorage.getItem('update-dismissed')).toBe('true')
    })

    it('dismiss não falha sem sessionStorage (branch typeof)', () => {
      const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        get: () => undefined,
      })
      try {
        const { dismissed, dismiss } = useUpdateChecker()
        dismiss()
        expect(dismissed.value).toBe(true)
      } finally {
        if (original) Object.defineProperty(window, 'sessionStorage', original)
      }
      expect(sessionStorage.getItem('update-dismissed')).toBeNull()
    })
  })

  describe('checkForUpdates', () => {
    it('seta hasUpdate=true quando há versão disponível', async () => {
      mockUpdater.check.mockResolvedValue({
        available: true,
        version: '2.0.0',
        releaseNotes: '## Mudanças',
      })
      const { hasUpdate, newVersion, releaseNotes, checkForUpdates } = useUpdateChecker()
      await checkForUpdates()
      expect(hasUpdate.value).toBe(true)
      expect(newVersion.value).toBe('2.0.0')
      expect(releaseNotes.value).toBe('## Mudanças')
    })

    it('mantém hasUpdate=false quando não há versão', async () => {
      mockUpdater.check.mockResolvedValue({ available: false })
      const { hasUpdate, checkForUpdates } = useUpdateChecker()
      await checkForUpdates()
      expect(hasUpdate.value).toBe(false)
    })

    it('define error quando IPC falha (mostra erro para o usuário)', async () => {
      mockUpdater.check.mockRejectedValue(new Error('network'))
      const { hasUpdate, error, checkForUpdates } = useUpdateChecker()
      await checkForUpdates()
      expect(hasUpdate.value).toBe(false)
      expect(error.value).not.toBeNull()
    })

    it('não chama IPC quando electronAPI não existe', async () => {
      delete (window as any).louvorja
      const { checkForUpdates } = useUpdateChecker()
      await checkForUpdates()
      expect(mockUpdater.check).not.toHaveBeenCalled()
    })

    it('seta releaseNotes=null quando resultado available mas sem releaseNotes', async () => {
      mockUpdater.check.mockResolvedValue({ available: true, version: '2.0.0' })
      const { releaseNotes, checkForUpdates } = useUpdateChecker()
      await checkForUpdates()
      expect(releaseNotes.value).toBeNull()
    })

    it('seta version=null quando resultado available mas sem version', async () => {
      mockUpdater.check.mockResolvedValue({ available: true })
      const { newVersion, checkForUpdates } = useUpdateChecker()
      await checkForUpdates()
      expect(newVersion.value).toBeNull()
    })
  })

  describe('downloadUpdate', () => {
    it('chama IPC download quando hasUpdate=true', async () => {
      mockUpdater.check.mockResolvedValue({
        available: true,
        version: '2.0.0',
        releaseNotes: '',
      })
      mockUpdater.download.mockResolvedValue({ success: true })
      const { checkForUpdates, downloadUpdate, isDownloading } = useUpdateChecker()
      await checkForUpdates()
      await downloadUpdate()
      expect(mockUpdater.download).toHaveBeenCalled()
      expect(isDownloading.value).toBe(true)
    })

    it('não chama download quando hasUpdate=false', async () => {
      mockUpdater.check.mockResolvedValue({ available: false })
      const { checkForUpdates, downloadUpdate } = useUpdateChecker()
      await checkForUpdates()
      await downloadUpdate()
      expect(mockUpdater.download).not.toHaveBeenCalled()
    })

    it('seta error quando download retorna falha', async () => {
      mockUpdater.check.mockResolvedValue({
        available: true,
        version: '2.0.0',
        releaseNotes: '',
      })
      mockUpdater.download.mockResolvedValue({ success: false, error: 'Falha no download' })
      const { checkForUpdates, downloadUpdate, error, isDownloading } = useUpdateChecker()
      await checkForUpdates()
      await downloadUpdate()
      expect(error.value).toBe('Não foi possível baixar a atualização. Tente novamente mais tarde.')
      expect(isDownloading.value).toBe(false)
    })

    it('seta error quando download falha sem mensagem', async () => {
      mockUpdater.check.mockResolvedValue({
        available: true,
        version: '2.0.0',
        releaseNotes: '',
      })
      mockUpdater.download.mockResolvedValue({ success: false })
      const { checkForUpdates, downloadUpdate, error } = useUpdateChecker()
      await checkForUpdates()
      await downloadUpdate()
      expect(error.value).toBe('Não foi possível baixar a atualização. Tente novamente mais tarde.')
    })

    it('esconde update (dismissed) quando download falha com 404', async () => {
      mockUpdater.check.mockResolvedValue({
        available: true,
        version: '2.0.0',
        releaseNotes: '',
      })
      mockUpdater.download.mockResolvedValue({ success: false, error: 'Request failed: 404' })
      const { checkForUpdates, downloadUpdate, hasUpdate, dismissed, newVersion, error } = useUpdateChecker()
      await checkForUpdates()
      await downloadUpdate()
      expect(hasUpdate.value).toBe(false)
      expect(newVersion.value).toBeNull()
      expect(dismissed.value).toBe(true)
      expect(error.value).toBeNull()
    })

    it('seta error quando download throw exception', async () => {
      mockUpdater.check.mockResolvedValue({
        available: true,
        version: '2.0.0',
        releaseNotes: '',
      })
      mockUpdater.download.mockRejectedValue(new Error('crash'))
      const { checkForUpdates, downloadUpdate, error, isDownloading } = useUpdateChecker()
      await checkForUpdates()
      await downloadUpdate()
      expect(error.value).toBe('Falha no download. Verifique sua conexão.')
      expect(isDownloading.value).toBe(false)
    })

    it('não chama download quando electronAPI não existe', async () => {
      delete (window as any).louvorja
      const { downloadUpdate } = useUpdateChecker()
      await downloadUpdate()
      expect(mockUpdater.download).not.toHaveBeenCalled()
    })
  })

  describe('installUpdate', () => {
    it('chama IPC install quando downloaded=true', () => {
      const result = useUpdateChecker()
      result.isDownloaded.value = true
      result.installUpdate()
      expect(mockUpdater.install).toHaveBeenCalled()
    })

    it('não chama install quando downloaded=false', () => {
      const { installUpdate } = useUpdateChecker()
      installUpdate()
      expect(mockUpdater.install).not.toHaveBeenCalled()
    })

    it('não chama install quando electronAPI não existe', () => {
      delete (window as any).louvorja
      const result = useUpdateChecker()
      result.isDownloaded.value = true
      result.installUpdate()
      expect(mockUpdater.install).not.toHaveBeenCalled()
    })
  })

  describe('init (IPC listeners)', () => {
    it('registra 4 listeners quando electronAPI existe', () => {
      const { init } = useUpdateChecker()
      init()
      expect(mockUpdater.onAvailable).toHaveBeenCalledOnce()
      expect(mockUpdater.onProgress).toHaveBeenCalledOnce()
      expect(mockUpdater.onDownloaded).toHaveBeenCalledOnce()
      expect(mockUpdater.onError).toHaveBeenCalledOnce()
    })

    it('não registra listeners quando electronAPI não existe', () => {
      delete (window as any).louvorja
      const { init } = useUpdateChecker()
      init()
      expect(mockUpdater.onAvailable).not.toHaveBeenCalled()
    })

    it('onAvailable callback seta hasUpdate, version e releaseNotes', () => {
      const { init, hasUpdate, newVersion, releaseNotes } = useUpdateChecker()
      init()
      const cb = mockUpdater.onAvailable.mock.calls[0][0]
      cb(null, { version: '3.0.0', releaseNotes: '## Nova versão' })
      expect(hasUpdate.value).toBe(true)
      expect(newVersion.value).toBe('3.0.0')
      expect(releaseNotes.value).toBe('## Nova versão')
    })

    it('onProgress callback seta downloadProgress', () => {
      const { init, downloadProgress } = useUpdateChecker()
      init()
      const cb = mockUpdater.onProgress.mock.calls[0][0]
      cb(null, { progress: 75 })
      expect(downloadProgress.value).toBe(75)
    })

    it('onDownloaded callback seta isDownloaded=true e isDownloading=false', () => {
      const { init, isDownloaded, isDownloading, downloadProgress } = useUpdateChecker()
      init()
      const cb = mockUpdater.onDownloaded.mock.calls[0][0]
      cb()
      expect(isDownloaded.value).toBe(true)
      expect(isDownloading.value).toBe(false)
      expect(downloadProgress.value).toBe(100)
    })

    it('traduz erro de rede do electron-updater (Cannot download)', () => {
      const { init, error } = useUpdateChecker()
      init()
      const cb = mockUpdater.onError.mock.calls[0][0]
      cb(null, { message: 'Cannot download update from https://...' })
      expect(error.value).toBe('Não foi possível baixar a atualização. Verifique sua conexão com a internet.')
    })

    it('traduz erro net::ERR do electron-updater', () => {
      const { init, error } = useUpdateChecker()
      init()
      const cb = mockUpdater.onError.mock.calls[0][0]
      cb(null, { message: 'net::ERR_INTERNET_DISCONNECTED' })
      expect(error.value).toBe('Não foi possível baixar a atualização. Verifique sua conexão com a internet.')
    })

    it('traduz erro de assinatura/verificação do electron-updater', () => {
      const { init, error } = useUpdateChecker()
      init()
      const cb = mockUpdater.onError.mock.calls[0][0]
      cb(null, { message: 'signature verification failed' })
      expect(error.value).toBe('A atualização não pôde ser verificada. Tente novamente mais tarde.')
    })

    it('traduz erro de permissão do electron-updater', () => {
      const { init, error } = useUpdateChecker()
      init()
      const cb = mockUpdater.onError.mock.calls[0][0]
      cb(null, { message: 'EACCES: permission denied' })
      expect(error.value).toBe('Permissão negada. Execute o aplicativo como administrador.')
    })

    it('onError com data.message undefined usa fallback vazio (erro genérico)', () => {
      const { init, error } = useUpdateChecker()
      init()
      const cb = mockUpdater.onError.mock.calls[0][0]
      cb(null, {})
      expect(error.value).toBe('Falha na atualização. Tente novamente mais tarde.')
    })

    it('onError callback seta error traduzido e isDownloading=false', () => {
      const { init, error, isDownloading } = useUpdateChecker()
      init()
      const cb = mockUpdater.onError.mock.calls[0][0]
      cb(null, { message: 'Erro XPTO' })
      expect(error.value).toBe('Falha na atualização. Tente novamente mais tarde.')
      expect(isDownloading.value).toBe(false)
    })

    it('onError callback com 404 esconde update (release removida)', () => {
      const { init, hasUpdate, newVersion, error } = useUpdateChecker()
      init()
      // Simula update-available primeiro
      const availCb = mockUpdater.onAvailable.mock.calls[0][0]
      availCb(null, { version: '9.9.9', releaseNotes: 'test' })
      expect(hasUpdate.value).toBe(true)
      // Depois erro 404
      const errCb = mockUpdater.onError.mock.calls[0][0]
      errCb(null, { message: 'Cannot download update: 404' })
      expect(hasUpdate.value).toBe(false)
      expect(newVersion.value).toBeNull()
      expect(error.value).toBeNull()
    })

    it('init dispara checkForUpdates após 3s (timer)', () => {
      mockUpdater.check.mockResolvedValue({ available: false })
      const { init } = useUpdateChecker()
      init()
      expect(mockUpdater.check).not.toHaveBeenCalled()
      vi.advanceTimersByTime(3000)
      expect(mockUpdater.check).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('reseta todo o estado', () => {
      const result = useUpdateChecker()
      result.hasUpdate.value = true
      result.newVersion.value = '5.0.0'
      result.error.value = 'erro'
      result.isDownloading.value = true
      result.reset()
      expect(result.hasUpdate.value).toBe(false)
      expect(result.newVersion.value).toBeNull()
      expect(result.error.value).toBeNull()
      expect(result.isDownloading.value).toBe(false)
    })
  })
})
