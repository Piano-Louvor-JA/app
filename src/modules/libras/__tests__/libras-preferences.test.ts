import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(),
  setUserPreference: vi.fn(),
}))

import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'
import { isLibrasEnabled, setLibrasEnabled, LIBRAS_PREFERENCE_KEYS } from '../services/libras-preferences'

const mockedGet = vi.mocked(getUserPreference)
const mockedSet = vi.mocked(setUserPreference)

describe('libras-preferences', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('default false quando chave ausente', () => {
    mockedGet.mockReturnValue(null)
    expect(isLibrasEnabled()).toBe(false)
    expect(mockedGet).toHaveBeenCalledWith(LIBRAS_PREFERENCE_KEYS.enabled, false)
  })

  it('persiste true via setUserPreference', () => {
    setLibrasEnabled(true)
    expect(mockedSet).toHaveBeenCalledWith(LIBRAS_PREFERENCE_KEYS.enabled, true)
  })

  it('persiste false via setUserPreference (rollback restaura comportamento)', () => {
    setLibrasEnabled(false)
    expect(mockedSet).toHaveBeenCalledWith(LIBRAS_PREFERENCE_KEYS.enabled, false)
  })
})