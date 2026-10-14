import { describe, expect, it } from 'vitest'

import { RendererErrorBuffer } from '../renderer-error-buffer'

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
