import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  INSTANT_PAGE_TRANSITION,
  requestInstantPageTransition,
  usePageTransitionOverride,
} from '../useInstantPageTransition'

afterEach(() => {
  vi.useRealTimers()
  usePageTransitionOverride(ref('x')).settle()
})

describe('useInstantPageTransition', () => {
  it('sem pedido usa a transição do tema', () => {
    const { name } = usePageTransitionOverride(ref('page-dynamic'))
    expect(name.value).toBe('page-dynamic')
  })

  it('pedido: a próxima troca de página é instantânea; depois volta ao normal', () => {
    const base = ref('page-fade')
    const { name, settle } = usePageTransitionOverride(base)
    requestInstantPageTransition()
    expect(name.value).toBe(INSTANT_PAGE_TRANSITION)
    settle()
    expect(name.value).toBe('page-fade')
  })

  it('pedido que não foi usado expira (não deixa a próxima navegação comum sem transição)', () => {
    vi.useFakeTimers()
    const { name } = usePageTransitionOverride(ref('page-fade'))
    requestInstantPageTransition()
    vi.advanceTimersByTime(1100)
    expect(name.value).toBe('page-fade')
  })

  it('novo pedido renova o prazo', () => {
    vi.useFakeTimers()
    const { name } = usePageTransitionOverride(ref('page-fade'))
    requestInstantPageTransition()
    vi.advanceTimersByTime(800)
    requestInstantPageTransition()
    vi.advanceTimersByTime(800)
    expect(name.value).toBe(INSTANT_PAGE_TRANSITION)
  })
})
