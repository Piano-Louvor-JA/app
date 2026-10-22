import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { arrangeFloatingPanels } from '@shared/services/floating-layout'

import {
  clampFloatingPosition,
  loadFloatingPosition,
  saveFloatingPosition,
  type FloatingPosition,
} from '@shared/services/floating-position'

/** Deslocamento mínimo (px) para o gesto contar como arraste e não clique. */
const DRAG_THRESHOLD = 4

type DragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  grabOffsetX: number
  grabOffsetY: number
  width: number
  height: number
  origin: FloatingPosition | null
  moved: boolean
}

/** Espaço (px) entre painéis empilhados no canto padrão. */
export const FLOATING_STACK_GAP = 12

/** Ordem de baixo para cima dos painéis que dividem o canto padrão. */
export const FLOATING_STACK_ORDER = { media: 0, bible: 1, countdown: 2, timer: 3, clock: 4, random: 5 } as const

type StackEntry = {
  order: number
  height: number
  width: number
  left: number
  top: number
  titleInset: number
  active: boolean
  visible: boolean
  position: FloatingPosition | null
}

/** Todos os painéis registrados, incluindo os arrastados e suas posições salvas. */
const stackEntries = reactive(new Map<symbol, StackEntry>())
const layoutViewport = ref({ width: 0, height: 0 })

const arrangedPositions = computed(() => {
  const entries = [...stackEntries].filter(([, entry]) => entry.visible && entry.width > 0 && entry.height > 0)
    .sort((a, b) => a[1].order - b[1].order)
  const rects = entries.map(([id, entry], index) => ({
    id: String(index), width: entry.width, height: entry.height,
    x: entry.position?.x ?? entry.left,
    y: entry.position ? entry.position.y - entry.titleInset : entry.top - stackOffset(id),
  }))
  const arranged = arrangeFloatingPanels(rects, layoutViewport.value, FLOATING_STACK_GAP)
  return new Map(entries.map(([id], index) => [id, arranged[index]!]))
})

function stackOffset(id: symbol): number {
  const me = stackEntries.get(id)
  if (!me?.active) return 0
  let offset = 0
  for (const [otherId, other] of stackEntries) {
    if (otherId !== id && other.active && other.order < me.order) {
      offset += other.height + FLOATING_STACK_GAP
    }
  }
  return offset
}

function viewportSize() {
  // O dock cobre a parte inferior da janela: essa faixa não é área livre
  // para prévias, mesmo quando ainda está dentro do viewport do navegador.
  const dock = document.querySelector('.ds-dock')?.getBoundingClientRect()
  const bottom = dock && dock.height > 0 && dock.top > 0
    ? Math.min(window.innerHeight, dock.top)
    : window.innerHeight
  return { width: window.innerWidth, height: bottom }
}

/**
 * Painel flutuante solto na tela (player minimizado, prévias da Bíblia e do
 * Timer): arrasta por qualquer ponto fora dos botões, persiste left/top na
 * preferência `preferenceKey` e volta ao canto padrão com `resetPosition`.
 * Com `stackOrder`, organiza todos os painéis visíveis sem sobreposição,
 * preferindo a pilha padrão e respeitando as posições arrastadas quando livres.
 */
export function useFloatingDrag(
  rootRef: Ref<HTMLElement | null>,
  preferenceKey: string,
  options: { stackOrder?: number } = {},
) {
  const position = ref<FloatingPosition | null>(loadFloatingPosition(preferenceKey))
  const dragging = ref(false)
  let drag: DragState | null = null
  const stackId = Symbol(preferenceKey)
  let resizeObserver: ResizeObserver | undefined

  function observeBounds() {
    resizeObserver?.disconnect()
    if (rootRef.value) resizeObserver?.observe(rootRef.value)
    const dock = document.querySelector('.ds-dock')
    if (dock) resizeObserver?.observe(dock)
  }

  function syncStack() {
    if (options.stackOrder === undefined) return
    const el = rootRef.value
    // Mede a âncora CSS sem o deslocamento aplicado pela organização automática.
    const savedStyle = el?.style.cssText
    if (el) for (const key of ['left', 'top', 'right', 'bottom', 'transform']) el.style.removeProperty(key)
    const rect = el?.getBoundingClientRect()
    const titleRect = el?.querySelector('.floating-preview-title')?.getBoundingClientRect()
    const titleInset = rect && titleRect ? Math.max(0, rect.top - titleRect.top) : 0
    if (el && savedStyle !== undefined) el.style.cssText = savedStyle
    layoutViewport.value = viewportSize()
    stackEntries.set(stackId, {
      order: options.stackOrder,
      height: (rect?.height ?? 0) + titleInset,
      width: rect?.width ?? 0,
      left: rect?.left ?? 0,
      top: (rect?.top ?? 0) - titleInset,
      titleInset,
      active: el != null && position.value == null,
      visible: el != null,
      position: position.value,
    })
  }

  const positionStyle = computed(() => {
    const arranged = arrangedPositions.value.get(stackId)
    if (position.value) {
      const effective = arranged ?? position.value
      return {
        left: `${effective.x}px`,
        top: `${effective.y + (arranged ? stackEntries.get(stackId)?.titleInset ?? 0 : 0)}px`,
        right: 'auto',
        bottom: 'auto',
      }
    }
    const offset = stackOffset(stackId)
    const entry = stackEntries.get(stackId)
    if (arranged && entry) {
      const dx = arranged.x - entry.left
      const dy = arranged.y - entry.top
      if (dx !== 0) return { transform: `translate(${dx}px, ${dy}px)` }
      return dy !== 0 ? { transform: `translateY(${dy}px)` } : undefined
    }
    return offset > 0 ? { transform: `translateY(-${offset}px)` } : undefined
  })

  function clampToViewport() {
    const el = rootRef.value
    if (!el || !position.value) return
    const rect = el.getBoundingClientRect()
    position.value = clampFloatingPosition(
      position.value,
      { width: rect.width, height: rect.height },
      viewportSize(),
    )
  }

  function stopListening() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || drag) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button')) return
    const el = rootRef.value
    /* v8 ignore next -- o handler só existe com o elemento montado */
    if (!el) return

    event.preventDefault()
    const rect = el.getBoundingClientRect()
    drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      origin: position.value,
      moved: false,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (!drag.moved) {
      const distance = Math.hypot(
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
      )
      if (distance < DRAG_THRESHOLD) return
      drag.moved = true
      dragging.value = true
    }
    position.value = clampFloatingPosition(
      { x: event.clientX - drag.grabOffsetX, y: event.clientY - drag.grabOffsetY },
      { width: drag.width, height: drag.height },
      viewportSize(),
    )
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (drag.moved) {
      syncStack()
      const arranged = arrangedPositions.value.get(stackId)
      if (arranged) position.value = { x: arranged.x, y: arranged.y + (stackEntries.get(stackId)?.titleInset ?? 0) }
      saveFloatingPosition(preferenceKey, position.value)
    }
    drag = null
    dragging.value = false
    stopListening()
  }

  function onPointerCancel(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    position.value = drag.origin
    drag = null
    dragging.value = false
    stopListening()
  }

  function resetPosition() {
    position.value = null
    saveFloatingPosition(preferenceKey, null)
  }

  function onResize() {
    clampToViewport()
    syncStack()
  }

  watch(rootRef, (el) => {
    observeBounds()
    if (el) clampToViewport()
    syncStack()
  })

  watch(position, syncStack)

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize)
      observeBounds()
    }
    onResize()
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', onResize)
    stopListening()
    stackEntries.delete(stackId)
  })

  return {
    position,
    positionStyle,
    dragging,
    onPointerDown,
    resetPosition,
  }
}
