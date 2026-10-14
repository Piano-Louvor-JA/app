import { describe, expect, it } from 'vitest'

import { sanitizeDownloadFailures } from '../download-failures.mjs'

describe('download failures snapshot', () => {
  it('rejeita payload inválido e sanitiza eventos recebidos', () => {
    expect(sanitizeDownloadFailures({})).toEqual([])
    expect(sanitizeDownloadFailures([{
      ts: new Date().toISOString(),
      url: 'https://user:secret@cdn.test/a.mp3?token=secret#hash',
      status: undefined,
      bytes: undefined,
      erro: 'Bearer secret https://key@host/1 user@example.com Authorization: top-secret',
      tentativa: 1,
    }])).toEqual([{
      ts: expect.any(String),
      url: 'https://cdn.test/a.mp3',
      status: null,
      bytes: null,
      erro: expect.stringContaining('Bearer [redacted]'),
      tentativa: 1,
    }])
    expect(JSON.stringify(sanitizeDownloadFailures([{
      ts: new Date().toISOString(), url: 'https://cdn.test/a', erro: 'https://key@host/1 user@example.com', tentativa: 1,
    }]))).not.toMatch(/key@host|user@example\.com/)
  })
})
