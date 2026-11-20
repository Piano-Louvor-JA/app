import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

export type FloatingPosition = { x: number; y: number }

type Size = { width: number; height: number }

/** Distância mínima da borda da janela ao reposicionar um painel flutuante. */
export const FLOATING_EDGE_MARGIN = 8

export function normalizeFloatingPosition(raw: unknown): FloatingPosition | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y } = raw as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** Mantém o painel inteiro dentro da janela (cola na margem se não couber). */
export function clampFloatingPosition(
  position: FloatingPosition,
  size: Size,
  viewport: Size,
  margin = FLOATING_EDGE_MARGIN,
): FloatingPosition {
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  return {
    x: Math.round(Math.min(maxX, Math.max(margin, position.x))),
    y: Math.round(Math.min(maxY, Math.max(margin, position.y))),
  }
}

export function loadFloatingPosition(preferenceKey: string): FloatingPosition | null {
  return normalizeFloatingPosition(getUserPreference<unknown>(preferenceKey, null))
}

export function saveFloatingPosition(
  preferenceKey: string,
  position: FloatingPosition | null,
): void {
  setUserPreference(preferenceKey, position)
}
