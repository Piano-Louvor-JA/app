import { describe, expect, it } from 'vitest'
import { FONT_CATALOG, findFont } from '../font-catalog'

describe('font catalog', () => {
  it('curates 96 unique families in four categories with real weight declarations', () => {
    expect(FONT_CATALOG).toHaveLength(96)
    expect(new Set(FONT_CATALOG.map(f => f.id)).size).toBe(FONT_CATALOG.length)
    expect(new Set(FONT_CATALOG.map(f => f.category))).toEqual(new Set(['sans', 'serif', 'display', 'handwriting']))
    for (const font of FONT_CATALOG) {
      expect(font.id).toMatch(/^[a-z0-9-]+$/)
      expect(font.weights).toContain(400)
      expect(font.weights.length).toBeGreaterThan(0)
    }
  })
  it('allows Merriweather on the system and rejects unknown ids', () => {
    expect(findFont('merriweather')?.ui).toBe(true)
    expect(findFont('../escape')).toBeUndefined()
  })
  it('offers visibly distinct projection styles rather than only more sans serif families', () => {
    expect(FONT_CATALOG.filter(font => font.category === 'display').length).toBeGreaterThanOrEqual(24)
    expect(FONT_CATALOG.filter(font => font.category === 'handwriting').length).toBeGreaterThanOrEqual(20)
    for (const id of ['bungee-shade', 'monoton', 'rubik-glitch', 'press-start-2p', 'unifraktur-maguntia', 'permanent-marker', 'amatic-sc']) {
      expect(findFont(id), id).toMatchObject({ ui: false })
    }
  })
  it('adds legible interface alternatives with different letter forms', () => {
    for (const id of ['atkinson-hyperlegible-next', 'lexend', 'space-grotesk', 'dosis', 'roboto-slab']) {
      expect(findFont(id), id).toMatchObject({ ui: true })
    }
  })

  it('only advertises weights supported by the audited families and includes a typewriter style', () => {
    expect(findFont('lora')?.weights).not.toContain(800)
    expect(findFont('josefin-sans')?.weights).not.toContain(800)
    expect(findFont('special-elite')).toMatchObject({ category: 'display', ui: false, weights: [400] })
  })

})
