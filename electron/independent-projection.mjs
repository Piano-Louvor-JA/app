/**
 * Projeção independente: popup de um módulo num único monitor, por cima da
 * projeção principal. Ela fica fora do "fechar tudo" (trocar de módulo na
 * principal chama projection:close-url) e é reerguida sempre que outra janela
 * aparece ou muda de nível — todas as projeções usam alwaysOnTop
 * 'screen-saver', e a mais recente ficaria por cima.
 */

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isIndependentProjectionUrl(url) {
  if (typeof url !== 'string' || url === '') return false
  try {
    const parsed = new URL(url)
    const queryText = parsed.hash.includes('?')
      ? parsed.hash.slice(parsed.hash.indexOf('?') + 1)
      : parsed.search.slice(1)
    return new URLSearchParams(queryText).get('independent') === '1'
  } catch {
    return false
  }
}

/**
 * @typedef {{
 *   isDestroyed: () => boolean,
 *   setAlwaysOnTop: (flag: boolean, level?: string, relativeLevel?: number) => void,
 *   moveTop: () => void,
 *   on: (event: string, listener: () => void) => unknown,
 * }} RaisableWindow
 */

/**
 * @param {{ schedule?: (fn: () => void, ms: number) => unknown }} [options]
 */
export function createIndependentProjectionRegistry(options = {}) {
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms))
  /** @type {Set<RaisableWindow>} */
  const windows = new Set()

  /** @param {RaisableWindow} win */
  function raiseOne(win) {
    if (win.isDestroyed()) {
      windows.delete(win)
      return
    }
    try {
      // relativeLevel 1: acima das demais 'screen-saver' (macOS/Windows);
      // moveTop cobre WMs do Linux que ignoram o nível relativo.
      win.setAlwaysOnTop(true, 'screen-saver', 1)
      win.moveTop()
    } catch {
      /* janela fechando */
    }
  }

  function raise() {
    for (const win of [...windows]) raiseOne(win)
  }

  /** Reergue agora e de novo após o WM terminar de mapear a outra janela. */
  function raiseSoon() {
    if (windows.size === 0) return
    raise()
    schedule(raise, 250)
  }

  /** @param {RaisableWindow} win */
  function add(win) {
    windows.add(win)
    win.on('closed', () => {
      windows.delete(win)
    })
  }

  /** @param {RaisableWindow} win */
  function has(win) {
    return windows.has(win)
  }

  /**
   * Liga uma janela qualquer ao registro: quando ela aparecer ou mudar de
   * nível, as independentes voltam ao topo.
   * @param {RaisableWindow} win
   */
  function watch(win) {
    win.on('show', () => {
      if (!windows.has(win)) raiseSoon()
    })
    win.on('always-on-top-changed', () => {
      if (!windows.has(win)) raiseSoon()
    })
  }

  return { add, has, raise, raiseOne, raiseSoon, watch, size: () => windows.size }
}
