import { describe, expect, it } from 'vitest'

import { DownloadFailureBuffer } from '../download-failure-buffer'

describe('DownloadFailureBuffer', () => {
  it('sanitiza, mantém últimos 20 em ordem e preserva tentativa', () => {
    const buffer = new DownloadFailureBuffer()
    for (let index = 1; index <= 21; index++) {
      buffer.add({
        ts: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
        url: `https://user:secret@cdn.test/media/${index}.mp3?token=secret#fragment`,
        status: index === 21 ? 503 : undefined,
        bytes: undefined,
        erro: 'Bearer secret https://key@host/1 user@example.com Authorization: top-secret',
        tentativa: index === 21 ? 2 : 1,
      })
    }

    const snapshot = buffer.snapshot()
    expect(snapshot).toHaveLength(20)
    expect(snapshot[0]).toEqual(expect.objectContaining({
      url: 'https://cdn.test/media/2.mp3',
      status: null,
      bytes: null,
      erro: expect.stringContaining('Bearer [redacted]'),
      tentativa: 1,
    }))
    expect(snapshot.at(-1)).toEqual(expect.objectContaining({
      url: 'https://cdn.test/media/21.mp3',
      status: 503,
      bytes: null,
      tentativa: 2,
    }))
    expect(JSON.stringify(snapshot)).not.toMatch(/key@host|user@example\.com|top-secret/)
  })
})
