/**
 * Projeção compartilhada: uma popup independente com `share=1` divide o
 * monitor com o que já está projetado nele. Ela fica com a metade direita e
 * as demais janelas de projeção visíveis daquele monitor ficam com a metade
 * esquerda. Quando um dos lados some (fecha, esconde), o que ficou volta a
 * ocupar o monitor inteiro.
 */

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isSharedProjectionUrl(url) {
  if (typeof url !== 'string' || url === '') return false
  try {
    const parsed = new URL(url)
    const queryText = parsed.hash.includes('?')
      ? parsed.hash.slice(parsed.hash.indexOf('?') + 1)
      : parsed.search.slice(1)
    return new URLSearchParams(queryText).get('share') === '1'
  } catch {
    return false
  }
}

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {{ id: number, bounds: Rect }} DisplayLike
 */

/** @param {Rect} bounds */
export function splitDisplayBounds(bounds) {
  const leftWidth = Math.floor(bounds.width / 2)
  return {
    left: { x: bounds.x, y: bounds.y, width: leftWidth, height: bounds.height },
    right: {
      x: bounds.x + leftWidth,
      y: bounds.y,
      width: bounds.width - leftWidth,
      height: bounds.height,
    },
  }
}

/**
 * Monitor que contém o centro da janela.
 * @param {Rect} rect
 * @param {DisplayLike[]} displays
 * @returns {DisplayLike | null}
 */
export function displayForBounds(rect, displays) {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return (
    displays.find(
      (display) =>
        cx >= display.bounds.x &&
        cx < display.bounds.x + display.bounds.width &&
        cy >= display.bounds.y &&
        cy < display.bounds.y + display.bounds.height,
    ) ?? null
  )
}

/**
 * @typedef {{
 *   isDestroyed: () => boolean,
 *   isVisible: () => boolean,
 *   getBounds: () => Rect,
 *   setBounds: (rect: Rect) => void,
 *   isFullScreen?: () => boolean,
 *   setFullScreen?: (flag: boolean) => void,
 *   isSimpleFullScreen?: () => boolean,
 *   setSimpleFullScreen?: (flag: boolean) => void,
 *   on: (event: string, listener: () => void) => unknown,
 * }} LayoutWindow
 */

function sameRect(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** @param {LayoutWindow} win @param {Rect} rect */
function applyBounds(win, rect) {
  try {
    if (win.isDestroyed()) return
    // Fullscreen nativo (macOS) não aceita setBounds: sai dele antes.
    if (win.isSimpleFullScreen?.()) win.setSimpleFullScreen?.(false)
    if (win.isFullScreen?.()) win.setFullScreen?.(false)
    if (!sameRect(win.getBounds(), rect)) win.setBounds(rect)
  } catch {
    /* janela fechando */
  }
}

/**
 * @param {{
 *   getProjectionWindows: () => LayoutWindow[],
 *   getDisplays: () => DisplayLike[],
 *   schedule?: (fn: () => void, ms: number) => unknown,
 * }} deps
 */
export function createSharedProjectionLayout(deps) {
  const schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms))
  /** janela compartilhada → id do monitor */
  /** @type {Map<LayoutWindow, number>} */
  const shared = new Map()
  /** Janelas que esta camada encolheu para a metade esquerda. */
  /** @type {Set<LayoutWindow>} */
  const shrunk = new Set()

  function relayout() {
    const displays = deps.getDisplays()
    const byId = new Map(displays.map((display) => [display.id, display]))

    for (const win of [...shared.keys()]) {
      if (win.isDestroyed()) shared.delete(win)
    }

    /** monitor → janela compartilhada visível */
    const sharedByDisplay = new Map()
    for (const [win, displayId] of shared) {
      if (win.isVisible() && byId.has(displayId)) sharedByDisplay.set(displayId, win)
    }

    /** monitor → outras janelas de projeção visíveis */
    const othersByDisplay = new Map()
    for (const win of deps.getProjectionWindows()) {
      if (win.isDestroyed() || shared.has(win) || !win.isVisible()) continue
      const display = displayForBounds(win.getBounds(), displays)
      if (!display) continue
      const list = othersByDisplay.get(display.id) ?? []
      list.push(win)
      othersByDisplay.set(display.id, list)
    }

    const keepShrunk = new Set()
    for (const [displayId, win] of sharedByDisplay) {
      const display = byId.get(displayId)
      const others = othersByDisplay.get(displayId) ?? []
      if (others.length === 0) {
        applyBounds(win, display.bounds)
        continue
      }
      const halves = splitDisplayBounds(display.bounds)
      applyBounds(win, halves.right)
      for (const other of others) {
        applyBounds(other, halves.left)
        keepShrunk.add(other)
      }
    }

    // Quem ficou sozinho volta a ocupar o monitor inteiro.
    for (const win of [...shrunk]) {
      if (keepShrunk.has(win)) continue
      shrunk.delete(win)
      if (win.isDestroyed()) continue
      const display = displayForBounds(win.getBounds(), displays)
      if (display) applyBounds(win, display.bounds)
    }
    for (const win of keepShrunk) shrunk.add(win)
  }

  /** Recalcula agora e de novo depois que o WM termina de mapear a janela. */
  function relayoutSoon() {
    relayout()
    schedule(relayout, 300)
  }

  /** @param {LayoutWindow} win @param {number} displayId */
  function addShared(win, displayId) {
    shared.set(win, displayId)
    win.on('closed', () => {
      shared.delete(win)
      relayoutSoon()
    })
  }

  /**
   * Liga uma janela qualquer: aparecer, esconder ou fechar recalcula a divisão
   * (enquanto houver alguma compartilhada ou janela encolhida a restaurar).
   * @param {LayoutWindow} win
   */
  function watch(win) {
    const onChange = () => {
      if (shared.size > 0 || shrunk.size > 0) relayoutSoon()
    }
    win.on('show', onChange)
    win.on('hide', onChange)
    win.on('closed', onChange)
  }

  return {
    addShared,
    watch,
    relayout,
    relayoutSoon,
    isShared: (win) => shared.has(win),
    sharedCount: () => shared.size,
  }
}
