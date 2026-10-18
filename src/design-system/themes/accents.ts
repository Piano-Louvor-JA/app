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

/** Louange: each accent has a separate ink for light surfaces. */
export const accents = {
  azure: { id: 'azure', label: 'Azul horizonte', primary: '#81BAFF', soft: '#B9D7FF', light: '#245BC3' },
  teal: { id: 'teal', label: 'Verde oceano', primary: '#5ED5C5', soft: '#ACEDE3', light: '#087B70' },
  violet: { id: 'violet', label: 'Violeta', primary: '#BBA6FF', soft: '#DED2FF', light: '#7043C2' },
  apricot: { id: 'apricot', label: 'Ouro', primary: '#EBC264', soft: '#F6DFA8', light: '#8B5A08' },
  orange: { id: 'orange', label: 'Terracota', primary: '#F3AB82', soft: '#F8D5BF', light: '#AD4B17' },
  emerald: { id: 'emerald', label: 'Verde jardim', primary: '#7BD5A4', soft: '#B6EBCB', light: '#207446' },
} as const

export type AccentKey = keyof typeof accents
export type AccentDefinition = (typeof accents)[AccentKey]
export const defaultAccent: AccentKey = 'azure'

export function resolveAccentColors(key: AccentKey, mode: 'light' | 'dark') {
  const accent = accents[key]
  return {
    primary: mode === 'light' ? accent.light : accent.primary,
    soft: mode === 'light' ? accent.light : accent.soft,
    onPrimary: mode === 'light' ? '#FFFFFF' : '#081522',
  }
}
