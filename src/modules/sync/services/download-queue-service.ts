import { readCatalogRecord, writeCatalogRecord } from '@shared/services/workspace-api'
import { WORKSPACE_RECORD_KEYS } from '@shared/constants/storage-keys'

/**
 * app#338: fila de downloads unificada — CORE observável (a UI de widget/
 * painel assina o snapshot). Prioridade: `user` (pediu na hora) antes de
 * `bg` (capas, first-boot). Persistida no workspace pra retomada.
 */

export type DownloadPriority = 'user' | 'bg'

export type DownloadStatus = 'pending' | 'running' | 'done' | 'failed'

export interface DownloadQueueItem {
  id: string
  label: string
  priority: DownloadPriority
  status: DownloadStatus
  error?: string
}

interface QueuedTask {
  item: DownloadQueueItem
  task: () => Promise<void>
}

const PRIORITY_RANK: Record<DownloadPriority, number> = { user: 0, bg: 1 }

const queue: QueuedTask[] = []
let draining = false
const listeners = new Set<(snapshot: DownloadQueueItem[]) => void>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

function snapshot(): DownloadQueueItem[] {
  return queue.map((q) => ({ ...q.item }))
}

function notify(): void {
  const snap = snapshot()
  for (const fn of listeners) fn(snap)
  schedulePersist()
}

function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void writeCatalogRecord(
      WORKSPACE_RECORD_KEYS.downloadQueue,
      snapshot(),
    ).catch(() => {})
  }, 300)
}

export function subscribeDownloadQueue(
  fn: (snapshot: DownloadQueueItem[]) => void,
): () => void {
  listeners.add(fn)
  fn(snapshot())
  return () => listeners.delete(fn)
}

export function downloadQueueSnapshot(): DownloadQueueItem[] {
  return snapshot()
}

export function pendingCount(): number {
  return queue.filter((q) => q.item.status === 'pending' || q.item.status === 'running').length
}

export function enqueueDownload(options: {
  id: string
  label: string
  priority: DownloadPriority
  task: () => Promise<void>
}): void {
  // dedupe por id (re-request do mesmo item não duplica)
  const existing = queue.find((q) => q.item.id === options.id)
  if (existing) {
    if (existing.item.status === 'failed') existing.item.status = 'pending'
    return
  }
  queue.push({
    item: {
      id: options.id,
      label: options.label,
      priority: options.priority,
      status: 'pending',
    },
    task: options.task,
  })
  notify()
  void drain()
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    // Janela de coalescing: dá 50ms pra enqueues quase simultâneos chegarem
    // antes do primeiro pick — é o que deixa o user furar um bg enfileirado
    // no mesmo instante.
    await new Promise((r) => setTimeout(r, 50))
    for (;;) {
      const next = queue
        .filter((q) => q.item.status === 'pending')
        .sort(
          (a, b) =>
            PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority],
        )[0]
      if (!next) break
      next.item.status = 'running'
      notify()
      try {
        await next.task()
        next.item.status = 'done'
      } catch (error) {
        next.item.status = 'failed'
        next.item.error = error instanceof Error ? error.message : String(error)
      }
      notify()
    }
  } finally {
    draining = false
  }
}

/** app#338 UI: re-enfileira um item failed (ou done → re-download). */
export function retryDownload(id: string): void {
  const entry = queue.find((q) => q.item.id === id)
  if (!entry || entry.item.status === 'running') return
  entry.item.status = 'pending'
  entry.item.error = undefined
  notify()
  void drain()
}

/** app#338 UI: cancela pending/failed (running não interrompe — avisa na UI). */
export function cancelDownload(id: string): void {
  const index = queue.findIndex((q) => q.item.id === id)
  if (index === -1) return
  const entry = queue[index]
  if (entry.item.status === 'running') return
  queue.splice(index, 1)
  notify()
}

/** app#338 UI: limpa itens concluídos da lista (feedback limpo). */
export function clearFinishedDownloads(): void {
  const before = queue.length
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].item.status === 'done') queue.splice(i, 1)
  }
  if (queue.length !== before) notify()
}

/** Testes: esvazia a fila entre casos (estado é module-level). */
export function _resetDownloadQueueForTests(): void {
  queue.length = 0
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}
