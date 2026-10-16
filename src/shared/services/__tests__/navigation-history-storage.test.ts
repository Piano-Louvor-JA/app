import { afterEach, describe, expect, it, vi } from 'vitest'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '../navigation-history-storage'

const state = {
  entries: [
    { fullPath: '/', name: 'home', navKey: 'home' },
    { fullPath: '/bible', name: 'bible', navKey: 'bible' },
  ],
  index: 1,
}

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('navigation-history-storage', () => {
  it('salvar e carregar devolve o mesmo histórico (ida e volta)', () => {
    saveNavigationHistory(state, 7)
    expect(loadNavigationHistory()).toEqual({ state, basePosition: 7 })
  })

  it('grava no sessionStorage (vale só enquanto a janela existe)', () => {
    saveNavigationHistory(state, null)
    expect(sessionStorage.getItem(BROWSER_STORAGE_KEYS.navigationHistory)).not.toBeNull()
    expect(localStorage.getItem(BROWSER_STORAGE_KEYS.navigationHistory)).toBeNull()
    expect(loadNavigationHistory()).toEqual({ state, basePosition: null })
  })

  it('nada salvo ou salvo inválido devolve null', () => {
    expect(loadNavigationHistory()).toBeNull()
    sessionStorage.setItem(BROWSER_STORAGE_KEYS.navigationHistory, '{quebrado')
    expect(loadNavigationHistory()).toBeNull()
    sessionStorage.setItem(BROWSER_STORAGE_KEYS.navigationHistory, JSON.stringify({ state: {}, basePosition: 1 }))
    expect(loadNavigationHistory()).toBeNull()
  })

  it('basePosition que não é número inteiro vira null', () => {
    sessionStorage.setItem(
      BROWSER_STORAGE_KEYS.navigationHistory,
      JSON.stringify({ state, basePosition: 'x' }),
    )
    expect(loadNavigationHistory()).toEqual({ state, basePosition: null })
  })

  it('storage indisponível não quebra a navegação', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio')
    })
    expect(loadNavigationHistory()).toBeNull()
    expect(() => saveNavigationHistory(state, 1)).not.toThrow()
  })
})
