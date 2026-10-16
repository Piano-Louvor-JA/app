// @vitest-environment jsdom
/**
 * Painéis flutuantes no canto padrão (player, Bíblia, Timer) se empilham em
 * vez de se sobrepor; quem foi arrastado sai da pilha.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import { saveFloatingPosition } from '@shared/services/floating-position'

import { FLOATING_STACK_GAP, useFloatingDrag } from '../useFloatingDrag'

const HEIGHTS: Record<string, number> = { a: 100, b: 150, c: 80 }

function panel(key: string, stackOrder?: number) {
  return defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null)
      const { positionStyle, resetPosition } = useFloatingDrag(
        root,
        `test.${key}`,
        stackOrder === undefined ? {} : { stackOrder },
      )
      return () =>
        h('div', { ref: root, class: `panel-${key}`, 'data-key': key, style: positionStyle.value, onDblclick: resetPosition })
    },
  })
}

let wrappers: VueWrapper[] = []

function mountPanel(key: string, stackOrder?: number) {
  const w = mount(panel(key, stackOrder), { attachTo: document.body })
  wrappers.push(w)
  return w
}

const transformOf = (w: VueWrapper) => (w.element as HTMLElement).style.transform

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = HEIGHTS[this.dataset.key ?? ''] ?? 0
    return { left: 600, top: 500, width: 300, height, x: 600, y: 500, right: 900, bottom: 500 + height, toJSON: () => ({}) } as DOMRect
  })
})

afterEach(() => {
  wrappers.forEach((w) => w.unmount())
  wrappers = []
  vi.restoreAllMocks()
})

describe('useFloatingDrag — pilha no canto padrão', () => {
  it('cada painel sobe a altura dos que estão abaixo dele na pilha', async () => {
    const c = mountPanel('c', 2)
    const a = mountPanel('a', 0)
    const b = mountPanel('b', 1)
    await nextTick()

    expect(transformOf(a)).toBe('')
    expect(transformOf(b)).toBe(`translateY(-${100 + FLOATING_STACK_GAP}px)`)
    expect(transformOf(c)).toBe(`translateY(-${100 + 150 + 2 * FLOATING_STACK_GAP}px)`)
  })

  it('painel que sai da tela libera o espaço', async () => {
    const a = mountPanel('a', 0)
    const b = mountPanel('b', 1)
    await nextTick()
    expect(transformOf(b)).not.toBe('')

    a.unmount()
    wrappers = wrappers.filter((w) => w !== a)
    await nextTick()
    expect(transformOf(b)).toBe('')
  })

  it('painel arrastado sai da pilha; ao voltar ao canto, volta a contar', async () => {
    saveFloatingPosition('test.a', { x: 10, y: 10 })
    const a = mountPanel('a', 0)
    const b = mountPanel('b', 1)
    await nextTick()
    expect((a.element as HTMLElement).style.left).toBe('10px')
    expect(transformOf(b)).toBe('')

    await a.trigger('dblclick')
    await nextTick()
    expect(transformOf(b)).toBe(`translateY(-${100 + FLOATING_STACK_GAP}px)`)
  })

  it('sem stackOrder o painel não participa da pilha', async () => {
    mountPanel('a')
    const b = mountPanel('b', 1)
    await nextTick()
    expect(transformOf(b)).toBe('')
  })

  it('redimensionar a janela remede a altura de quem está na pilha', async () => {
    mountPanel('a', 0)
    const b = mountPanel('b', 1)
    await nextTick()
    HEIGHTS.a = 120
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(transformOf(b)).toBe(`translateY(-${120 + FLOATING_STACK_GAP}px)`)
    HEIGHTS.a = 100
  })
})
