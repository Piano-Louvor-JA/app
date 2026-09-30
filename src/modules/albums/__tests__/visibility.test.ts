// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VISIBILITY_KEY, getShowCustomCollections, setShowCustomCollections } from '../visibility'

describe('albums/visibility', () => {
  afterEach(() => {
    localStorage.removeItem(VISIBILITY_KEY)
    vi.unstubAllGlobals()
  })

  it('default true sem chave', () => {
    expect(getShowCustomCollections()).toBe(true)
  })

  it('false persistido → false', () => {
    localStorage.setItem(VISIBILITY_KEY, 'false')
    expect(getShowCustomCollections()).toBe(false)
  })

  it('true persistido → true', () => {
    localStorage.setItem(VISIBILITY_KEY, 'true')
    expect(getShowCustomCollections()).toBe(true)
  })

  it('valor lixo → true', () => {
    localStorage.setItem(VISIBILITY_KEY, 'zzz')
    expect(getShowCustomCollections()).toBe(true)
  })

  it('setShowCustomCollections persiste', () => {
    setShowCustomCollections(false)
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe('false')
    setShowCustomCollections(true)
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe('true')
  })

  it('SSR guard: window undefined → true e set não faz nada', async () => {
    vi.stubGlobal('window', undefined)
    // localStorage ainda existe no jsdom global, mas o guard de window cobre o branch
    expect(getShowCustomCollections()).toBe(true)
    expect(() => setShowCustomCollections(false)).not.toThrow()
  })
})
