/** Detecta janela de projeção (/popup) — espelha o legado `location.href.includes("popup")`. */
export function isProjectionPopupLocation(): boolean {
  if (typeof window === 'undefined') return false
  const href = window.location.href
  const path = window.location.pathname
  return href.includes('#/popup') || path.includes('/popup') || href.includes('/popup?')
}

/**
 * Popup aberta pela projeção independente (`independent=1`). Ela ignora o
 * "desligar" que o takeover da projeção principal publica no runtime do módulo.
 */
export function isIndependentProjectionLocation(): boolean {
  if (!isProjectionPopupLocation()) return false
  return /[?&]independent=1(?:&|$)/.test(window.location.href)
}
