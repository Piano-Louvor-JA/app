import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const unsub = vi.fn()
const bridgeMock = {
  downloadBatch: {
    pending: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    retry: vi.fn().mockResolvedValue({ ok: true }),
    onProgress: vi.fn().mockReturnValue(unsub),
    onItemDone: vi.fn().mockReturnValue(unsub),
    onItemFailed: vi.fn().mockReturnValue(unsub),
    onBatchDone: vi.fn().mockReturnValue(unsub),
  },
}

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => bridgeMock,
}))

import { useDownloadStore } from '../../stores/useDownloadStore'

describe('useDownloadStore (T5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('idle quando bridge ausente (web)', async () => {
    bridgeMock.downloadBatch = undefined as never
    const store = useDownloadStore()
    await store.init()
    expect(store.active).toBe(false)
    bridgeMock.downloadBatch = {
      pending: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
      retry: vi.fn().mockResolvedValue({ ok: true }),
      onProgress: vi.fn().mockReturnValue(unsub),
      onItemDone: vi.fn().mockReturnValue(unsub),
      onItemFailed: vi.fn().mockReturnValue(unsub),
      onBatchDone: vi.fn().mockReturnValue(unsub),
    } as never
  })

  it('init registra listeners e consulta pendentes', async () => {
    const store = useDownloadStore()
    await store.init()
    expect(bridgeMock.downloadBatch.onProgress).toHaveBeenCalled()
    expect(bridgeMock.downloadBatch.pending).toHaveBeenCalled()
  })

  it('evento progress ativa estado e calcula %', async () => {
    const store = useDownloadStore()
    await store.init()
    const cb = bridgeMock.downloadBatch.onProgress.mock.calls[0][0]
    cb({ done: 2, total: 13, current: { id: 'x', fileName: 'f.mp4', receivedBytes: 50, totalBytes: 100 } })
    expect(store.active).toBe(true)
    // % global ponderado: 2/13 concluídos + fração do atual → ~19%
    expect(store.percent).toBe(19)
    expect(store.currentFileName).toBe('f.mp4')
  })

  it('progress done==total==0 → idle', async () => {
    const store = useDownloadStore()
    await store.init()
    const cb = bridgeMock.downloadBatch.onProgress.mock.calls[0][0]
    cb({ done: 0, total: 0, current: null })
    expect(store.active).toBe(false)
  })

  it('cancel delega pro bridge', async () => {
    const store = useDownloadStore()
    await store.init()
    await store.cancel('a')
    expect(bridgeMock.downloadBatch.cancel).toHaveBeenCalledWith('a')
  })

  it('retry delega pro bridge', async () => {
    const store = useDownloadStore()
    await store.init()
    await store.retry('a')
    expect(bridgeMock.downloadBatch.retry).toHaveBeenCalledWith('a')
  })
})
