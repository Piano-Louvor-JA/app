import { describe, expect, it } from 'vitest'
import { accents, type AccentKey } from '../accents'
import { resolveInterfaceTokens } from '../../tokens/interface'
import { colors } from '../../tokens/colors'

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722
  }
  return (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
}

describe('interface color contracts: all palettes and states', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const accent of Object.keys(accents) as AccentKey[]) {
      it(`${mode}/${accent}: AA controls and AAA reading`, () => {
        const t = resolveInterfaceTokens(mode, accent)
        const surfaces = Object.entries(colors[mode]).filter(([key]) => key === 'background' || key.startsWith('surface')).map(([, value]) => value)
        for (const surface of surfaces) {
          for (const text of ['on-surface', 'on-surface-variant']) expect(contrast(t[`--ds-color-${text}`]!, surface), `${text} on ${surface}`).toBeGreaterThanOrEqual(7)
          for (const role of ['primary', 'success', 'warning', 'danger', 'info']) expect(contrast(t[`--ds-color-${role}`]!, surface), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(t['--ds-control-border']!, surface)).toBeGreaterThanOrEqual(3)
          expect(contrast(t['--ds-focus-ring']!, surface)).toBeGreaterThanOrEqual(3)
        }
        for (const tone of ['primary', 'neutral', 'danger']) {
          for (const state of ['default', 'hover', 'active']) {
            expect(contrast(t[`--ds-action-${tone}-${state}`]!, t[`--ds-action-${tone}-text`]!), `${tone}/${state}`).toBeGreaterThanOrEqual(4.5)
          }
        }
        expect(contrast(t['--ds-selection-bg']!, t['--ds-selection-text']!)).toBeGreaterThanOrEqual(4.5)
        // Inactive controls are exempt in WCAG; 4.5 is our voluntary readability target.
        expect(contrast(t['--ds-disabled-bg']!, t['--ds-disabled-text']!)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
