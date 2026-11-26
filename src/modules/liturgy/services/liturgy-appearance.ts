import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import { LITURGY_ITEM_TYPES, type LiturgyItemType } from '../types/liturgy'

/**
 * Aparência da lista da liturgia na tela do operador: a linha das
 * categorias (fundo, título, horário, subtítulo) e a cor de cada tipo de
 * item. Não muda o que vai para as telas (isso é o Palco).
 */
export type LiturgyTitleAlign = 'left' | 'center'
export type LiturgyTitleSize = 'sm' | 'md' | 'lg' | 'xl'

export const LITURGY_TITLE_SIZES: LiturgyTitleSize[] = ['sm', 'md', 'lg', 'xl']

export interface LiturgyCategoryAppearance {
  /** Fundo da linha da categoria (#rrggbb); '' = o padrão do tema. */
  background: string
  titleAlign: LiturgyTitleAlign
  titleSize: LiturgyTitleSize
  bold: boolean
  uppercase: boolean
  /** Cor do título (#rrggbb); '' = a do tema. */
  titleColor: string
  showTime: boolean
  showSubtitle: boolean
}

export interface LiturgyAppearance {
  category: LiturgyCategoryAppearance
  /** Cor escolhida por tipo; ausente = a cor do próprio item. */
  typeColors: Partial<Record<LiturgyItemType, string>>
}

export const DEFAULT_LITURGY_APPEARANCE: LiturgyAppearance = Object.freeze({
  category: Object.freeze({
    background: '',
    titleAlign: 'left',
    titleSize: 'md',
    bold: true,
    uppercase: false,
    titleColor: '',
    showTime: true,
    showSubtitle: true,
  }),
  typeColors: Object.freeze({}),
}) as LiturgyAppearance

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** '#abc' → '#aabbcc'; inválida → ''. */
function color(value: unknown): string {
  if (typeof value !== 'string' || !HEX.test(value.trim())) return ''
  const hex = value.trim().toLowerCase()
  return hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function normalizeLiturgyAppearance(raw: unknown): LiturgyAppearance {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const cat = source.category && typeof source.category === 'object'
    ? (source.category as Record<string, unknown>)
    : {}
  const base = DEFAULT_LITURGY_APPEARANCE.category
  const typeColors: Partial<Record<LiturgyItemType, string>> = {}
  if (source.typeColors && typeof source.typeColors === 'object') {
    for (const [type, value] of Object.entries(source.typeColors as Record<string, unknown>)) {
      const hex = color(value)
      if (hex && (LITURGY_ITEM_TYPES as readonly string[]).includes(type)) {
        typeColors[type as LiturgyItemType] = hex
      }
    }
  }
  return {
    category: {
      background: color(cat.background),
      titleAlign: cat.titleAlign === 'center' ? 'center' : base.titleAlign,
      titleSize: LITURGY_TITLE_SIZES.includes(cat.titleSize as LiturgyTitleSize)
        ? (cat.titleSize as LiturgyTitleSize)
        : base.titleSize,
      bold: bool(cat.bold, base.bold),
      uppercase: bool(cat.uppercase, base.uppercase),
      titleColor: color(cat.titleColor),
      showTime: bool(cat.showTime, base.showTime),
      showSubtitle: bool(cat.showSubtitle, base.showSubtitle),
    },
    typeColors,
  }
}

export function loadLiturgyAppearance(): LiturgyAppearance {
  return normalizeLiturgyAppearance(getUserPreference(USER_PREFERENCE_KEYS.liturgyAppearance, null))
}

export function saveLiturgyAppearance(appearance: LiturgyAppearance): LiturgyAppearance {
  const next = normalizeLiturgyAppearance(appearance)
  setUserPreference(USER_PREFERENCE_KEYS.liturgyAppearance, next)
  return next
}

/** Cor do tipo escolhida pelo operador; sem escolha, a cor do item. */
export function liturgyTypeColor(
  appearance: LiturgyAppearance,
  type: LiturgyItemType,
  itemColor: string,
): string {
  return appearance.typeColors[type] || itemColor
}
