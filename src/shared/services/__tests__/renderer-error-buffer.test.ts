import { describe, expect, it } from 'vitest'

import { RendererErrorBuffer, sanitizeRendererText, sanitizeRendererUrl, isRendererErrorSnapshot, sanitizeRendererErrorSnapshot } from '../renderer-error-buffer'

describe('RendererErrorBuffer', () => {
  it('mantém os últimos 50 eventos em ordem e sanitiza conteúdo sensível', () => {
    const buffer = new RendererErrorBuffer()

    for (let i = 0; i < 51; i++) {
      buffer.add({
        kind: 'console.error',
        message: `erro ${i} Bearer secret-${i} https://key@host/1 user@example.com`,
        stack: `Authorization: top-secret-${i} user@example.com ${'x'.repeat(3_000)}`,
        url: `https://example.test/app?token=secret-${i}#fragment`,
      })
    }

    const events = buffer.snapshot()
    expect(events).toHaveLength(50)
    expect(events[0].message).toContain('erro 1')
    expect(JSON.stringify(events)).not.toMatch(/secret-|key@host|user@example\.com|top-secret/)
    expect(events[0].stack?.length).toBeLessThanOrEqual(2_048)
    expect(events[0].url).toBe('https://example.test/app')
  })
})


describe('diagnostic privacy and snapshot boundaries', () => {
  const event = { ts: '2026-10-16T00:00:00Z', kind: 'onerror' as const,
    message: 'failure', stack: null, url: null }

  it.each(['token', 'access_token', 'api_key', 'api-key', 'key', 'secret', 'password', 'authorization', 'cookie'])(
    'redacts %s from diagnostic query parameters', (key) => {
      expect(sanitizeRendererText(`request?${key}=private&ok=1`))
        .toBe(`request?${key}=[redacted]${key === 'authorization' ? '' : '&ok=1'}`)
    })

  it('handles missing and unprintable values and caps diagnostic text', () => {
    expect(sanitizeRendererText(null)).toBe('')
    expect(sanitizeRendererText(undefined)).toBe('')
    expect(sanitizeRendererText({ toString() { throw new Error('unprintable') } }))
      .toBe('[unserializable]')
    expect(sanitizeRendererText('abcdef', 3)).toBe('abc')
    expect(sanitizeRendererText('x'.repeat(3000))).toHaveLength(2048)
  })

  it('removes credentials, query and fragment from URLs and rejects invalid URLs', () => {
    expect(sanitizeRendererUrl('https://user:password@example.test/path?token=private#secret'))
      .toBe('https://example.test/path')
    for (const value of [null, undefined, '', '/relative', 'invalid']) {
      expect(sanitizeRendererUrl(value)).toBeNull()
    }
  })

  it('preserves explicit timestamps and returns independent snapshot objects', () => {
    const buffer = new RendererErrorBuffer()
    buffer.add(event)
    const first = buffer.snapshot()
    expect(first).toEqual([event])
    first[0].message = 'changed'
    first.push(event)
    expect(buffer.snapshot()).toEqual([event])
  })

  it.each(['console.error', 'onerror', 'unhandledrejection'] as const)(
    'accepts %s snapshots and re-sanitizes imported content', (kind) => {
      const input = [{ ...event, kind, message: 'Bearer private',
        stack: 'user@example.com', url: 'https://user:pass@example.test/a?key=private#fragment' }]
      expect(isRendererErrorSnapshot(input)).toBe(true)
      expect(sanitizeRendererErrorSnapshot(input)).toEqual([{ ...event, kind,
        message: 'Bearer [redacted]', stack: '[redacted-email]', url: 'https://example.test/a' }])
      expect(input[0].message).toBe('Bearer private')
    })

  it('accepts empty snapshots and normalizes empty stacks', () => {
    expect(isRendererErrorSnapshot([])).toBe(true)
    expect(sanitizeRendererErrorSnapshot([])).toEqual([])
    expect(sanitizeRendererErrorSnapshot([{ ...event, stack: '' }])).toEqual([event])
    expect(sanitizeRendererErrorSnapshot([event])).toEqual([event])
  })

  it.each([
    null, {}, [null], [1], [{ ...event, ts: 1 }], [{ ...event, kind: 'unknown' }],
    [{ ...event, message: 1 }], [{ ...event, stack: 1 }], [{ ...event, url: 1 }],
    Array.from({ length: 51 }, () => event),
  ])('rejects malformed or oversized imported snapshots: %#', (input) => {
    expect(isRendererErrorSnapshot(input)).toBe(false)
    expect(sanitizeRendererErrorSnapshot(input)).toEqual([])
  })
})
