import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'

import {
  buildMonitorLayout,
  canvasDeltaToVirtual,
  type MonitorLayoutPlan,
  type MonitorLayoutTile,
} from '../services/monitor-layout'
import { useProjectionSettings } from './useProjectionSettings'

type DragState = {
  displayId: number
  pointerId: number
  startClientX: number
  startClientY: number
  originVirtualX: number
  originVirtualY: number
  /** Offset visual em px no canvas (não altera o scale do layout). */
  offsetX: number
  offsetY: number
}

/**
 * Canvas de arranjo físico: posiciona pelos bounds do SO e permite
 * arrastar monitores, persistindo o layout customizado.
 */
export function useMonitorArrangement(stageRef: Ref<HTMLElement | null>) {
  const {
    displays,
    settings,
    hasCustomArrangement,
    moveMonitorInArrangement,
    resetMonitorArrangement,
  } = useProjectionSettings()

  const stageWidth = ref(640)
  const stageHeight = ref(352)
  const draggingId = ref<number | null>(null)
  const dragOffset = ref({ x: 0, y: 0 })

  let drag: DragState | null = null
  let resizeObserver: ResizeObserver | null = null

  const baseLayout = computed<MonitorLayoutPlan>(() =>
    buildMonitorLayout(
      displays.value,
      settings.value.monitorArrangement,
      stageWidth.value,
      stageHeight.value,
    ),
  )

  const tiles = computed<MonitorLayoutTile[]>(() => {
    const list = baseLayout.value.tiles
    if (draggingId.value == null) return list

    return list.map((tile) => {
      if (tile.id !== draggingId.value) return tile
      return {
        ...tile,
        left: tile.left + dragOffset.value.x,
        top: tile.top + dragOffset.value.y,
      }
    })
  })

  function measureStage() {
    const el = stageRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    stageWidth.value = Math.max(240, Math.floor(rect.width))
    stageHeight.value = Math.max(220, Math.floor(rect.height))
  }

  function findTile(displayId: number): MonitorLayoutTile | undefined {
    return baseLayout.value.tiles.find((tile) => tile.id === displayId)
  }

  function onPointerDown(event: PointerEvent, displayId: number) {
    if (event.button !== 0) return
    const tile = findTile(displayId)
    if (!tile) return

    event.preventDefault()
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId,
    )

    drag = {
      displayId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originVirtualX: tile.virtual.x,
      originVirtualY: tile.virtual.y,
      offsetX: 0,
      offsetY: 0,
    }
    draggingId.value = displayId
    dragOffset.value = { x: 0, y: 0 }
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return

    const offsetX = event.clientX - drag.startClientX
    const offsetY = event.clientY - drag.startClientY
    drag.offsetX = offsetX
    drag.offsetY = offsetY
    dragOffset.value = { x: offsetX, y: offsetY }
  }

  function commitDrag() {
    /* v8 ignore next 4 -- onPointerUp/Cancel só chamam commitDrag com drag ativo */
    if (!drag) {
      draggingId.value = null
      dragOffset.value = { x: 0, y: 0 }
      return
    }

    const delta = canvasDeltaToVirtual(
      drag.offsetX,
      drag.offsetY,
      baseLayout.value.scale,
    )

    moveMonitorInArrangement(
      drag.displayId,
      drag.originVirtualX + delta.x,
      drag.originVirtualY + delta.y,
    )

    drag = null
    draggingId.value = null
    dragOffset.value = { x: 0, y: 0 }
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    commitDrag()
  }

  function onPointerCancel(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    drag = null
    draggingId.value = null
    dragOffset.value = { x: 0, y: 0 }
  }

  function resetLayout() {
    resetMonitorArrangement()
  }

  onMounted(() => {
    void nextTick(() => {
      measureStage()
      if (typeof ResizeObserver === 'undefined' || !stageRef.value) return
      resizeObserver = new ResizeObserver(() => measureStage())
      resizeObserver.observe(stageRef.value)
    })
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  watch(displays, () => {
    void nextTick(() => measureStage())
  })

  return {
    tiles,
    draggingId,
    hasCustomArrangement,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    resetLayout,
  }
}
