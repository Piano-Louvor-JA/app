// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  addProjectionWindowProvider,
  removeProjectionWindowProvider,
  collectAliveProjectionWindows,
  decideToggleAction,
  initProjectionHotkey,
  ensureProjectionHotkey,
  releaseProjectionHotkey,
  isProjectionHotkeyRegistered,
  isProjectionPopupWindow,
  buildShortcutHintLines,
  __resetProjectionHotkeyForTests,
  PROJECTION_HOTKEY,
} from '../projection-hotkey.mjs'

function fakeWindow({ destroyed = false, visible = true } = {}) {
  return {
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isMinimized: () => false,
  }
}

beforeEach(() => {
  __resetProjectionHotkeyForTests()
})

describe('collectAliveProjectionWindows (providers)', () => {
  it('coleta janelas vivas de múltiplos providers (2 fluxos)', () => {
    const a = fakeWindow()
    const b = fakeWindow({ destroyed: true })
    const c = fakeWindow()
    addProjectionWindowProvider(() => [a, b])
    addProjectionWindowProvider(() => [c])
    const alive = collectAliveProjectionWindows()
    expect(alive).toHaveLength(2)
    expect(alive).toContain(a)
    expect(alive).toContain(c)
  })

  it('provider que lança não quebra a coleta', () => {
    addProjectionWindowProvider(() => { throw new Error('fluxo não anexado') })
    addProjectionWindowProvider(() => [fakeWindow()])
    expect(collectAliveProjectionWindows()).toHaveLength(1)
  })
})

describe('decideToggleAction', () => {
  it('sem projeção viva → none', () => {
    expect(decideToggleAction({ anyAlive: false, anyVisible: false, operatorVisible: true })).toBe('none')
  })

  it('projeção visível → operador assume', () => {
    expect(decideToggleAction({ anyAlive: true, anyVisible: true, operatorVisible: false })).toBe('show-operator')
  })

  it('projeção escondida e operador visível → volta a projeção', () => {
    expect(decideToggleAction({ anyAlive: true, anyVisible: false, operatorVisible: true })).toBe('show-projection')
  })

  it('nenhum visível (operador minimizado) → operador assume', () => {
    expect(decideToggleAction({ anyAlive: true, anyVisible: false, operatorVisible: false })).toBe('show-operator')
  })
})

describe('hotkey lifecycle (singleton)', () => {
  function makeGlobalShortcut() {
    const gs = {
      register: vi.fn((_key, cb) => {
        gs.cb = cb
        return true
      }),
      unregister: vi.fn(),
    }
    return gs
  }

  it('ensure sem init → warn e não registra', () => {
    expect(ensureProjectionHotkey()).toBeUndefined()
    expect(isProjectionHotkeyRegistered()).toBe(false)
  })

  it('init + ensure registra; ensure de novo é idempotente (1 register)', () => {
    const gs = makeGlobalShortcut()
    initProjectionHotkey({ globalShortcut: gs, getOperatorWindow: () => null })
    ensureProjectionHotkey()
    ensureProjectionHotkey()
    expect(gs.register).toHaveBeenCalledTimes(1)
    expect(gs.register).toHaveBeenCalledWith(PROJECTION_HOTKEY, expect.any(Function))
    expect(isProjectionHotkeyRegistered()).toBe(true)
  })

  it('release libera; release de novo é idempotente', () => {
    const gs = makeGlobalShortcut()
    initProjectionHotkey({ globalShortcut: gs, getOperatorWindow: () => null })
    ensureProjectionHotkey()
    releaseProjectionHotkey()
    releaseProjectionHotkey()
    expect(gs.unregister).toHaveBeenCalledTimes(1)
    expect(isProjectionHotkeyRegistered()).toBe(false)
  })

  it('toggle real: projeção visível → hide + foco no operador', () => {
    const gs = makeGlobalShortcut()
    const source = fakeWindow()
    const operator = fakeWindow()
    addProjectionWindowProvider(() => [source])
    initProjectionHotkey({ globalShortcut: gs, getOperatorWindow: () => operator })
    ensureProjectionHotkey()
    gs.cb()
    expect(source.hide).toHaveBeenCalled()
    expect(operator.focus).toHaveBeenCalled()
  })

  it('toggle de novo (projeção escondida) → mostra projeção', () => {
    const gs = makeGlobalShortcut()
    const source = { ...fakeWindow({ visible: false }), moveTop: vi.fn() }
    const operator = fakeWindow()
    addProjectionWindowProvider(() => [source])
    initProjectionHotkey({ globalShortcut: gs, getOperatorWindow: () => operator })
    ensureProjectionHotkey()
    gs.cb()
    expect(source.show).toHaveBeenCalled()
    expect(source.moveTop).toHaveBeenCalled()
  })

  it('toggle sem nenhuma projeção viva → não faz nada', () => {
    const gs = makeGlobalShortcut()
    const operator = fakeWindow()
    initProjectionHotkey({ globalShortcut: gs, getOperatorWindow: () => operator })
    ensureProjectionHotkey()
    gs.cb()
    expect(operator.hide).not.toHaveBeenCalled()
    expect(operator.show).not.toHaveBeenCalled()
  })
})

describe('isProjectionPopupWindow', () => {
  it('reconhece hash route e path', () => {
    expect(isProjectionPopupWindow('http://x/index.html#/popup?module=media')).toBe(true)
    expect(isProjectionPopupWindow('http://x/popup?module=media')).toBe(true)
    expect(isProjectionPopupWindow('http://x/')).toBe(false)
    expect(isProjectionPopupWindow(undefined)).toBe(false)
  })
})

describe('buildShortcutHintLines', () => {
  it('lista ESC e Ctrl+Alt+P', () => {
    const lines = buildShortcutHintLines()
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.key)).toEqual(['ESC', 'Ctrl+Alt+P'])
  })
})
