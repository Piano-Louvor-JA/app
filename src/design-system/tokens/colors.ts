/**
 * Cores do design system (Stitch / Ethereal Lumens).
 * Fonte: docs/stitch/home/DESIGN.md · docs/prd/DESIGN_SYSTEM.md
 */
export const colors = {
  /** Ação / destaque (PRD) */
  primary: '#81BAFF',
  /** Texto de marca em dark (Stitch primary soft) */
  primarySoft: '#B9D7FF',
  secondary: '#5ED5C5',
  brandBlueAlt: '#0097D7',
  /** Amarelo do logo oficial */
  brandYellow: '#F8C800',

  dark: {
    background: '#0C1320',
    surface: '#101A2A',
    surfaceElevated: '#1C2B42',
    surfaceCard: '#172337',
    surfaceContainer: '#142035',
    surfaceContainerHigh: '#21314A',
    surfaceVariant: '#2B3D57',
    onSurface: '#F0F4FC',
    onSurfaceVariant: '#B4C2D7',
    onPrimary: '#081522',
    outline: '#2C3C53',
    outlineStrong: '#536881',
  },

  light: {
    background: '#F1F5FA',
    surface: '#F8FAFE',
    surfaceElevated: '#ffffff',
    surfaceCard: '#ffffff',
    surfaceContainer: '#EDF2F8',
    surfaceContainerHigh: '#E5EDF7',
    surfaceVariant: '#D9E4F1',
    onSurface: '#17253A',
    onSurfaceVariant: '#4E6078',
    onPrimary: '#ffffff',
    outline: '#D1DCE9',
    outlineStrong: '#788BA4',
  },
} as const

export type ColorPalette = typeof colors
