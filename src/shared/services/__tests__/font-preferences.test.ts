import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getUserPreference } from '../user-preferences'
import { FONT_PREFERENCES_KEY, loadFontPreferences, saveFontSelection, resolveFontId, restoreFonts, referencedFonts } from '../font-preferences'

beforeEach(() => localStorage.clear())
describe('font preferences', () => {
  it('roundtrips independent selections across module reload without overwriting preferences', async () => {
    saveFontSelection('system', 'merriweather')
    saveFontSelection('global', 'inter')
    saveFontSelection('bible', 'lora')
    vi.resetModules()
    const reloaded = await import('../font-preferences')
    expect(reloaded.resolveFontId('bible')).toBe('lora')
    expect(reloaded.resolveFontId('timer')).toBe('inter')
    expect(reloaded.resolveFontId('system')).toBe('merriweather')
    expect(getUserPreference(FONT_PREFERENCES_KEY)).toMatchObject({ version: 1 })
  })
  it('inherits module → global → system and restores without removing other scopes', () => {
    saveFontSelection('system', 'merriweather')
    saveFontSelection('bible', 'lora')
    expect(resolveFontId('timer')).toBe('merriweather')
    restoreFonts(false)
    expect(resolveFontId('system')).toBeNull()
    expect(resolveFontId('bible')).toBe('lora')
    expect(referencedFonts()).toEqual(['lora'])
    restoreFonts(true)
    expect(resolveFontId('bible')).toBeNull()
  })
  it('rejects invalid selections and safely reads malformed preferences', () => {
    expect(() => saveFontSelection('system', '../bad')).toThrow()
    localStorage.setItem('user_data', JSON.stringify({ [FONT_PREFERENCES_KEY]: { stageFamilyIds: null } }))
    expect(loadFontPreferences().stageFamilyIds).toEqual({})
  })
})
