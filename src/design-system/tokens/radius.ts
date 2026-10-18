/** Consistent rounded surfaces for the Louange workspace. */
export const radius = {
  /** ROUND_EIGHT — inputs, botões, containers pequenos */
  eight: '8px',
  sm: '8px',
  md: '12px',
  /** Cards / containers grandes (Stitch) */
  lg: '16px',
  xl: '24px',
  full: '9999px',
} as const

export type RadiusToken = keyof typeof radius
