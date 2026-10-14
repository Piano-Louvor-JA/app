import { describe, expect, it } from 'vitest'

import { sanitizeRendererErrors } from '../renderer-errors.mjs'

describe('renderer errors snapshot', () => {
  it('rejeita payload inválido e sanitiza eventos recebidos', () => {
    expect(sanitizeRendererErrors({})).toEqual([])
    const output = sanitizeRendererErrors([{ ts: new Date().toISOString(), kind: 'onerror', message: 'Bearer secret https://key@host/1 user@example.com', stack: 'Authorization: top-secret user@example.com', url: 'https://app.test/a?token=secret#hash' }])
    expect(output).toEqual([
      expect.objectContaining({ kind: 'onerror', message: expect.stringContaining('Bearer [redacted]'), url: 'https://app.test/a' }),
    ])
    expect(JSON.stringify(output)).not.toMatch(/key@host|user@example\.com|top-secret/)
  })
})
