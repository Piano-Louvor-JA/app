// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getShowCustomCollections, setShowCustomCollections, VISIBILITY_KEY } from '../visibility'

describe('visibility — Minhas Coletâneas', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('default é visível (true) para usuário novo', () => {
    expect(getShowCustomCollections()).toBe(true)
  })

  it('persiste hidden e relê', () => {
    setShowCustomCollections(false)
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe('false')
    expect(getShowCustomCollections()).toBe(false)
  })

  it("valor arbitrário não-'false' conta como visível", () => {
    localStorage.setItem(VISIBILITY_KEY, 'sim')
    expect(getShowCustomCollections()).toBe(true)
  })
})
