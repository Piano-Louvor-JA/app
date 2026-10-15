import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

import {
  clampMediaChromePosition,
  loadMediaChromePosition,
  saveMediaChromePosition,
  type MediaChromePosition,
} from '../services/media-chrome-position'

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
  origin: MediaChromePosition | null
  moved: boolean
}

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * Player minimizado solto na tela: arrasta pelo preview (ou pelo vão entre
 * os botões), persiste left/top e volta ao canto padrão com duplo clique.
 */
export function useMediaChromeDrag(rootRef: Ref<HTMLElement | null>) {
  const position = ref<MediaChromePosition | null>(loadMediaChromePosition())
  const dragging = ref(false)
  let drag: DragState | null = null

  const positionStyle = computed(() =>
    position.value
      ? {
          left: `${position.value.x}px`,
          top: `${position.value.y}px`,
          right: 'auto',
          bottom: 'auto',
        }
      : undefined,
  )

  function clampToViewport() {
    const el = rootRef.value
    if (!el || !position.value) return
    const rect = el.getBoundingClientRect()
    position.value = clampMediaChromePosition(
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
    position.value = clampMediaChromePosition(
      { x: event.clientX - drag.grabOffsetX, y: event.clientY - drag.grabOffsetY },
      { width: drag.width, height: drag.height },
      viewportSize(),
    )
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (drag.moved) saveMediaChromePosition(position.value)
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
    saveMediaChromePosition(null)
  }

  watch(rootRef, (el) => {
    if (el) clampToViewport()
  })

  onMounted(() => {
    clampToViewport()
    window.addEventListener('resize', clampToViewport)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', clampToViewport)
    stopListening()
  })

  return {
    position,
    positionStyle,
    dragging,
    onPointerDown,
    resetPosition,
  }
}
