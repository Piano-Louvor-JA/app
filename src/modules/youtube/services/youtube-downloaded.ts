import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'
import type { OnlineVideoDownload, OnlineVideoFolder } from '@shared/types/desktop-bridge'

import { applyOrder, moveById } from './reorder'

/** Dados de um vídeo que o módulo já conhece (histórico, favoritos, coletâneas). */
type KnownVideo = { videoId: string; title: string; channel: string; thumbnail: string; durationText: string }

/** Linha da aba "Baixados": mesmo formato das linhas do histórico e dos favoritos. */
export type YoutubeDownloadedRow = KnownVideo & {
  playedAt: number
  size: number
  fileName: string
  renamed: boolean
  folder: OnlineVideoFolder
}

/** 65 → "1:05"; 3725 → "1:02:05"; sem duração → "". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** 1.5 GB / 25 MB */
export function formatBytes(bytes: number): string {
  const GB = 1024 ** 3
  const MB = 1024 ** 2
  return bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / MB))} MB`
}

/**
 * Junta o que está no disco com o que o módulo já sabe do vídeo (canal e miniatura vêm do
 * histórico, favoritos ou coletâneas; o título do download vale quando não há outro).
 */
export function downloadedRows(downloads: OnlineVideoDownload[], known: KnownVideo[][]): YoutubeDownloadedRow[] {
  const byId = new Map<string, KnownVideo>()
  for (const list of known) for (const video of list) if (!byId.has(video.videoId)) byId.set(video.videoId, video)
  return downloads.map((item) => {
    const info = byId.get(item.id)
    return {
      videoId: item.id,
      title: info?.title || item.title || item.id,
      channel: info?.channel ?? '',
      thumbnail: info?.thumbnail ?? '',
      durationText: info?.durationText || formatDuration(item.duration),
      playedAt: item.lastUsed,
      size: item.size,
      fileName: item.fileName,
      renamed: item.renamed,
      folder: item.folder,
    }
  })
}

/** Ordem salva da aba "Baixados" (IDs). */
export function listDownloadsOrder(): string[] {
  const raw = getBrowserItem<unknown>(BROWSER_STORAGE_KEYS.youtubeDownloadsOrder, [])
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

/** Linhas na ordem do operador; baixados novos aparecem no topo. */
export function orderDownloadedRows(rows: YoutubeDownloadedRow[], order = listDownloadsOrder()): YoutubeDownloadedRow[] {
  return applyOrder(rows, (row) => row.videoId, order)
}

/** Arrastar e soltar: salva a ordem nova (só dos vídeos que existem) e devolve. */
export function reorderDownloads(rows: YoutubeDownloadedRow[], fromId: string, toId: string): string[] {
  const order = moveById(rows, (row) => row.videoId, fromId, toId).map((row) => row.videoId)
  setBrowserItem(BROWSER_STORAGE_KEYS.youtubeDownloadsOrder, order)
  return order
}
