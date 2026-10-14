import { describe, expect, it } from 'vitest'

import { sanitizeRendererErrors } from '../renderer-errors.mjs'

describe('renderer errors snapshot', () => {
  it('rejeita payload inválido e sanitiza eventos recebidos', () => {
    expect(sanitizeRendererErrors({})).toEqual([])
    const output = sanitizeRendererErrors([{ ts: new Date().toISOString(), kind: 'onerror', message: 'Bearer secret https://key@host/1 user@example.com', stack: 'Authorization: top-secret ***', url: 'https://app.test/a?token=secret#hash' }])
    expect(output).toEqual([
      expect.objectContaining({ kind: 'onerror', message: expect.stringContaining('Bearer [redacted]'), url: 'https://app.test/a' }),
    ])
    expect(JSON.stringify(output)).not.toMatch(/key@host|user@example\.com|top-secret/)
  })

  it('mascara JWT e blob base64 longo, preserva URL e base64 curto', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'
    const blob = 'a'.repeat(41)
    const output = sanitizeRendererErrors([{
      ts: new Date().toISOString(),
      kind: 'onerror',
      message: `https://app.test/a short-base64 abc123 ${jwt} ${blob}`,
    }])
    const message = output[0].message
    expect(message).toContain('https://app.test/a')
    expect(message).toContain('abc123')
    expect(message).not.toContain(jwt)
    expect(message).not.toContain(blob)
  })
})
