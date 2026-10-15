import { onMounted, onUnmounted } from 'vue'

/** Botões laterais do mouse (`MouseEvent.button`). */
const MOUSE_BACK = 3
const MOUSE_FORWARD = 4

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

/** Mesmo critério do ESC da projeção: com diálogo aberto, o atalho é dele. */
function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null
}

/**
 * Atalhos do histórico de navegação na janela do operador:
 * Alt+← / Alt+→ e os botões laterais do mouse. Montar só no AppShell
 * (não existe na janela de projeção).
 */
export function useHistoryNavShortcuts({ back, forward }: { back: () => void; forward: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const action = event.key === 'ArrowLeft' ? back : event.key === 'ArrowRight' ? forward : null
    if (!action || isTypingTarget(event.target) || isDialogOpen()) return
    event.preventDefault()
    action()
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button === MOUSE_BACK || event.button === MOUSE_FORWARD) event.preventDefault()
  }

  function onMouseUp(event: MouseEvent) {
    const action = event.button === MOUSE_BACK ? back : event.button === MOUSE_FORWARD ? forward : null
    if (!action || isDialogOpen()) return
    event.preventDefault()
    action()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
  })
}
