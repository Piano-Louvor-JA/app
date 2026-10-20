/**
 * Posição da janela principal ao abrir (lógica pura, sem Electron).
 *
 * Caso real (Linux, GNOME, Wayland → XWayland): no Wayland nativo o
 * getBounds() não reflete a posição real e o app gravou x/y perto de
 * (0,0). Ao restaurar via XWayland, (0,0) caía na área morta acima de um
 * monitor secundário, e a janela abria lá cortada, sem a barra do topo.
 * Agora: posição não confiável é ignorada (abre no principal) e a janela
 * restaurada sempre cabe inteira num monitor.
 */

const MIN_WIDTH = 1024
const MIN_HEIGHT = 640

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {{ x?: number, y?: number, width: number, height: number, isMaximized: boolean }} Placement
 */

/**
 * x/y do getBounds() refletem a posição real? Falso só no Wayland nativo.
 * @param {{ platform: string, ozonePlatform: string, env: Record<string, string | undefined> }} args
 */
export function isPositionReliable({ platform, ozonePlatform, env }) {
  if (platform !== 'linux') return true
  if (ozonePlatform === 'x11') return true
  if (ozonePlatform === 'wayland') return false
  return env.XDG_SESSION_TYPE !== 'wayland' && !env.WAYLAND_DISPLAY
}

/** @param {Rect} a @param {Rect} b */
function intersectionArea(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Encaixa o retângulo inteiro dentro da área (reduz se for maior).
 * @param {Rect} rect @param {Rect} area
 * @returns {Rect}
 */
function fitInside(rect, area) {
  const width = Math.min(rect.width, area.width)
  const height = Math.min(rect.height, area.height)
  return {
    x: clamp(rect.x, area.x, area.x + area.width - width),
    y: clamp(rect.y, area.y, area.y + area.height - height),
    width,
    height,
  }
}

/** @param {{ width: number, height: number }} size @param {Rect} area @returns {Rect} */
function centerIn(size, area) {
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  }
}

/**
 * @param {{
 *   saved: (Rect & { isMaximized?: boolean }) | null,
 *   displays: Array<{ workArea: Rect }>,
 *   primary: { workArea: Rect } | null,
 *   trustPosition: boolean,
 *   defaults: { width: number, height: number },
 * }} args
 * @returns {Placement}
 */
export function placeMainWindow({ saved, displays, primary, trustPosition, defaults }) {
  const isMaximized = Boolean(saved?.isMaximized)
  const size = saved
    ? { width: Math.max(saved.width, MIN_WIDTH), height: Math.max(saved.height, MIN_HEIGHT) }
    : { ...defaults }

  if (!primary || displays.length === 0) return { ...size, isMaximized }

  if (!saved || !trustPosition) {
    return { ...centerIn(size, primary.workArea), isMaximized }
  }

  const rect = { x: saved.x, y: saved.y, ...size }
  let best = null
  let bestArea = 0
  for (const display of displays) {
    const area = intersectionArea(rect, display.workArea)
    if (area > bestArea) {
      best = display
      bestArea = area
    }
  }

  // Monitor desconectado / rearranjado: volta para o principal.
  if (!best) return { ...centerIn(size, primary.workArea), isMaximized }

  return { ...fitInside(rect, best.workArea), isMaximized }
}
