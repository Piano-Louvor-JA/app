import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'

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

type StackEntry = { order: number; height: number; active: boolean }

/** Painéis montados no canto padrão (sem posição arrastada), por instância. */
const stackEntries = reactive(new Map<symbol, StackEntry>())

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
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * Painel flutuante solto na tela (player minimizado, prévias da Bíblia e do
 * Timer): arrasta por qualquer ponto fora dos botões, persiste left/top na
 * preferência `preferenceKey` e volta ao canto padrão com `resetPosition`.
 * Com `stackOrder`, empilha no canto padrão sobre os painéis de ordem menor.
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

  function syncStack() {
    if (options.stackOrder === undefined) return
    const el = rootRef.value
    stackEntries.set(stackId, {
      order: options.stackOrder,
      height: el ? el.getBoundingClientRect().height : 0,
      active: el != null && position.value == null,
    })
  }

  const positionStyle = computed(() => {
    if (position.value) {
      return {
        left: `${position.value.x}px`,
        top: `${position.value.y}px`,
        right: 'auto',
        bottom: 'auto',
      }
    }
    const offset = stackOffset(stackId)
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
    if (drag.moved) saveFloatingPosition(preferenceKey, position.value)
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
    if (el) clampToViewport()
    syncStack()
  })

  watch(position, syncStack)

  onMounted(() => {
    onResize()
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
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
