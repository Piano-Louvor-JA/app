import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { MinimizedPage } from '@shared/services/minimized-pages'
import { loadMinimizedPages, saveMinimizedPages } from '@shared/services/minimized-pages-storage'

import { useMinimizedPagesStore } from '../useMinimizedPagesStore'

function page(fullPath: string, minimizedAt = 1, extra: Partial<MinimizedPage> = {}): MinimizedPage {
  return {
    fullPath,
    routeName: 'albums-collection',
    title: `Coletânea ${fullPath}`,
    icon: 'ti-book',
    summary: '',
    state: { collectionId: fullPath.split('/').at(-1), searchQuery: '' },
    scroll: [],
    preview: null,
    minimizedAt,
    ...extra,
  }
}

function paths(store: ReturnType<typeof useMinimizedPagesStore>) {
  return store.items.map((p) => p.fullPath)
}

beforeEach(() => {
  sessionStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  sessionStorage.clear()
})

describe('useMinimizedPagesStore', () => {
  it('começa vazia, sem barra', () => {
    const store = useMinimizedPagesStore()
    expect(store.items).toEqual([])
    expect(store.hasItems).toBe(false)
  })

  it('começa com o que estava salvo na sessão (depois de recarregar)', () => {
    saveMinimizedPages([page('/albums/5')])
    const store = useMinimizedPagesStore()
    expect(paths(store)).toEqual(['/albums/5'])
    expect(store.hasItems).toBe(true)
  })

  it('minimizar acrescenta e salva na sessão', () => {
    const store = useMinimizedPagesStore()
    store.minimize(page('/albums/5'))
    store.minimize(page('/albums/6', 2))
    expect(paths(store)).toEqual(['/albums/5', '/albums/6'])
    expect(loadMinimizedPages().map((p) => p.fullPath)).toEqual(['/albums/5', '/albums/6'])
  })

  it('minimizar de novo a mesma página atualiza sem duplicar', () => {
    const store = useMinimizedPagesStore()
    store.minimize(page('/albums/5'))
    store.minimize(page('/albums/5', 2, { summary: 'Busca: santo' }))
    expect(paths(store)).toEqual(['/albums/5'])
    expect(store.items[0].summary).toBe('Busca: santo')
  })

  it('fechar (x) tira da barra e da sessão, sem retrato pendente', () => {
    const store = useMinimizedPagesStore()
    store.minimize(page('/albums/5'))
    store.close('/albums/5')
    expect(store.items).toEqual([])
    expect(loadMinimizedPages()).toEqual([])
    expect(store.takeRestore('/albums/5')).toBeNull()
  })

  it('reabrir tira da barra (Q2) e deixa o retrato para a página aplicar', () => {
    const store = useMinimizedPagesStore()
    const hinario = page('/albums/5', 1, { state: { collectionId: '5', searchQuery: 'santo' } })
    store.minimize(hinario)
    store.minimize(page('/albums/6', 2))

    expect(store.reopen('/albums/5')).toEqual(hinario)
    expect(paths(store)).toEqual(['/albums/6'])
    expect(loadMinimizedPages().map((p) => p.fullPath)).toEqual(['/albums/6'])

    expect(store.takeRestore('/albums/6')).toBeNull()
    expect(store.takeRestore('/albums/5')).toEqual(hinario)
    expect(store.takeRestore('/albums/5')).toBeNull()
  })

  it('reabrir uma página que não está na barra não faz nada', () => {
    const store = useMinimizedPagesStore()
    store.minimize(page('/albums/5'))
    expect(store.reopen('/x')).toBeNull()
    expect(paths(store)).toEqual(['/albums/5'])
    expect(store.takeRestore('/x')).toBeNull()
  })
})
