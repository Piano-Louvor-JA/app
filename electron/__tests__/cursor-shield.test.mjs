// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { CURSOR_SHIELD_HTML, attachCursorShield } from '../cursor-shield.mjs'

function fakeWindow() {
  const handlers = {}
  const children = []
  return {
    handlers,
    children,
    win: {
      isDestroyed: () => false,
      getContentSize: () => [960, 604],
      contentView: { addChildView: (v) => children.push(v), removeChildView: vi.fn() },
      on: (ev, fn) => { handlers[ev] = fn },
      off: vi.fn(),
      once: (ev, fn) => { handlers[`once:${ev}`] = fn },
    },
  }
}

describe('seta do mouse no player, fora da projeção', () => {
  it('camada transparente sobre o vídeo, com a seta normal', () => {
    expect(CURSOR_SHIELD_HTML).toContain('background:transparent')
    expect(CURSOR_SHIELD_HTML).toContain('cursor:default')
    const viewHandlers = {}
    const wc = { loadURL: vi.fn(async () => {}), on: (ev, fn) => { viewHandlers[ev] = fn }, isDestroyed: () => false, close: vi.fn() }
    class FakeView {
      constructor() { this.webContents = wc; this.setBounds = vi.fn(); this.setBackgroundColor = vi.fn() }
    }
    const { win, children, handlers } = fakeWindow()
    const onEscape = vi.fn()
    attachCursorShield(win, { WebContentsView: FakeView, barHeight: 64, onEscape })
    const view = children[0]
    expect(view.setBackgroundColor).toHaveBeenCalledWith('#00000000')
    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 960, height: 540 })
    expect(wc.loadURL.mock.calls[0][0]).toMatch(/^data:text\/html/)

    // Esc com o foco na camada fecha o player; outras teclas não.
    viewHandlers['before-input-event']({}, { type: 'keyDown', key: 'a' })
    viewHandlers['before-input-event']({}, { type: 'keyUp', key: 'Escape' })
    expect(onEscape).not.toHaveBeenCalled()
    viewHandlers['before-input-event']({}, { type: 'keyDown', key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)

    handlers.resize()
    expect(view.setBounds).toHaveBeenCalledTimes(2)

    handlers['once:closed']()
    handlers['once:closed']()
    expect(win.contentView.removeChildView).toHaveBeenCalledTimes(1)
    expect(wc.close).toHaveBeenCalledTimes(1)
  })

  it('janela já fechada: não quebra', () => {
    const wc = { loadURL: vi.fn(async () => {}), on: vi.fn(), isDestroyed: () => true, close: vi.fn() }
    class FakeView { constructor() { this.webContents = wc; this.setBounds = vi.fn(); this.setBackgroundColor = vi.fn() } }
    const { win, handlers } = fakeWindow()
    attachCursorShield(win, { WebContentsView: FakeView, barHeight: 64 })
    win.isDestroyed = () => true
    handlers.resize()
    handlers['once:closed']()
    expect(wc.close).not.toHaveBeenCalled()
  })
})
