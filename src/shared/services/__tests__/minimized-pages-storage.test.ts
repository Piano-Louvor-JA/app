import { afterEach, describe, expect, it, vi } from 'vitest'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import type { MinimizedPage } from '../minimized-pages'
import { loadMinimizedPages, saveMinimizedPages } from '../minimized-pages-storage'

function page(fullPath: string, preview: string | null = null): MinimizedPage {
  return {
    fullPath,
    routeName: 'albums-collection',
    title: 'Hinário Adventista',
    icon: 'ti-book',
    summary: 'Busca: santo',
    state: { collectionId: '5', searchQuery: 'santo' },
    scroll: [{ path: [0, 2], top: 480, left: 0 }],
    preview,
    minimizedAt: 1,
  }
}

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('minimized-pages-storage', () => {
  it('salvar e carregar devolve a mesma lista (ida e volta)', () => {
    const list = [page('/albums/5', 'data:image/jpeg;base64,AA'), page('/albums/6')]
    saveMinimizedPages(list)
    expect(loadMinimizedPages()).toEqual(list)
  })

  it('grava no sessionStorage, não no localStorage', () => {
    saveMinimizedPages([page('/albums/5')])
    expect(sessionStorage.getItem(BROWSER_STORAGE_KEYS.minimizedPages)).not.toBeNull()
    expect(localStorage.getItem(BROWSER_STORAGE_KEYS.minimizedPages)).toBeNull()
  })

  it('nada salvo ou salvo inválido devolve lista vazia', () => {
    expect(loadMinimizedPages()).toEqual([])
    sessionStorage.setItem(BROWSER_STORAGE_KEYS.minimizedPages, '{quebrado')
    expect(loadMinimizedPages()).toEqual([])
  })

  it('cota estourada pelas miniaturas: salva de novo sem elas', () => {
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (value.includes('data:image')) throw new DOMException('cheio', 'QuotaExceededError')
      real.call(this, key, value)
    })
    saveMinimizedPages([page('/albums/5', 'data:image/jpeg;base64,AA')])
    expect(loadMinimizedPages()).toEqual([page('/albums/5', null)])
  })

  it('storage indisponível não quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(loadMinimizedPages()).toEqual([])
    expect(() => saveMinimizedPages([page('/albums/5')])).not.toThrow()
  })
})
