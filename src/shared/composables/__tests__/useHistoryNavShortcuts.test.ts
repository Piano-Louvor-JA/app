// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'

import { useHistoryNavShortcuts } from '../useHistoryNavShortcuts'

const back = vi.fn()
const forward = vi.fn()
let wrapper: VueWrapper | null = null

function mountHost() {
  wrapper = mount(
    defineComponent({
      setup() {
        useHistoryNavShortcuts({ back, forward })
        return () => null
      },
    }),
  )
}

function key(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function mouse(type: 'mousedown' | 'mouseup', button: number) {
  const event = new MouseEvent(type, { button, bubbles: true, cancelable: true })
  document.body.dispatchEvent(event)
  return event
}

beforeEach(() => {
  back.mockClear()
  forward.mockClear()
  mountHost()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('useHistoryNavShortcuts — teclado', () => {
  it('Alt+← volta e Alt+→ avança, com preventDefault', () => {
    expect(key({ key: 'ArrowLeft', altKey: true }).defaultPrevented).toBe(true)
    expect(back).toHaveBeenCalledTimes(1)
    expect(key({ key: 'ArrowRight', altKey: true }).defaultPrevented).toBe(true)
    expect(forward).toHaveBeenCalledTimes(1)
  })

  it('funciona com o evento disparado direto no window (sem elemento focado)', () => {
    key({ key: 'ArrowLeft', altKey: true }, window)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('setas sem Alt não fazem nada (são da Bíblia/Mídia)', () => {
    expect(key({ key: 'ArrowLeft' }).defaultPrevented).toBe(false)
    key({ key: 'ArrowRight' })
    expect(back).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
  })

  it('Alt com Ctrl, Meta ou Shift não conta', () => {
    key({ key: 'ArrowLeft', altKey: true, ctrlKey: true })
    key({ key: 'ArrowLeft', altKey: true, metaKey: true })
    key({ key: 'ArrowRight', altKey: true, shiftKey: true })
    expect(back).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
  })

  it('outras teclas com Alt não fazem nada', () => {
    expect(key({ key: 'ArrowUp', altKey: true }).defaultPrevented).toBe(false)
    expect(back).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
  })

  it('ignora quando o foco está digitando (input, textarea, select, contentEditable)', () => {
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    for (const el of [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      editable,
    ]) {
      document.body.appendChild(el)
      expect(key({ key: 'ArrowLeft', altKey: true }, el).defaultPrevented).toBe(false)
    }
    expect(back).not.toHaveBeenCalled()
  })

  it('ignora com diálogo aberto (ex.: AppConfirm)', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    key({ key: 'ArrowLeft', altKey: true })
    expect(back).not.toHaveBeenCalled()
  })
})

describe('useHistoryNavShortcuts — mouse', () => {
  it('botão lateral "voltar" (3) volta e "avançar" (4) avança no mouseup', () => {
    mouse('mouseup', 3)
    expect(back).toHaveBeenCalledTimes(1)
    mouse('mouseup', 4)
    expect(forward).toHaveBeenCalledTimes(1)
  })

  it('mousedown dos botões laterais tem preventDefault (Chromium não navega sozinho)', () => {
    expect(mouse('mousedown', 3).defaultPrevented).toBe(true)
    expect(mouse('mousedown', 4).defaultPrevented).toBe(true)
    expect(back).not.toHaveBeenCalled()
  })

  it('botões comuns não fazem nada', () => {
    expect(mouse('mousedown', 0).defaultPrevented).toBe(false)
    mouse('mouseup', 0)
    mouse('mouseup', 1)
    mouse('mouseup', 2)
    expect(back).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
  })

  it('ignora com diálogo aberto', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    mouse('mouseup', 3)
    expect(back).not.toHaveBeenCalled()
  })
})

describe('useHistoryNavShortcuts — ciclo de vida', () => {
  it('remove os listeners ao desmontar', () => {
    wrapper?.unmount()
    wrapper = null
    key({ key: 'ArrowLeft', altKey: true })
    mouse('mouseup', 4)
    expect(back).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
  })
})
