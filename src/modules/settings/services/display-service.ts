import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'
import type { SystemDisplayInfo } from '@shared/types/desktop-bridge'

import type { SystemDisplay } from '../types/projection'

function toSystemDisplay(info: SystemDisplayInfo): SystemDisplay {
  return {
    id: info.id,
    bounds: { ...info.bounds },
    workArea: { ...info.workArea },
    scaleFactor: info.scaleFactor,
    isPrimary: info.isPrimary,
  }
}

/** Lists physical monitors via Electron; a browser preview must not invent hardware. */
export async function listSystemDisplays(): Promise<SystemDisplay[]> {
  if (!isDesktopApp()) return []

  const bridge = getDesktopBridge()
  if (!bridge?.displays?.list) return []

  try {
    const displays = await bridge.displays.list()
    return (displays ?? []).map(toSystemDisplay)
  } catch (error) {
    console.error('[projection] falha ao listar monitores', error)
    return []
  }
}

/**
 * Inscreve no hotplug de monitores (main → displays:changed).
 * Retorna unsubscribe; no-op fora do Electron.
 */
export function subscribeDisplaysChanged(
  callback: (displays: SystemDisplay[]) => void,
): () => void {
  if (!isDesktopApp()) return () => {}

  const bridge = getDesktopBridge()
  if (!bridge?.displays?.onChanged) return () => {}

  return bridge.displays.onChanged((payload) => {
    const list = Array.isArray(payload) ? payload.map(toSystemDisplay) : []
    callback(list)
  })
}

/** Exibe overlay numerado em cada monitor por alguns segundos. */
export async function identifySystemDisplays(): Promise<boolean> {
  if (!isDesktopApp()) return false

  const bridge = getDesktopBridge()
  if (!bridge?.displays?.identify) return false

  try {
    return Boolean(await bridge.displays.identify())
  } catch (error) {
    console.error('[projection] falha ao identificar monitores', error)
    return false
  }
}

export function formatDisplayResolution(display: SystemDisplay): string {
  return `${display.bounds.width} × ${display.bounds.height}`
}

/** Monitores estendidos (não primários) elegíveis para projeção multi-tela. */
export function listExtendedDisplays(displays: SystemDisplay[]): SystemDisplay[] {
  return displays.filter((display) => !display.isPrimary)
}
