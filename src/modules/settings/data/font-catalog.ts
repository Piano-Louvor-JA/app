import catalog from '../../../../electron/fonts/catalog.json'

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting'
export type CatalogFont = {
  id: string
  family: string
  category: FontCategory
  ui: boolean
  weights: number[]
  subsets: string[]
}

// Shared JSON lives with main-process assets so electron-builder includes it.
export const FONT_CATALOG = catalog as CatalogFont[]
export const findFont = (id: string | null | undefined) => FONT_CATALOG.find(font => font.id === id)
export const DEFAULT_FONT_FAMILY = "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
