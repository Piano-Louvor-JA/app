import { colors } from '../tokens/colors'
import { resolveInterfaceTokens } from '../tokens/interface'
import type { AccentKey } from './accents'

/** Bridge library components to the same semantic palette as the app shell. */
export function resolveVuetifyColors(mode: 'light' | 'dark', accent: AccentKey) {
  const palette = colors[mode]
  const tokens = resolveInterfaceTokens(mode, accent)
  return {
    background: palette.background,
    surface: palette.surface,
    'surface-bright': palette.surfaceElevated,
    'surface-light': palette.surfaceContainerHigh,
    'surface-variant': palette.surfaceVariant,
    'on-background': tokens['--ds-color-on-surface']!,
    'on-surface': tokens['--ds-color-on-surface']!,
    'on-surface-variant': tokens['--ds-color-on-surface-variant']!,
    primary: tokens['--ds-action-primary-default']!,
    'on-primary': tokens['--ds-action-primary-text']!,
    secondary: tokens['--ds-color-primary-soft']!,
    'on-secondary': tokens['--ds-color-on-primary']!,
    error: tokens['--ds-color-danger']!,
    success: tokens['--ds-color-success']!,
    warning: tokens['--ds-color-warning']!,
    info: tokens['--ds-color-info']!,
  }
}
