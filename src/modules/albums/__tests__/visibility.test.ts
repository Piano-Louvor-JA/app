// @vitest-environment jsdom
// Node 26/jsdom sem localStorage (--localstorage-file): stub mínimo antes de
// qualquer acesso (mesmo padrão de MediaViewGaps.test.ts).
const __mem = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => __mem.get(k) ?? null,
      setItem: (k: string, v: string) => void __mem.set(k, v),
      removeItem: (k: string) => void __mem.delete(k),
      key: (i: number) => [...__mem.keys()][i] ?? null,
      get length() { return __mem.size },
      clear: () => __mem.clear(),
    },
    configurable: true,
  })
}
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
    expect(getShowCustomCollections()).toBe(false)
    setShowCustomCollections(true)
    expect(getShowCustomCollections()).toBe(true)
  })

  it('SSR (window undefined) → default true e set não quebra', () => {
    const originalWindow = (globalThis as { window?: unknown }).window
    // @ts-expect-error simula SSR
    delete (globalThis as { window?: unknown }).window
    try {
      expect(getShowCustomCollections()).toBe(true)
      expect(() => setShowCustomCollections(false)).not.toThrow()
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })
})
