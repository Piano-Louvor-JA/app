import { beforeEach, describe, expect, it } from 'vitest'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  loadUserPreferences,
  saveUserPreferences,
  setUserPreference,
} from '../user-preferences'

describe('user-preferences', () => {
  beforeEach(() => localStorage.clear())

  it('carrega vazio quando o storage devolve null ou valor null serializado', () => {
    expect(loadUserPreferences()).toEqual({})
    localStorage.setItem(BROWSER_STORAGE_KEYS.userPreferences, 'null')
    expect(loadUserPreferences()).toEqual({})
  })

  it('salva e mescla preferências', () => {
    saveUserPreferences({ theme: 'dark' })

    expect(setUserPreference('blur', true)).toEqual({ theme: 'dark', blur: true })
    expect(localStorage.getItem(BROWSER_STORAGE_KEYS.userPreferences)).toBe('{"theme":"dark","blur":true}')
  })

  it('retorna valor tipado ou fallback para chave ausente', () => {
    saveUserPreferences({ zoom: 1.25 })

    expect(getUserPreference<number>('zoom')).toBe(1.25)
    expect(getUserPreference('missing', 'padrão')).toBe('padrão')
  })
})
