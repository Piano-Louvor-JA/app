import { getDesktopBridge } from '@shared/services/desktop-bridge'

/**
 * Miniatura da área de um elemento (prévia de página minimizada).
 * Só no desktop: o main captura a janela (`window:capture-preview`).
 * No navegador, sem área ou se a captura falhar → `null` (prévia em cartão).
 */
export async function capturePagePreview(el: Element | null): Promise<string | null> {
  const bridge = getDesktopBridge()
  const capture = bridge?.window?.capturePreview
  if (!capture || !el) return null

  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  // getBoundingClientRect é em CSS px; com zoom da interface, a janela é maior.
  const factor = bridge.zoom?.getFactor() ?? 1
  try {
    return await capture({
      x: Math.round(rect.x * factor),
      y: Math.round(rect.y * factor),
      width: Math.round(rect.width * factor),
      height: Math.round(rect.height * factor),
    })
  } catch {
    return null
  }
}
