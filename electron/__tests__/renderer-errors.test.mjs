import { describe, expect, it } from 'vitest'

import { sanitizeRendererErrors } from '../renderer-errors.mjs'

describe('renderer errors snapshot', () => {
  it('rejeita payload inválido e sanitiza eventos recebidos', () => {
    expect(sanitizeRendererErrors({})).toEqual([])
    expect(sanitizeRendererErrors([{ ts: new Date().toISOString(), kind: 'onerror', message: 'Bearer secret', stack: 'x'.repeat(3_000), url: 'https://app.test/a?token=secret#hash' }])).toEqual([
      expect.objectContaining({ kind: 'onerror', message: 'Bearer [redacted]', url: 'https://app.test/a' }),
    ])
  })
})
