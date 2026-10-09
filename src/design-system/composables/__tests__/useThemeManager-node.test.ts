// Ambiente node puro (sem jsdom): exercita os guards de ambiente do
// useThemeManager — localStorage/window/document indefinidos fazem
// persistência e listeners virarem no-op sem lançar.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getUserPreferenceMock = vi.fn(() => null)
const setUserPreferenceMock = vi.fn()

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: getUserPreferenceMock,
  setUserPreference: setUserPreferenceMock,
}))

describe('useThemeManager — ambiente node (guards de ambiente)', () => {
  beforeEach(() => {
    getUserPreferenceMock.mockClear()
    setUserPreferenceMock.mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('setters sem localStorage nem window/document: no-op seguro', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage
    const { useThemeManager } = await import('../useThemeManager')
    const tm = useThemeManager() // ensureWatch: document undefined → sem watch
    expect(() => tm.setTheme('luminousClarity')).not.toThrow()
    expect(() => tm.toggleTheme()).not.toThrow()
    expect(() => tm.setGlassIntensity(80)).not.toThrow()
    expect(() => tm.setAccent('auroraGreen')).not.toThrow()
    expect(() => tm.setInteraction('instant')).not.toThrow()
    expect(() => tm.setAutoBrightness(true)).not.toThrow() // matchMedia ausente → noop
    expect(() => tm.setAutoBrightness(false)).not.toThrow()
    expect(setUserPreferenceMock).not.toHaveBeenCalled()
    expect(tm.themeKey.value).toBeTruthy()
    expect(tm.glassIntensity.value).toBeGreaterThan(0)
  })

  it('com localStorage presente (setup global): setters persistem', async () => {
    const makeStorageMock = () => {
      const store = new Map<string, string>()
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => void store.clear(),
      }
    }
    ;(globalThis as { localStorage?: unknown }).localStorage = makeStorageMock()
    const { useThemeManager } = await import('../useThemeManager')
    const tm = useThemeManager()
    tm.setTheme('luminousClarity')
    tm.setGlassIntensity(80)
    tm.setAutoBrightness(false)
    expect(setUserPreferenceMock).toHaveBeenCalled()
  })

  it('isWatching true: useThemeManager 2ª chamada sem watch duplicado (document undefined)', async () => {
    const { useThemeManager } = await import('../useThemeManager')
    useThemeManager()
    const second = useThemeManager()
    expect(second.currentTheme.value.id).toBeTruthy()
  })
})
