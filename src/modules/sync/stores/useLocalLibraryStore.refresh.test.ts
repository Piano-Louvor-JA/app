import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Sair e voltar à Central de Mídia recarrega as coletâneas (objetos novos
 * lidos do disco). O download em andamento precisa continuar aparecendo e
 * progredindo na lista nova, e o "baixar tudo" segue a lista atual.
 */

vi.mock('@shared/constants/storage-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/constants/storage-keys')>()
  return { ...actual, WORKSPACE_RECORD_KEYS: { ...actual.WORKSPACE_RECORD_KEYS, downloadQueue: 'downloadQueue' } }
})

vi.mock('@plugins/i18n', () => ({
  i18n: { global: { t: (k: string) => k, locale: 'pt-BR', te: () => true } },
  detectInitialLocale: () => 'pt-BR',
  setLocale: vi.fn(),
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async () => null),
  writeCatalogRecord: vi.fn(async () => true),
}))

type Hooks = {
  onDownloadProgress: (downloaded: number, total: number, percent: number) => void
  shouldAbort: () => boolean
}
type Result = { status: 'downloaded' | 'idle' | 'error'; failureReason: string | null; totalErrors: number }

const mocks = vi.hoisted(() => ({
  downloadAlbumMedia: vi.fn(),
  loadLibraryCategories: vi.fn(),
}))

vi.mock('../services/library-download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/library-download')>()
  return {
    ...actual,
    downloadAlbumMedia: mocks.downloadAlbumMedia,
    reconcileAlbumsAgainstLocalMedia: vi.fn(() => new Promise(() => {})),
  }
})

vi.mock('../services/library-catalog', () => ({
  loadLibraryCategories: mocks.loadLibraryCategories,
  hydrateLocalLibraryCoverUrls: vi.fn(async () => {}),
}))

import { createPinia, setActivePinia } from 'pinia'
import { _resetDownloadQueueForTests } from '../services/download-queue-service'
import { useLocalLibraryStore } from './useLocalLibraryStore'
import type { LibraryAlbum, LibraryCategory } from '../types/library'

function album(id: number, status: LibraryAlbum['status'] = 'idle'): LibraryAlbum {
  return {
    id,
    name: `Coletânea ${id}`,
    isHymnal: false,
    status,
    progress: status === 'downloaded' ? 100 : 0,
    totalCount: 0,
    downloadedCount: 0,
    cancelRequested: false,
    progressText: '',
  } as unknown as LibraryAlbum
}

/** Leitura do disco: sempre objetos novos, como ao voltar para a tela. */
function diskReturns(...albums: Array<[number, LibraryAlbum['status']?]>) {
  mocks.loadLibraryCategories.mockImplementation(async (): Promise<LibraryCategory[]> => [
    { id: 1, name: 'Cat', albums: albums.map(([id, status]) => album(id, status)) } as unknown as LibraryCategory,
  ])
}

function controlledDownloads() {
  const pending: Array<{ albumId: number; hooks: Hooks; resolve: (r: Result) => void }> = []
  mocks.downloadAlbumMedia.mockImplementation(
    (target: LibraryAlbum, hooks: Hooks) =>
      new Promise<Result>((resolve) => pending.push({ albumId: Number(target.id), hooks, resolve })),
  )
  return pending
}

const done: Result = { status: 'downloaded', failureReason: null, totalErrors: 0 }
const flush = () => new Promise((r) => setTimeout(r, 80))

function current(id: number): LibraryAlbum {
  const store = useLocalLibraryStore()
  return store.categories.flatMap((c) => c.albums).find((a) => Number(a.id) === id)!
}

describe('Central de Mídia: download continua ao sair e voltar para a tela', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    _resetDownloadQueueForTests()
    vi.clearAllMocks()
  })

  it('a coletânea segue baixando e mostrando o progresso depois da recarga da lista', async () => {
    const store = useLocalLibraryStore()
    const pending = controlledDownloads()
    diskReturns([7])
    await store.refreshCollections()

    const run = store.downloadAlbum(7)
    await flush()
    expect(pending).toHaveLength(1)

    await store.refreshCollections()
    expect(current(7).status).toBe('downloading')

    pending[0].hooks.onDownloadProgress(3, 10, 30)
    expect(current(7).progress).toBe(30)
    expect(current(7).downloadedCount).toBe(3)

    pending[0].resolve(done)
    await run
    expect(current(7).status).toBe('downloaded')
    expect(mocks.downloadAlbumMedia).toHaveBeenCalledOnce()

    await store.refreshCollections()
    expect(current(7).status).toBe('idle')
  })

  it('cancelar depois da recarga interrompe o download em andamento', async () => {
    const store = useLocalLibraryStore()
    const pending = controlledDownloads()
    diskReturns([7])
    await store.refreshCollections()
    const run = store.downloadAlbum(7)
    await flush()
    await store.refreshCollections()

    store.cancelAlbum(7)
    expect(current(7).status).toBe('idle')
    expect(pending[0].hooks.shouldAbort()).toBe(true)

    await store.refreshCollections()
    expect(current(7).status).toBe('idle')
    pending[0].resolve({ status: 'idle', failureReason: 'cancelled', totalErrors: 0 })
    await run
  })

  it('baixar tudo: segue a lista atual e não baixa de novo o que já está no disco', async () => {
    const store = useLocalLibraryStore()
    const pending = controlledDownloads()
    diskReturns([1], [2], [3])
    await store.refreshCollections()

    const batch = store.downloadAllIdleAlbums()
    await flush()
    expect(pending.map((p) => p.albumId)).toEqual([1])

    diskReturns([1], [2, 'downloaded'], [3])
    await store.refreshCollections()
    expect(current(1).status).toBe('downloading')

    pending[0].resolve(done)
    await flush()
    expect(pending.map((p) => p.albumId)).toEqual([1, 3])
    pending[1].resolve(done)
    await batch

    expect(current(1).status).toBe('downloaded')
    expect(current(2).status).toBe('downloaded')
    expect(current(3).status).toBe('downloaded')
    expect(store.isDownloadingBatch).toBe(false)
  })
})
