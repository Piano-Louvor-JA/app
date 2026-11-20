import { getDesktopBridge } from '@shared/services/desktop-bridge'

import type { Box } from './genie-animation'

/**
 * Área da tela em si (CSS px): o elemento sem o rodapé reservado, que fica
 * coberto pela faixa de histórico e pelo dock. É o que a miniatura mostra.
 */
export function previewArea(el: Element | null): Box | null {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const height = rect.height - (parseFloat(getComputedStyle(el).paddingBottom) || 0)
  if (rect.width <= 0 || height <= 0) return null
  return { left: rect.x, top: rect.y, width: rect.width, height }
}

/**
 * Miniatura da área de um elemento (prévia de página minimizada).
 * Só no desktop: o main captura a janela (`window:capture-preview`).
 * No navegador, sem área ou se a captura falhar → `null` (prévia em cartão).
 */
export async function capturePagePreview(el: Element | null): Promise<string | null> {
  const bridge = getDesktopBridge()
  const capture = bridge?.window?.capturePreview
  const area = previewArea(el)
  if (!capture || !area) return null

  // getBoundingClientRect é em CSS px; com zoom da interface, a janela é maior.
  const factor = bridge.zoom?.getFactor() ?? 1
  try {
    return await capture({
      x: Math.round(area.left * factor),
      y: Math.round(area.top * factor),
      width: Math.round(area.width * factor),
      height: Math.round(area.height * factor),
    })
  } catch {
    return null
  }
}
