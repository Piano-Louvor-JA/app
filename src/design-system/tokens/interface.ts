import { colors } from './colors'
import { resolveAccentColors, type AccentKey } from '../themes/accents'

type Mode = 'light' | 'dark'
const rgb = (hex: string) => hex.slice(1).match(/../g)!.map(value => parseInt(value, 16))
const mix = (a: string, b: string, amount: number) => '#' + rgb(a).map((value, i) => Math.round(value + (rgb(b)[i]! - value) * amount).toString(16).padStart(2, '0')).join('').toUpperCase()
function luminance(hex: string) {
  const values = rgb(hex).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722
}
function ratio(a: string, b: string) { return (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05) }

// Keep the selected hue; move its tone only as far as required by the actual
// surface pairs. Values are opaque: hover/disabled opacity must not undo this.
function readable(seed: string, backgrounds: string[], minimum: number, toward: string) {
  for (let step = 0; step <= 100; step++) {
    const candidate = step === 0 ? seed : mix(seed, toward, step / 100)
    if (backgrounds.every(background => ratio(candidate, background) >= minimum)) return candidate
  }
  throw new Error('No accessible tone for the supplied surface pair')
}

export function resolveInterfaceTokens(mode: Mode, key: AccentKey): Record<string, string> {
  const palette = colors[mode]
  const surfaces = Object.entries(palette).filter(([name]) => name === 'background' || name.startsWith('surface')).map(([, value]) => value)
  const toward = mode === 'light' ? '#000000' : '#FFFFFF'
  const accent = resolveAccentColors(key, mode)
  const primary = readable(accent.primary, surfaces, 4.5, toward)
  const text = readable(palette.onSurface, surfaces, 7, toward)
  const muted = readable(palette.onSurfaceVariant, surfaces, 7, toward)
  const selection = mix(palette.surface, primary, mode === 'light' ? .09 : .14)
  const status = mode === 'light'
    ? { success: '#207446', warning: '#8B5A08', danger: '#B72B43', info: '#245BC3' }
    : { success: '#7BD5A4', warning: '#EBC264', danger: '#FF9DA8', info: '#81BAFF' }
  const tokens: Record<string, string> = {
    '--ds-color-primary': primary,
    '--ds-color-primary-soft': readable(accent.soft, surfaces, 4.5, toward),
    '--ds-color-on-primary': accent.onPrimary,
    '--ds-color-on-surface': text,
    '--ds-color-on-surface-variant': muted,
    '--ds-control-border': readable(palette.outlineStrong, surfaces, 3, toward),
    '--ds-focus-ring': readable(primary, [...surfaces, selection], 3, toward),
    '--ds-focus-gap': palette.surface,
    '--ds-selection-bg': selection,
    '--ds-selection-text': readable(primary, [selection], 4.5, toward),
    '--ds-disabled-bg': palette.surfaceVariant,
    '--ds-disabled-text': readable(palette.onSurfaceVariant, [palette.surfaceVariant], 4.5, toward),
    '--ds-action-neutral-default': palette.surfaceCard,
    '--ds-action-neutral-hover': palette.surfaceContainerHigh,
    '--ds-action-neutral-active': palette.surfaceVariant,
    '--ds-action-neutral-text': text,
  }
  for (const [role, seed] of Object.entries(status)) tokens[`--ds-color-${role}`] = readable(seed, surfaces, 4.5, toward)
  tokens['--ds-color-error'] = tokens['--ds-color-danger']!
  for (const [tone, seed] of [['primary', primary], ['danger', tokens['--ds-color-danger']!]]) {
    tokens[`--ds-action-${tone}-text`] = accent.onPrimary
    for (const [state, amount] of [['default', 0], ['hover', .09], ['active', .18]] as const) {
      tokens[`--ds-action-${tone}-${state}`] = readable(mix(seed!, toward, amount), [accent.onPrimary], 4.5, toward)
    }
  }
  return tokens
}
