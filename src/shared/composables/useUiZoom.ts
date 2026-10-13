import { computed, onMounted, onUnmounted, ref } from 'vue'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import { isProjectionPopupLocation } from '@shared/services/projection-window-location'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

/** Limites alinhados aos botões (70%–150%). */
const ZOOM_MIN = 0.7
const ZOOM_MAX = 1.5
const ZOOM_DEFAULT = 1

/**
 * Chromium às vezes devolve ~1.01 (101%) no nível 0.
 * Valores que arredondam para 99–101% viram exatamente 100%.
 */
function snapZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
  const percent = Math.round(clamped * 100)
  if (percent >= 99 && percent <= 101) return ZOOM_DEFAULT
  return clamped
}

function clampZoom(value: number): number {
  return snapZoom(value)
}

function formatZoomPercent(factor: number): number {
  return Math.round(snapZoom(factor) * 100)
}

function readStoredZoom(): number {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.uiZoom)
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return clampZoom(stored)
  }
  if (typeof stored === 'string') {
    const parsed = Number.parseFloat(stored)
    if (Number.isFinite(parsed)) return clampZoom(parsed)
  }
  return ZOOM_DEFAULT
}

const zoom = ref(readStoredZoom())

function clearCssZoom() {
  /* v8 ignore next 1 -- guard SSR; testes rodam em jsdom (document sempre definido) */
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.removeProperty('zoom')
  root.style.removeProperty('--ui-zoom')
}

function persistZoom(value: number): void {
  /* v8 ignore next 1 -- guard SSR; jsdom sempre tem localStorage */
  if (typeof localStorage === 'undefined') return
  setUserPreference(USER_PREFERENCE_KEYS.uiZoom, value)
}

function readNativeFactor(): number | null {
  const api = getDesktopBridge()?.zoom
  if (!api?.getFactor) return null
  try {
    return clampZoom(api.getFactor())
  } catch {
    return null
  }
}

/** Aplica zoom nativo Chromium (mesmo do Ctrl+/Ctrl−). Fallback: CSS. */
function applyZoom(value: number): number {
  const next = clampZoom(value)
  clearCssZoom()

  const api = getDesktopBridge()?.zoom
  if (api?.setFactor) {
    try {
      const applied = clampZoom(api.setFactor(next))
      zoom.value = applied
      return applied
    } catch {
      // fallback abaixo
    }
  }

  /* v8 ignore next 4 -- fallback CSS só em browser; guard SSR inalcançável em jsdom */
  if (typeof document !== 'undefined') {
    document.documentElement.style.zoom = String(next)
    document.documentElement.style.setProperty('--ui-zoom', String(next))
  }
  zoom.value = next
  return next
}

function syncFromNative(factor: number): void {
  const next = clampZoom(factor)
  // Sempre reaplica se precisou snapear (ex.: 101% → 100%)
  if (Math.abs(next - factor) > 1e-6) {
    applyZoom(next)
    persistZoom(next)
    return
  }
  zoom.value = next
  persistZoom(next)
}

/** Aplica o zoom persistido (chamar no boot). */
export function initUiZoom(): void {
  // Janela de projeção permanece em 100%
  if (isProjectionPopupLocation()) {
    clearCssZoom()
    return
  }
  applyZoom(zoom.value)
}

export function useUiZoom() {
  const zoomPercent = computed(() => formatZoomPercent(zoom.value))
  const canZoomIn = computed(() => zoom.value < ZOOM_MAX - 1e-9)
  const canZoomOut = computed(() => zoom.value > ZOOM_MIN + 1e-9)

  let unsubscribeZoom: (() => void) | undefined

  function setZoom(value: number): void {
    const applied = applyZoom(value)
    persistZoom(applied)
  }

  function zoomIn(): void {
    if (!canZoomIn.value) return
    const api = getDesktopBridge()?.zoom
    if (api?.zoomIn) {
      const raw = api.zoomIn()
      const applied = clampZoom(raw)
      if (Math.abs(applied - raw) > 1e-6) {
        applyZoom(applied)
      } else {
        zoom.value = applied
      }
      persistZoom(applied)
      return
    }
    setZoom(zoom.value + 0.1)
  }

  function zoomOut(): void {
    if (!canZoomOut.value) return
    const api = getDesktopBridge()?.zoom
    if (api?.zoomOut) {
      const raw = api.zoomOut()
      const applied = clampZoom(raw)
      if (Math.abs(applied - raw) > 1e-6) {
        applyZoom(applied)
      } else {
        zoom.value = applied
      }
      persistZoom(applied)
      return
    }
    setZoom(zoom.value - 0.1)
  }

  function resetZoom(): void {
    setZoom(ZOOM_DEFAULT)
  }

  onMounted(() => {
    if (isProjectionPopupLocation()) return

    // Reaplica preferência salva no motor nativo após o preload
    applyZoom(zoom.value)

    unsubscribeZoom = getDesktopBridge()?.zoom?.onChanged?.((payload) => {
      const factor =
        typeof payload?.factor === 'number' ? payload.factor : readNativeFactor()
      if (factor == null) return
      syncFromNative(factor)
    })
  })

  onUnmounted(() => {
    unsubscribeZoom?.()
  })

  return {
    zoom,
    zoomPercent,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    min: ZOOM_MIN,
    max: ZOOM_MAX,
  }
}
