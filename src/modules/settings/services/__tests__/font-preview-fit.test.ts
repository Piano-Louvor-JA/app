import { describe, expect, it } from 'vitest'
import { fitFontPreview } from '../font-preview-fit'

describe('Bible preview with wide display fonts', () => {
  it('reduces text until the complete verse and reference fit, and restores size for narrower fonts', () => {
    const screen = document.createElement('div')
    const content = document.createElement('div')
    const verse = document.createElement('p')
    let wide = true
    Object.defineProperties(screen, { clientWidth: { value: 480 }, clientHeight: { value: 270 } })
    Object.defineProperty(content, 'offsetHeight', { get: () => wide ? Number.parseFloat(verse.style.fontSize) * 15 + 60 : 190 })
    fitFontPreview(screen, content, verse)
    expect(content.offsetHeight).toBeLessThanOrEqual(screen.clientHeight)
    expect(Number.parseFloat(verse.style.fontSize)).toBeLessThan(21.6)
    wide = false
    fitFontPreview(screen, content, verse)
    expect(Number.parseFloat(verse.style.fontSize)).toBeCloseTo(21.6)
  })
  it('leaves hidden or unmounted previews alone', () => {
    const element = document.createElement('div')
    const verse = document.createElement('p')
    verse.style.fontSize = '1rem'
    fitFontPreview(element, element, verse)
    fitFontPreview(null, null, null)
    expect(verse.style.fontSize).toBe('1rem')
  })
})
