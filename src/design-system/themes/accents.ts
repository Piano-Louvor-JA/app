/**
 * Acentos de cor da tela de Aparência (Stitch settings/appearance).
 * Sobrescrevem --ds-color-primary / --ds-color-primary-soft em runtime.
 *
 * Para restaurar a paleta anterior: troque `accents` por `accentsLegacy`
 * (ou copie os valores de `accentsLegacy` de volta para `accents`).
 */

/** Paleta anterior (backup) — realces mais vivos/saturados. */
export const accentsLegacy = {
  azure: {
    id: 'azure',
    label: 'Azure',
    primary: '#2196f3',
    soft: '#9ecaff',
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    primary: '#0d9488',
    soft: '#78d6d2',
  },
  apricot: {
    id: 'apricot',
    label: 'Apricot',
    primary: '#db7900',
    soft: '#ffb77b',
  },
  orange: {
    id: 'orange',
    label: 'Orange',
    primary: '#ea580c',
    soft: '#fb923c',
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    primary: '#059669',
    soft: '#34d399',
  },
} as const

/**
 * Paleta atual — 4 realces.
 * Ordem: âmbar → laranja (padrão) → verde-água → verde (verdes juntos).
 * Azure e demais tons foram removidos da UI.
 */
export const accents = {
  apricot: {
    id: 'apricot',
    label: 'Âmbar',
    primary: '#E0A84A',
    soft: '#F0D9A8',
  },
  orange: {
    id: 'orange',
    label: 'Laranja',
    primary: '#E0895A',
    soft: '#F0C4A8',
  },
  teal: {
    id: 'teal',
    label: 'Verde-água',
    primary: '#4DB6AC',
    soft: '#B2DFDB',
  },
  emerald: {
    id: 'emerald',
    label: 'Verde',
    primary: '#6BAA7A',
    soft: '#B8D9C0',
  },
} as const

export type AccentKey = keyof typeof accents
export type AccentDefinition = (typeof accents)[AccentKey]

/** Padrão do sistema — não alterar sem decisão de produto. */
export const defaultAccent: AccentKey = 'orange'

/** Cor livre escolhida pelo usuário: mesma forma dos acentos prontos. */
export interface CustomAccentDefinition {
  id: 'custom'
  label: string
  primary: string
  soft: string
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/**
 * Tom de realce (soft) derivado da cor escolhida: a mesma cor clareada
 * em direção ao branco, como nos acentos prontos (ex.: #E0895A → #F0C4A8).
 */
export function deriveAccentSoft(hex: string): string {
  const mix = 0.55
  const channel = (start: number) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16)
    return Math.round(value + (255 - value) * mix)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase()
}

export function buildCustomAccent(hex: string): CustomAccentDefinition {
  const primary = hex.toUpperCase()
  return {
    id: 'custom',
    label: 'Personalizada',
    primary,
    soft: deriveAccentSoft(primary),
  }
}
