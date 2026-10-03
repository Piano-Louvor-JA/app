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
})
