// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Ref } from 'vue'

import {
  PROGRESSIVE_CHUNK,
  PROGRESSIVE_INITIAL,
  useProgressiveList,
} from '../useProgressiveList'

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

let visible!: Ref<number[]>
let complete!: Ref<boolean>

function mountWith(items: Ref<number[]>) {
  return mount(
    defineComponent({
      setup() {
        ;({ visible, complete } = useProgressiveList(items))
        return () => null
      },
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useProgressiveList', () => {
  it('limites: começa com o que cabe na tela e entra em blocos', () => {
    expect(PROGRESSIVE_INITIAL).toBe(40)
    expect(PROGRESSIVE_CHUNK).toBe(20)
  })

  it('lista pequena aparece inteira na hora', () => {
    const w = mountWith(ref(range(10)))
    expect(visible.value).toEqual(range(10))
    expect(complete.value).toBe(true)
    w.unmount()
  })

  it('lista grande: primeiros 40 na hora, o resto em blocos de 20 sem travar', () => {
    const w = mountWith(ref(range(610)))
    expect(visible.value).toHaveLength(40)
    expect(complete.value).toBe(false)
    vi.advanceTimersToNextTimer()
    expect(visible.value).toHaveLength(60)
    vi.runAllTimers()
    expect(visible.value).toEqual(range(610))
    expect(complete.value).toBe(true)
    w.unmount()
  })

  it('lista nova (busca, outra coletânea) recomeça pelos primeiros', async () => {
    const items = ref(range(610))
    const w = mountWith(items)
    vi.runAllTimers()
    items.value = range(300).map((n) => n + 1000)
    await nextTick()
    expect(visible.value).toHaveLength(40)
    expect(visible.value[0]).toBe(1000)
    vi.runAllTimers()
    expect(visible.value).toHaveLength(300)
    w.unmount()
  })

  it('ao sair da tela para de agendar blocos', () => {
    const w = mountWith(ref(range(610)))
    w.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
