import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

export type MediaChromePosition = { x: number; y: number }

type Size = { width: number; height: number }

/** Distância mínima da borda da janela ao reposicionar o player minimizado. */
export const MEDIA_CHROME_EDGE_MARGIN = 8

export function normalizeMediaChromePosition(raw: unknown): MediaChromePosition | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y } = raw as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** Mantém o player inteiro dentro da janela (cola na margem se não couber). */
export function clampMediaChromePosition(
  position: MediaChromePosition,
  size: Size,
  viewport: Size,
  margin = MEDIA_CHROME_EDGE_MARGIN,
): MediaChromePosition {
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  return {
    x: Math.round(Math.min(maxX, Math.max(margin, position.x))),
    y: Math.round(Math.min(maxY, Math.max(margin, position.y))),
  }
}

export function loadMediaChromePosition(): MediaChromePosition | null {
  return normalizeMediaChromePosition(
    getUserPreference<unknown>(USER_PREFERENCE_KEYS.mediaChromePosition, null),
  )
}

export function saveMediaChromePosition(position: MediaChromePosition | null): void {
  setUserPreference(USER_PREFERENCE_KEYS.mediaChromePosition, position)
}
