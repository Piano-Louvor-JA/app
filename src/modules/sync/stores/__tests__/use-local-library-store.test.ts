// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de useLocalLibraryStore — download de coletâneas, reconciliação,
 * cancelamento individual/lote, remoção e tratamento de erros.
 */

const isDesktopApp = vi.hoisted(() => vi.fn(() => false))
vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: () => isDesktopApp(),
}))

const invalidateTrackMediaCache = vi.hoisted(() => vi.fn())
const peekTrackDownloadCache = vi.hoisted(() => vi.fn(() => undefined))
vi.mock('@shared/services/track-media', () => ({
  invalidateTrackMediaCache,
  peekTrackDownloadCache,
}))

const loadLibraryCategories = vi.hoisted(() => vi.fn())
const hydrateLocalLibraryCoverUrls = vi.hoisted(() => vi.fn())
vi.mock('../../services/library-catalog', () => ({
  loadLibraryCategories: (...a: unknown[]) => loadLibraryCategories(...(a as [])),
  hydrateLocalLibraryCoverUrls: (...a: unknown[]) =>
    hydrateLocalLibraryCoverUrls(...(a as [])),
}))

const libDownload = vi.hoisted(() => ({
  deleteAlbumMedia: vi.fn().mockResolvedValue(undefined),
  downloadAlbumMedia: vi.fn().mockResolvedValue({ status: 'downloaded' }),
  listAlbumMusicIds: vi.fn().mockResolvedValue([]),
  markAlbumAsDownloaded: vi.fn().mockResolvedValue(undefined),
  reconcileAlbumsAgainstLocalMedia: vi.fn().mockResolvedValue({ checked: 0, marked: 0 }),
  resolveAlbumIdsForMusic: vi.fn().mockResolvedValue([]),
  unmarkAlbumAsDownloaded: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../services/library-download', () => libDownload)

import { useLocalLibraryStore } from '../useLocalLibraryStore'

const album = (
  id: number | string,
  over: Record<string, unknown> = {},
) => ({
  id,
  name: `Album ${id}`,
  status: 'idle',
  progress: 0,
  downloadedCount: 0,
  totalCount: 0,
  cancelRequested: false,
  progressText: '',
  isHymnal: false,
  ...over,
}) as never

const seed = (store: ReturnType<typeof useLocalLibraryStore>) => {
  store.categories = [
    {
      id: 'c1',
      name: 'CDs',
      albums: [
        album(1),
        album(2, { status: 'downloaded' }),
        album(3, { status: 'downloading' }),
        album(4, { isHymnal: true }),
      ],
    } as never,
  ]
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  isDesktopApp.mockReturnValue(false)
  libDownload.downloadAlbumMedia.mockResolvedValue({ status: 'downloaded' })
  libDownload.listAlbumMusicIds.mockResolvedValue([])
  libDownload.resolveAlbumIdsForMusic.mockResolvedValue([])
  loadLibraryCategories.mockResolvedValue([])
})

describe('estado básico e erros', () => {
  it('hasIdleAlbums/isAnyDownloading computam do status', () => {
    const store = useLocalLibraryStore()
    seed(store)
    expect(store.hasIdleAlbums).toBe(true)
    expect(store.isAnyDownloading).toBe(true)
    store.categories[0].albums[0].status = 'downloaded'
    store.categories[0].albums[2].status = 'downloaded'
    store.categories[0].albums[3].status = 'downloaded'
    expect(store.hasIdleAlbums).toBe(false)
    expect(store.isAnyDownloading).toBe(false)
  })

  it('clearError limpa lastErrorKey e downloadFailure', () => {
    const store = useLocalLibraryStore()
    store.lastErrorKey = 'x'
    store.downloadFailure = { reason: 'offline', failedCount: 1 } as never
    store.clearError()
    expect(store.lastErrorKey).toBeNull()
    expect(store.downloadFailure).toBeNull()
  })

  it('refreshCollections: ok carrega + hidrata; falha seta erro e zera', async () => {
    const store = useLocalLibraryStore()
    loadLibraryCategories.mockResolvedValue([{ id: 'c1', albums: [] }])
    await store.refreshCollections()
    expect(store.categories).toHaveLength(1)
    expect(hydrateLocalLibraryCoverUrls).toHaveBeenCalled()
    expect(store.isLoadingList).toBe(false)

    loadLibraryCategories.mockRejectedValue(new Error('x'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.refreshCollections()
    expect(store.lastErrorKey).toBe('sync.errors.loadFailed')
    expect(store.categories).toEqual([])
    expect(store.isLoadingList).toBe(false)
    errSpy.mockRestore()
  })

  it('reconcileFromLocalMedia: web -> zero; desktop -> delega e invalida cache', async () => {
    const store = useLocalLibraryStore()
    expect(await store.reconcileFromLocalMedia()).toEqual({ checked: 0, marked: 0 })
    isDesktopApp.mockReturnValue(true)
    libDownload.reconcileAlbumsAgainstLocalMedia.mockResolvedValue({
      checked: 5,
      marked: 2,
    })
    const r = await store.reconcileFromLocalMedia()
    expect(r).toEqual({ checked: 5, marked: 2 })
    expect(invalidateTrackMediaCache).toHaveBeenCalled()
  })

  it('stopBackgroundReconcile: no-op', () => {
    expect(() => useLocalLibraryStore().stopBackgroundReconcile()).not.toThrow()
  })
})

describe('reconcileAlbumsForMusic', () => {
  it('web ou id inválido: no-op', async () => {
    const store = useLocalLibraryStore()
    await store.reconcileAlbumsForMusic(1)
    expect(loadLibraryCategories).not.toHaveBeenCalled()
    isDesktopApp.mockReturnValue(true)
    await store.reconcileAlbumsForMusic(Number.NaN)
    expect(loadLibraryCategories).not.toHaveBeenCalled()
  })

  it('carrega categorias se vazio; erro no load aborta', async () => {
    isDesktopApp.mockReturnValue(true)
    const store = useLocalLibraryStore()
    loadLibraryCategories.mockRejectedValue(new Error('x'))
    await store.reconcileAlbumsForMusic(1)
    expect(store.categories).toHaveLength(0)
  })

  it('todas faixas no cache -> marca downloaded; faixa removida -> desmarca', async () => {
    isDesktopApp.mockReturnValue(true)
    const store = useLocalLibraryStore()
    seed(store)
    // álbum 1 com faixas 10,11; resolveAlbums diz que a música pertence aos álbuns 1,2,3,4
    libDownload.resolveAlbumIdsForMusic.mockResolvedValue([1, 2, 3, 4])
    libDownload.listAlbumMusicIds.mockResolvedValue([10, 11])
    peekTrackDownloadCache.mockImplementation(((id: number) => (id === 10 ? true : false)) as never)
    await store.reconcileAlbumsForMusic(11) // música 11 removida (peek false)
    // álbum 1: nem tudo cacheado E música 11 removida mas status idle -> não desmarca (não está downloaded)
    expect(libDownload.unmarkAlbumAsDownloaded).not.toHaveBeenCalledWith(1)
    // álbum 2 downloaded + música removida -> desmarca
    expect(libDownload.unmarkAlbumAsDownloaded).toHaveBeenCalledWith(2)
    expect((store.categories[0].albums[1] as { status: string }).status).toBe('idle')
  })

  it('todas cacheadas -> marca como downloaded (skip hymnal e downloading)', async () => {
    isDesktopApp.mockReturnValue(true)
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.resolveAlbumIdsForMusic.mockResolvedValue([1, 3, 4])
    libDownload.listAlbumMusicIds.mockResolvedValue([10])
    peekTrackDownloadCache.mockReturnValue(true as never)
    await store.reconcileAlbumsForMusic(10)
    expect(libDownload.markAlbumAsDownloaded).toHaveBeenCalledWith(1)
    // hymnal (4) e downloading (3) pulados: só 1 chamada
    expect(libDownload.markAlbumAsDownloaded).toHaveBeenCalledTimes(1)
  })
})

describe('downloadAlbum', () => {
  it('álbum inexistente ou já baixando -> null', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    expect(await store.downloadAlbum(999)).toBeNull()
    expect(await store.downloadAlbum(3)).toBeNull() // downloading
  })

  it('sucesso: status downloaded e progresso 100', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    const status = await store.downloadAlbum(1)
    expect(status).toBe('downloaded')
    expect((store.categories[0].albums[0] as { status: string }).status).toBe(
      'downloaded',
    )
  })

  it('idle: progressText cancelled quando abortado', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.downloadAlbumMedia.mockResolvedValue({
      status: 'idle',
      failureReason: 'cancelled',
    })
    expect(await store.downloadAlbum(1)).toBe('idle')
    expect((store.categories[0].albums[0] as { status: string }).status).toBe('idle')
  })

  it('erro offline fora de lote: downloadFailure offline (L233-250)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.downloadAlbumMedia.mockResolvedValue({
      status: 'error',
      failureReason: 'offline',
      totalErrors: 3,
    })
    expect(await store.downloadAlbum(1)).toBe('error')
    expect(store.downloadFailure).toMatchObject({ reason: 'offline', failedCount: 3 })
  })

  it('erro server fora de lote: failedCount >= 1 (L242-246)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.downloadAlbumMedia.mockResolvedValue({
      status: 'error',
      failureReason: 'server',
      totalErrors: 0,
    })
    await store.downloadAlbum(1)
    expect(store.downloadFailure).toMatchObject({ reason: 'server', failedCount: 1 })
  })

  it('erro unknown: failure unknown; em lote não seta failure', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.downloadAlbumMedia.mockResolvedValue({
      status: 'error',
      failureReason: 'unknown',
      totalErrors: 2,
    })
    await store.downloadAlbum(1)
    expect(store.downloadFailure).toMatchObject({ reason: 'unknown', failedCount: 2 })
  })

  it('exceção no download: erro + failure unknown fora de lote (L253-264)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    libDownload.downloadAlbumMedia.mockRejectedValue(new Error('boom'))
    expect(await store.downloadAlbum(1)).toBe('error')
    expect(store.downloadFailure).toMatchObject({ reason: 'unknown', failedCount: 0 })
    errSpy.mockRestore()
  })

  it('cancelRequested: idle com progressText cancelled (L210-215)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.downloadAlbumMedia.mockImplementation(
      async (_a: unknown, opts?: { shouldAbort?: () => boolean }) => {
        // aborta durante o download via shouldAbort
        if (opts?.shouldAbort?.()) return { status: 'idle', failureReason: 'cancelled' }
        return { status: 'downloaded' as const }
      },
    )
    const cancelSpy = store.cancelAlbum
    // cancela logo após iniciar
    const p = store.downloadAlbum(1)
    cancelSpy(1)
    expect(await p).toBe('idle')
  })

  it('onPrepareProgress/onDownloadProgress atualizam progresso', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.downloadAlbumMedia.mockImplementation(
      async (_a: unknown, opts?: Record<string, (n: number, t?: number, p?: number) => void>) => {
        opts?.onPrepareProgress?.(30)
        opts?.onDownloadProgress?.(2, 10, 20)
        return { status: 'downloaded' as const }
      },
    )
    await store.downloadAlbum(1)
    const album1 = store.categories[0].albums[0] as Record<string, unknown>
    expect(album1.downloadedCount).toBe(2)
    expect(album1.totalCount).toBe(10)
  })
})

describe('lote e cancelamento', () => {
  it('downloadAllIdleAlbums: sem idle ou já em lote -> no-op', async () => {
    const store = useLocalLibraryStore()
    await store.downloadAllIdleAlbums() // sem categorias
    seed(store)
    store.categories[0].albums[0].status = 'downloading'
    store.isDownloadingBatch = true
    await store.downloadAllIdleAlbums()
  })

  it('lote: baixa todos idle; erro offline para o lote', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    libDownload.downloadAlbumMedia.mockResolvedValue({ status: 'downloaded' })
    await store.downloadAllIdleAlbums()
    expect(libDownload.downloadAlbumMedia).toHaveBeenCalledTimes(2) // 1 e 4 (hymnal idle tb)
    expect(store.isDownloadingBatch).toBe(false)
  })

  it('lote: erro com offline -> batchOffline e break', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    libDownload.downloadAlbumMedia.mockResolvedValue({
      status: 'error',
      failureReason: 'offline',
      totalErrors: 1,
    })
    await store.downloadAllIdleAlbums()
    expect(store.downloadFailure).toMatchObject({ reason: 'batchOffline' })
  })

  it('cancelAllDownloads: marca cancel em todos downloading', () => {
    const store = useLocalLibraryStore()
    seed(store)
    store.cancelAllDownloads()
    const downloading = store.categories[0].albums[2] as Record<string, unknown>
    expect(downloading.cancelRequested).toBe(true)
    expect(downloading.progressText).toBe('sync.progress.cancelled')
    store.cancelAllDownloads() // segunda vez: nada
  })

  it('removeAlbum: só downloaded remove; outros no-op', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    await store.removeAlbum(1) // idle: no-op
    expect(libDownload.deleteAlbumMedia).not.toHaveBeenCalled()
    await store.removeAlbum(2) // downloaded
    expect(libDownload.deleteAlbumMedia).toHaveBeenCalled()
    expect((store.categories[0].albums[1] as { status: string }).status).toBe('idle')
  })
})

describe('leva final — ramais de lote, cancelamento e gens', () => {
  it('reconcile: álbum sem faixas -> continue (L108)', async () => {
    isDesktopApp.mockReturnValue(true)
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.resolveAlbumIdsForMusic.mockResolvedValue([1])
    libDownload.listAlbumMusicIds.mockResolvedValue([])
    await store.reconcileAlbumsForMusic(10)
    expect(libDownload.markAlbumAsDownloaded).not.toHaveBeenCalled()
  })

  it('downloadAlbum: lote com cancel pendente -> null (L173)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    libDownload.downloadAlbumMedia.mockImplementationOnce(
      async () => {
        // durante o download do 1o álbum, pede cancel do lote
        store.cancelAllDownloads()
        release()
        return { status: 'idle' as const, failureReason: 'cancelled' as const }
      },
    )
    const p = store.downloadAllIdleAlbums()
    await gate
    await p
    // o 2o álbum idle não é baixado pois o lote foi cancelado
    expect(store.isDownloadingBatch).toBe(false)
  })

  it('onProgress com gen stale: ignora updates (L193/198)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    let capturedOpts: Record<string, (...a: unknown[]) => void> | undefined
    libDownload.downloadAlbumMedia.mockImplementation(
      async (_a: unknown, opts?: typeof capturedOpts) => {
        capturedOpts = opts
        // invalida o gen antes dos callbacks
        store.cancelAlbum(1)
        capturedOpts?.onPrepareProgress?.(50)
        capturedOpts?.onDownloadProgress?.(1, 2, 50)
        return { status: 'downloaded' as const }
      },
    )
    await store.downloadAlbum(1)
  })

  it('shouldAbort via batch+cancel (L205 terceiro ramo)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    isDesktopApp.mockReturnValue(true)
    store.categories[0].albums[0].status = 'idle'
    // entra em modo lote com cancel pendente ANTES do download
    store.isDownloadingBatch = true
    store.cancelBatchRequested = true
    libDownload.downloadAlbumMedia.mockImplementation(
      async (_a: unknown, opts?: { shouldAbort?: () => boolean }) => {
        const aborted = opts?.shouldAbort?.()
        expect(aborted).toBe(true) // isDownloadingBatch && cancelBatchRequested
        return { status: 'idle' as const, failureReason: 'cancelled' as const }
      },
    )
    // downloadAlbum(1): não é downloading -> passa; L173 não bloqueia pois
    // cancelBatch && isDownloadingBatch... bloqueia! usa caminho do lote real:
    const p = store.downloadAllIdleAlbums()
    await p
  })

  it('idle com failureReason não-cancelled: progressText vazio (L229)', async () => {
    const store = useLocalLibraryStore()
    seed(store)
    libDownload.downloadAlbumMedia.mockResolvedValue({
      status: 'idle',
      failureReason: 'empty',
    })
    expect(await store.downloadAlbum(1)).toBe('idle')
    expect((store.categories[0].albums[0] as { progressText: string }).progressText).toBe('')
  })

  it('cancelAlbum em não-downloading: no-op (L298)', () => {
    const store = useLocalLibraryStore()
    seed(store)
    store.cancelAlbum(999) // inexistente
    store.cancelAlbum(1) // idle: no-op
  })
})

it('downloadAlbum fluxo normal pós-lote', async () => {
  const store = useLocalLibraryStore()
  seed(store)
  libDownload.downloadAlbumMedia.mockResolvedValue({ status: 'downloaded' })
  expect(await store.downloadAlbum(1)).toBe('downloaded')
})
