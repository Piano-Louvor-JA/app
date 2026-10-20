/**
 * Seleção de monitor e bounds das janelas de projeção.
 *
 * No Linux Wayland, a projeção usa bounds do monitor alvo antes de fullscreen
 * real. X11 preserva bounds + alwaysOnTop (fullscreen "fake") por compatibilidade
 * EWMH.
 */

const WINDOWED_WIDTH = 800
const WINDOWED_HEIGHT = 600

/**
 * Aplica o modo fullscreen sem sobrescrever a política Wayland após exibir.
 * @param {import('electron').BrowserWindow} childWindow
 * @param {boolean} fullscreen
 * @param {{ platform: NodeJS.Platform, sessionType?: string, screen: Pick<import('electron').Screen, 'getDisplayMatching'> }} runtime
 */
export function applyProjectionDisplayMode(childWindow, fullscreen, runtime) {
  if (childWindow.isDestroyed() || !fullscreen) return

  const { platform, sessionType, screen } = runtime
  const bounds = childWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)

  if (platform === 'linux' && sessionType === 'wayland') {
    childWindow.setBounds(display.bounds)
    childWindow.setFullScreen(true)
    return
  }

  if (platform === 'win32' || platform === 'linux') {
    childWindow.setFullScreen(false)
    childWindow.setBounds(display.bounds)
    childWindow.setAlwaysOnTop(true, 'screen-saver')
    return
  }

  childWindow.setFullScreen(true)
  if (platform === 'darwin') childWindow.setSimpleFullScreen(true)
  childWindow.setAlwaysOnTop(true, 'screen-saver')
}

/**
 * Aplica o modo de projeção ao receber Electron runtime globals.
 * @param {import('electron').BrowserWindow} childWindow
 * @param {boolean} fullscreen
 * @param {typeof process} processRef
 * @param {import('electron').Screen} screen
 */
export function applyRuntimeProjectionDisplayMode(childWindow, fullscreen, processRef, screen) {
  applyProjectionDisplayMode(childWindow, fullscreen, {
    platform: processRef.platform,
    sessionType: processRef.env.XDG_SESSION_TYPE,
    screen,
  })
}

/**
 * Resolve o display alvo da projeção.
 * @param {{ monitorId?: number | null, displays: Array<import('electron').Display>, primary: import('electron').Display }} args
 * @returns {import('electron').Display}
 */
export function resolveProjectionDisplay({ monitorId, displays, primary }) {
  if (monitorId != null && Number.isFinite(monitorId)) {
    const found = displays.find((display) => display.id === monitorId)
    if (found) return found
  }
  return primary
}

/**
 * Bounds da janela de projeção.
 * - fullscreen: bounds totais do monitor alvo (cobre barra de tarefas).
 * - janela com monitor explícito: 800x600 centrado no workArea do monitor.
 * - janela sem monitor explícito: null (posição livre, o WM decide).
 * @param {{ fullscreen: boolean, monitorId?: number | null, displays: Array<import('electron').Display>, primary: import('electron').Display }} args
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function buildProjectionWindowBounds({ fullscreen, monitorId, displays, primary }) {
  const target = resolveProjectionDisplay({ monitorId, displays, primary })

  if (fullscreen) {
    return {
      x: target.bounds.x,
      y: target.bounds.y,
      width: target.bounds.width,
      height: target.bounds.height,
    }
  }

  if (monitorId == null || !Number.isFinite(monitorId)) return null

  const work = target.workArea
  return {
    x: work.x + Math.round((work.width - WINDOWED_WIDTH) / 2),
    y: work.y + Math.round((work.height - WINDOWED_HEIGHT) / 2),
    width: WINDOWED_WIDTH,
    height: WINDOWED_HEIGHT,
  }
}
