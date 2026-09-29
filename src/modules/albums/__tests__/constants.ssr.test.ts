// @vitest-environment node
import { describe, expect, it } from 'vitest'

/**
 * Guards SSR de constants.ts: sem `window` (ambiente node), as funções
 * caem nos branches `typeof window === 'undefined'` — get retorna o
 * default true e set é no-op.
 */

describe('albums/constants — guards SSR (sem window)', () => {
  it('getShowCustomCollections retorna true sem window', async () => {
    const { getShowCustomCollections } = await import('../constants')
    expect(getShowCustomCollections()).toBe(true)
  })

  it('setShowCustomCollections é no-op sem window (não lança)', async () => {
    const { setShowCustomCollections } = await import('../constants')
    expect(() => setShowCustomCollections(false)).not.toThrow()
    expect(() => setShowCustomCollections(true)).not.toThrow()
  })
})
