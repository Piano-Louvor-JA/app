import { beforeEach, describe, expect, it } from 'vitest'

import type { OnlineVideoDownload } from '@shared/types/desktop-bridge'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import { downloadedRows, formatBytes, formatDuration, listDownloadsOrder, orderDownloadedRows, reorderDownloads } from '../services/youtube-downloaded'

const A = 'AAAAAAAAAAA'
const B = 'BBBBBBBBBBB'
const item = (over: Partial<OnlineVideoDownload>): OnlineVideoDownload => ({
  id: A, title: 'Hino', duration: 65, size: 25 * 1024 ** 2, lastUsed: 5, fileName: `Hino_${A}.mp4`, renamed: false, folder: 'system', ...over,
})

describe('aba Baixados', () => {
  it('duração e tamanho legíveis', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatBytes(25 * 1024 ** 2)).toBe('25 MB')
    expect(formatBytes(10)).toBe('1 MB')
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB')
  })

  it('completa canal e miniatura com o que o módulo já conhece', () => {
    const known = { videoId: A, title: 'Hino do histórico', channel: 'Arautos do Rei', thumbnail: 'thumb.jpg', durationText: '3:11' }
    const rows = downloadedRows(
      [item({ renamed: true, fileName: `Abertura_${A}.mp4`, folder: 'custom' }), item({ id: B, title: '', duration: 0 })],
      [[known], [{ ...known, channel: 'outro' }]],
    )
    expect(rows[0]).toEqual({
      videoId: A, title: 'Hino do histórico', channel: 'Arautos do Rei', thumbnail: 'thumb.jpg', durationText: '3:11',
      playedAt: 5, size: 25 * 1024 ** 2, fileName: `Abertura_${A}.mp4`, renamed: true, folder: 'custom',
    })
    expect(rows[1]).toMatchObject({ videoId: B, title: B, channel: '', thumbnail: '', durationText: '' })
    expect(downloadedRows([item({ title: 'Do disco' })], [])[0]).toMatchObject({ title: 'Do disco', durationText: '1:05' })
  })
})

describe('ordem da aba Baixados', () => {
  beforeEach(() => localStorage.clear())

  it('arrastar salva a ordem; novos entram no topo; ordem sobrevive a recarregar', () => {
    const B = 'BBBBBBBBBBB'
    const C = 'CCCCCCCCCCC'
    const rows = downloadedRows([item({ id: A }), item({ id: B }), item({ id: C })], [])
    expect(listDownloadsOrder()).toEqual([])
    expect(reorderDownloads(rows, A, C)).toEqual([B, C, A])
    expect(listDownloadsOrder()).toEqual([B, C, A])
    const D = 'DDDDDDDDDDD'
    const again = downloadedRows([item({ id: D }), item({ id: A }), item({ id: B }), item({ id: C })], [])
    expect(orderDownloadedRows(again).map((r) => r.videoId)).toEqual([D, B, C, A])
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeDownloadsOrder, JSON.stringify({ x: 1 }))
    expect(listDownloadsOrder()).toEqual([])
    localStorage.setItem(BROWSER_STORAGE_KEYS.youtubeDownloadsOrder, JSON.stringify([A, 5]))
    expect(listDownloadsOrder()).toEqual([A])
  })
})
