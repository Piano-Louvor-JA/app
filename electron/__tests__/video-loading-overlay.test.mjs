// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { OVERLAY_HTML, VIDEO_STATE_SCRIPT, attachVideoLoadingOverlay, overlayFor } from '../video-loading-overlay.mjs'
import { PIANO_LOGO_VIEWBOX, pianoLogoSvg } from '../piano-logo.mjs'

describe('tela de carregamento do player do YouTube', () => {
  it('carregando → pronto → tocando; depois de tocar não volta sozinha', () => {
    expect(overlayFor(null, { started: false, sinceMs: 0 })).toEqual({ view: 'loading', started: false })
    expect(overlayFor('loading', { started: false, sinceMs: 30000 })).toEqual({ view: 'slow', started: false })
    expect(overlayFor('ready', { started: false, sinceMs: 0 })).toEqual({ view: 'ready', started: false })
    expect(overlayFor('playing', { started: false, sinceMs: 0 })).toEqual({ view: 'hidden', started: true })
    expect(overlayFor('ready', { started: true, sinceMs: 0 })).toEqual({ view: 'hidden', started: true })
  })

  it('o HTML traz o logo do Piano e o texto de carregamento', () => {
    expect(OVERLAY_HTML).toContain(`viewBox="${PIANO_LOGO_VIEWBOX}"`)
    expect(OVERLAY_HTML).toContain('Carregando')
    expect(OVERLAY_HTML).toContain('Pronto para tocar')
    expect(pianoLogoSvg()).not.toContain('class=')
    expect(VIDEO_STATE_SCRIPT).toContain('movie_player')
  })

  it('fica entre a página e a barra, acompanha a página e sai ao fechar', async () => {
    vi.useFakeTimers()
    const handlers = {}
    const winHandlers = {}
    const children = []
    const viewWc = {
      loadURL: vi.fn(async () => {}),
      executeJavaScript: vi.fn(async () => {}),
      isDestroyed: () => false,
      close: vi.fn(),
      once: (ev, fn) => { handlers[ev] = fn },
    }
    class FakeView {
      constructor() { this.webContents = viewWc; this.setVisible = vi.fn(); this.setBounds = vi.fn(); this.setBackgroundColor = vi.fn() }
    }
    let pageState = 'loading'
    const win = {
      isDestroyed: () => false,
      getContentSize: () => [960, 604],
      contentView: { addChildView: (v) => children.push(v), removeChildView: vi.fn() },
      webContents: {
        executeJavaScript: vi.fn(async () => pageState),
        on: (ev, fn) => { winHandlers[ev] = fn },
        off: vi.fn(),
      },
      once: (ev, fn) => { winHandlers[`once:${ev}`] = fn },
    }
    const bar = { name: 'bar' }
    attachVideoLoadingOverlay(win, { WebContentsView: FakeView, barHeight: 64, getControlBar: () => bar })
    const view = children[0]
    expect(children[1]).toBe(bar)
    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 960, height: 540 })

    handlers['did-finish-load']()
    await vi.advanceTimersByTimeAsync(0)
    expect(view.setVisible).toHaveBeenLastCalledWith(true)
    expect(viewWc.executeJavaScript).toHaveBeenLastCalledWith(expect.stringContaining('"loading"'))

    pageState = 'ready'
    await vi.advanceTimersByTimeAsync(400)
    expect(viewWc.executeJavaScript).toHaveBeenLastCalledWith(expect.stringContaining('"ready"'))

    pageState = 'playing'
    await vi.advanceTimersByTimeAsync(400)
    expect(view.setVisible).toHaveBeenLastCalledWith(false)

    // Navegação na mesma página não reseta; troca de página sim.
    winHandlers['did-start-navigation']({ isMainFrame: true, isSameDocument: true })
    expect(view.setVisible).toHaveBeenLastCalledWith(false)
    winHandlers['did-start-navigation']({}, 'u', false, true)
    expect(view.setVisible).toHaveBeenLastCalledWith(true)

    pageState = Promise.reject(new Error('navegando'))
    pageState.catch(() => {})
    await vi.advanceTimersByTimeAsync(400)
    expect(view.setVisible).toHaveBeenLastCalledWith(true)

    winHandlers['once:closed']()
    winHandlers['once:closed']()
    expect(win.contentView.removeChildView).toHaveBeenCalledTimes(1)
    expect(viewWc.close).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
