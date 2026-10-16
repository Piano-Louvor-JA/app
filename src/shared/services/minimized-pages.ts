/**
 * Modelo puro das páginas minimizadas (barra acima do dock). Sem Vue/Pinia.
 * Todas as funções devolvem uma lista nova e não alteram a recebida.
 */
import type { ScrollMark } from './view-scroll-memory'

/** Máximo de páginas na barra; ao passar, sai a minimizada há mais tempo. */
export const MINIMIZED_PAGES_MAX = 6

export interface MinimizedPage {
  fullPath: string
  routeName: string | null
  title: string
  /** Classe Tabler, ex.: `ti-book`. */
  icon: string
  /** Resumo curto para a prévia, ex.: "Busca: santo · 610 faixas". */
  summary: string
  /** Retrato da tela; cada tela define o formato. */
  state: unknown
  scroll: ScrollMark[]
  /** Miniatura (data URL JPEG) no desktop; `null` = prévia em cartão. */
  preview: string | null
  minimizedAt: number
}

/** Mantém no máximo `MINIMIZED_PAGES_MAX`, tirando as minimizadas há mais tempo. */
function enforceLimit(list: MinimizedPage[]): MinimizedPage[] {
  const result = [...list]
  while (result.length > MINIMIZED_PAGES_MAX) {
    const oldest = result.reduce((min, item, index) => (item.minimizedAt < result[min].minimizedAt ? index : min), 0)
    result.splice(oldest, 1)
  }
  return result
}

/** Minimiza: mesma página substitui no lugar; página nova vai para o fim. */
export function addMinimized(list: MinimizedPage[], page: MinimizedPage): MinimizedPage[] {
  const index = list.findIndex((item) => item.fullPath === page.fullPath)
  if (index >= 0) {
    const next = [...list]
    next[index] = page
    return next
  }
  return enforceLimit([...list, page])
}

export function removeMinimized(list: MinimizedPage[], fullPath: string): MinimizedPage[] {
  return list.filter((item) => item.fullPath !== fullPath)
}

function isScrollMark(value: unknown): value is ScrollMark {
  if (typeof value !== 'object' || value === null) return false
  const { path, top, left } = value as Record<string, unknown>
  return (
    Array.isArray(path) &&
    path.every((n) => Number.isInteger(n)) &&
    typeof top === 'number' &&
    typeof left === 'number'
  )
}

function parsePage(value: unknown): MinimizedPage | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const { fullPath, routeName, title, icon, summary, minimizedAt } = raw
  if (
    typeof fullPath !== 'string' ||
    typeof title !== 'string' ||
    typeof icon !== 'string' ||
    typeof summary !== 'string' ||
    typeof minimizedAt !== 'number' ||
    !Number.isFinite(minimizedAt) ||
    (routeName !== null && typeof routeName !== 'string')
  ) {
    return null
  }
  const scroll = Array.isArray(raw.scroll) && raw.scroll.every(isScrollMark) ? raw.scroll : []
  return {
    fullPath,
    routeName,
    title,
    icon,
    summary,
    state: raw.state,
    scroll,
    preview: typeof raw.preview === 'string' ? raw.preview : null,
    minimizedAt,
  }
}

/** Valida a lista salva (sessionStorage): itens inválidos são descartados. */
export function parseMinimizedPages(raw: unknown): MinimizedPage[] {
  if (!Array.isArray(raw)) return []
  const pages = raw.map(parsePage).filter((page): page is MinimizedPage => page !== null)
  return enforceLimit(pages)
}
