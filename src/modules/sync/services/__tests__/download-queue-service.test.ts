import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * app#338 — fila de downloads unificada (core observável).
 * Primeiro cliente: download de mídia de álbum. Prioridade: interação do
 * usuário (user) > background (bg). Persistência da fila pra retomada.
 */

vi.mock('@shared/constants/storage-keys', () => ({
  WORKSPACE_RECORD_KEYS: { downloadQueue: 'downloadQueue' },
}))

const store = new Map<string, unknown>()
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async (key: string) => store.get(key) ?? null),
  writeCatalogRecord: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
    return true
  }),
}))

import {
  downloadQueueSnapshot,
  enqueueDownload,
  pendingCount,
  subscribeDownloadQueue,
  cancelDownload,
  clearFinishedDownloads,
  retryDownload,
} from '../download-queue-service'

describe('fila de downloads (app#338 core)', () => {
  beforeEach(() => {
    store.clear()
  })

  it('enqueue adiciona item pendente com prioridade e persiste', async () => {
    enqueueDownload({
      id: 'album:7',
      label: 'Provai e Vede 2026',
      priority: 'user',
      task: async () => {},
    })
    expect(pendingCount()).toBe(1)
    // persistência é debounced (300ms)
    await new Promise((r) => setTimeout(r, 350))
    expect(store.get('downloadQueue')).toBeTruthy()
  })

  it('processa em ordem de prioridade: user antes de bg', async () => {
    const order: string[] = []
    // bg entra PRIMEIRO — user tem que furar a fila
    enqueueDownload({ id: 'bg:1', label: 'capas', priority: 'bg', task: async () => { await new Promise((r) => setTimeout(r, 30)); order.push('bg:1') } })
    enqueueDownload({ id: 'user:1', label: 'álbum pedido', priority: 'user', task: async () => { order.push('user:1') } })
    await vi.waitFor(() => expect(pendingCount()).toBe(0), { timeout: 2000 })
    expect(order).toEqual(['user:1', 'bg:1'])
  })

  it('snapshot observável: estados pending→running→done', async () => {
    const seen: string[] = []
    const unsub = subscribeDownloadQueue((snap) => {
      const item = snap.find((i) => i.id === 'album:9')
      if (item) seen.push(item.status)
    })
    enqueueDownload({ id: 'album:9', label: 'x', priority: 'user', task: async () => {} })
    await vi.waitFor(() => expect(pendingCount()).toBe(0))
    unsub()
    expect(seen).toContain('running')
    expect(seen.at(-1)).toBe('done')
  })

  it('erro no task marca failed (não derruba a fila)', async () => {
    enqueueDownload({ id: 'bad:1', label: 'x', priority: 'user', task: async () => { throw new Error('boom') } })
    enqueueDownload({ id: 'ok:1', label: 'y', priority: 'bg', task: async () => {} })
    await vi.waitFor(() => expect(pendingCount()).toBe(0))
    const snap = downloadQueueSnapshot()
    expect(snap.find((i) => i.id === 'bad:1')?.status).toBe('failed')
    expect(snap.find((i) => i.id === 'ok:1')?.status).toBe('done')
  })

  it('retryDownload: failed volta a pending e processa de novo', async () => {
    let attempts = 0
    const run = vi.fn().mockImplementation(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('net')
    })
    enqueueDownload({ id: 'r1', label: 'R1', priority: 'user', task: run })
    await vi.waitFor(() => {
      expect(downloadQueueSnapshot().find((q) => q.id === 'r1')?.status).toBe('failed')
    })
    retryDownload('r1')
    await vi.waitFor(() => {
      expect(downloadQueueSnapshot().find((q) => q.id === 'r1')?.status).toBe('done')
    })
    expect(attempts).toBe(2)
  })

  it('cancelDownload: remove pending; running não é interrompido', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    enqueueDownload({
      id: 'c1',
      label: 'running',
      priority: 'user',
      task: () => gate,
    })
    enqueueDownload({ id: 'c2', label: 'pending', priority: 'bg', task: async () => {} })
    cancelDownload('c2')
    expect(downloadQueueSnapshot().find((q) => q.id === 'c2')).toBeUndefined()
    // espera c1 chegar a running (janela de coalescing de 50ms) antes de tentar
    await vi.waitFor(() => {
      expect(downloadQueueSnapshot().find((q) => q.id === 'c1')?.status).toBe('running')
    })
    cancelDownload('c1') // running → ignorado
    expect(downloadQueueSnapshot().find((q) => q.id === 'c1')).toBeDefined()
    release?.()
    await vi.waitFor(() => {
      expect(downloadQueueSnapshot().find((q) => q.id === 'c1')?.status).toBe('done')
    })
  })

  it('clearFinishedDownloads: limpa done, mantém pendentes', async () => {
    enqueueDownload({ id: 'f1', label: 'ok', priority: 'user', task: async () => {} })
    enqueueDownload({
      id: 'f2',
      label: 'fica',
      priority: 'bg',
      task: () => new Promise<void>(() => {}), // nunca termina = segue na fila
    })
    await vi.waitFor(() => {
      expect(downloadQueueSnapshot().find((q) => q.id === 'f1')?.status).toBe('done')
    })
    clearFinishedDownloads()
    const snap = downloadQueueSnapshot()
    expect(snap.find((q) => q.id === 'f1')).toBeUndefined()
    expect(snap.find((q) => q.id === 'f2')).toBeDefined()
  })
})
