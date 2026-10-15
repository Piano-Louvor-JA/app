import { onMounted, onUnmounted } from 'vue'

import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { HistoryCommandDirection } from '@shared/types/desktop-bridge'

/** Botões laterais do mouse (`MouseEvent.button`). */
const MOUSE_BACK = 3
const MOUSE_FORWARD = 4

/**
 * No Windows o mesmo clique no botão lateral pode chegar duas vezes: como
 * `mouseup` no DOM e como `app-command` pelo main. Dentro desta janela de
 * tempo, a segunda entrega da mesma direção é ignorada.
 */
const SIDE_BUTTON_DEDUPE_MS = 400

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
  const actions: Record<HistoryCommandDirection, () => void> = { back, forward }
  const lastSideButton: Record<HistoryCommandDirection, number> = { back: -Infinity, forward: -Infinity }
  let unsubscribeAppCommand: (() => void) | null = null

  /** Botão lateral (DOM ou app-command): navega, a menos que seja eco do mesmo clique. */
  function onSideButton(direction: HistoryCommandDirection) {
    const now = Date.now()
    const isEcho = now - lastSideButton[direction] < SIDE_BUTTON_DEDUPE_MS
    lastSideButton[direction] = now
    if (isEcho || isDialogOpen()) return
    actions[direction]()
  }

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
    const direction = event.button === MOUSE_BACK ? 'back' : event.button === MOUSE_FORWARD ? 'forward' : null
    if (!direction) return
    event.preventDefault()
    onSideButton(direction)
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    unsubscribeAppCommand = getDesktopBridge()?.window?.onHistoryCommand?.(onSideButton) ?? null
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    unsubscribeAppCommand?.()
  })
}
