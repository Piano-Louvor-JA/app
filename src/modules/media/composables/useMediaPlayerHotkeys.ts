import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'

import { getDesktopBridge } from '@shared/services/desktop-bridge'

import { useMediaStore } from '../stores/useMediaStore'

/** True se o foco está digitando texto (não bloqueia range/botões). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = ((target as HTMLInputElement).type || 'text').toLowerCase()
  return ![
    'button',
    'checkbox',
    'radio',
    'range',
    'file',
    'reset',
    'submit',
    'color',
    'hidden',
  ].includes(type)
}

/**
 * Atalhos ←/→ do player de mídia no operador.
 *
 * Fica no App (não na MediaView): assim as setas funcionam assim que a sessão
 * maximiza — sem depender de foco no stage nem do fim da transição de rota.
 * Também escuta IPC quando a projeção rouba o foco e encaminha as setas.
 */
export function useMediaPlayerHotkeys(isProjectionWindow: () => boolean) {
  const store = useMediaStore()
  const { hasSession, minimized } = storeToRefs(store)

  function playerKeysActive(): boolean {
    return hasSession.value && !minimized.value && !isProjectionWindow()
  }

  function reclaimOperatorFocus() {
    try {
      window.focus()
    } catch {
      /* ignore */
    }
    if (typeof document === 'undefined') return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      const tag = active.tagName
      const type = tag === 'INPUT' ? ((active as HTMLInputElement).type || '').toLowerCase() : ''
      // Tira o foco de range/botão para as setas não ajustarem o seek nativo.
      if (tag === 'BUTTON' || type === 'range') {
        active.blur()
      }
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!playerKeysActive()) return
    if (isTypingTarget(event.target)) return

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      void store.previousSlide()
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      void store.nextSlide()
    }
  }

  function onProjectionNavigate(direction: unknown) {
    if (!playerKeysActive()) return
    if (direction === 'previous') {
      void store.previousSlide()
      return
    }
    if (direction === 'next') {
      void store.nextSlide()
    }
  }

  let unsubscribeIpc: (() => void) | null = null

  onMounted(() => {
    // capture: antes de input[type=range] consumir ←/→
    window.addEventListener('keydown', onKeyDown, true)
    unsubscribeIpc =
      getDesktopBridge()?.projection?.onMediaNavigate?.(onProjectionNavigate) ?? null
  })

  // Timers de reclaim pendentes — cancelados no unmount pra não dispararem
  // com o ambiente (document) já derrubado.
  let reclaimTimers: number[] = []

  function scheduleReclaims() {
    // Projeção / transição de rota podem roubar o foco logo em seguida.
    reclaimTimers.push(window.setTimeout(reclaimOperatorFocus, 50))
    reclaimTimers.push(window.setTimeout(reclaimOperatorFocus, 200))
    reclaimTimers.push(window.setTimeout(reclaimOperatorFocus, 500))
  }

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown, true)
    unsubscribeIpc?.()
    unsubscribeIpc = null
    for (const t of reclaimTimers) window.clearTimeout(t)
    reclaimTimers = []
  })

  watch(
    [hasSession, minimized],
    ([session, isMinimized]) => {
      if (session && !isMinimized && !isProjectionWindow()) {
        reclaimOperatorFocus()
        scheduleReclaims()
      }
    },
    { flush: 'post' },
  )
}
