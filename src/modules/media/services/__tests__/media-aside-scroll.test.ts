// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { revealItemInAside, revealItemScrollTop } from '../media-aside-scroll'

describe('revealItemScrollTop', () => {
  it('centraliza o item no container', () => {
    const result = revealItemScrollTop({
      scrollTop: 100,
      containerTop: 0,
      containerHeight: 500,
      itemTop: 600,
      itemHeight: 50,
    })
    // 100 + 600 - 0 - (500-50)/2 = 475
    expect(result).toBe(475)
  })

  it('nunca retorna negativo', () => {
    const result = revealItemScrollTop({
      scrollTop: 0,
      containerTop: 100,
      containerHeight: 500,
      itemTop: 50,
      itemHeight: 20,
    })
    expect(result).toBe(0)
  })
})

describe('revealItemInAside', () => {
  it('rola o aside até o item centralizado', () => {
    const scrollTo = vi.fn()
    const aside = {
      scrollTop: 100,
      clientHeight: 500,
      getBoundingClientRect: () => ({ top: 0, bottom: 500, height: 500 }),
      scrollTo,
    } as unknown as HTMLElement
    const item = {
      getBoundingClientRect: () => ({ top: 600, bottom: 650, height: 50 }),
    } as unknown as HTMLElement

    revealItemInAside(aside, item)
    expect(scrollTo).toHaveBeenCalledWith({ top: 475, behavior: 'auto' })
  })
})
