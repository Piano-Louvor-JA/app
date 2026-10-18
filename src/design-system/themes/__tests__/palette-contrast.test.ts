import { describe, expect, it } from 'vitest'
import { accents, resolveAccentColors, type AccentKey } from '../accents'
import { colors } from '../../tokens/colors'
function luminance(hex: string) {
  const values = hex.replace('#', '').match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05) }
describe('palette contrast for reading and actions', () => {
  for (const mode of ['light','dark'] as const) {
    it.each(Object.keys(accents) as AccentKey[])(`${mode}: %s keeps readable buttons and accent text`, key => {
      const accent = resolveAccentColors(key, mode)
      expect(contrast(accent.primary, accent.onPrimary)).toBeGreaterThanOrEqual(4.5)
      for (const surface of [colors[mode].background,colors[mode].surface,colors[mode].surfaceCard]) {
        expect(contrast(accent.primary, surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(colors[mode].onSurfaceVariant, surface)).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
