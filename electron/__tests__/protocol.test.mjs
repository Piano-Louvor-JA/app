// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/userData') },
  net: { fetch: vi.fn() },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
    registerFileProtocol: vi.fn(),
  },
}))

import { sniffImageMime, resolveLocalProtocolPath } from '../protocol.mjs'

describe('protocol local://', () => {
  it('sniffImageMime reconhece JPEG mesmo com extensão bmp', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
    expect(sniffImageMime(jpeg)).toBe('image/jpeg')
  })

  it('sniffImageMime reconhece BMP real', () => {
    const bmp = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(sniffImageMime(bmp)).toBe('image/bmp')
  })

  it('sniffImageMime reconhece PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00])
    expect(sniffImageMime(png)).toBe('image/png')
  })

  it('resolveLocalProtocolPath junta media + covers sem barra inicial', () => {
    const resolved = resolveLocalProtocolPath(
      'local://media/covers/2026.bmp',
      '/tmp/userData',
    )
    expect(resolved.kind).toBe('media')
    expect(resolved.mediaRelative).toBe('covers/2026.bmp')
    expect(resolved.filePath.replace(/\\/g, '/')).toMatch(/Media\/covers\/2026\.bmp$/)
  })
})
