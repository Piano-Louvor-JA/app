import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { HISTORY_MAX_ENTRIES, type HistoryEntry } from '@shared/services/navigation-history'

import { useNavigationHistoryStore } from '../useNavigationHistoryStore'

function entry(fullPath: string, navKey = 'home'): HistoryEntry {
  return { fullPath, name: fullPath.slice(1) || 'home', navKey }
}

function paths(store: ReturnType<typeof useNavigationHistoryStore>): string[] {
  return store.entries.map((e) => e.fullPath)
}

describe('useNavigationHistoryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('começa vazia, sem atual e sem setas', () => {
    const store = useNavigationHistoryStore()
    expect(store.entries).toEqual([])
    expect(store.index).toBe(-1)
    expect(store.current).toBeNull()
    expect(store.canGoBack).toBe(false)
    expect(store.canGoForward).toBe(false)
    expect(store.dots).toEqual([])
  })

  it('com uma entrada: um ponto atual e setas desabilitadas (Q1)', () => {
    const store = useNavigationHistoryStore()
    store.push(entry('/'))
    expect(store.current?.fullPath).toBe('/')
    expect(store.canGoBack).toBe(false)
    expect(store.canGoForward).toBe(false)
    expect(store.dots).toEqual([{ index: 0, current: true, edge: false }])
  })

  it('push acrescenta e habilita voltar', () => {
    const store = useNavigationHistoryStore()
    store.push(entry('/'))
    store.push(entry('/bible', 'bible'))
    expect(paths(store)).toEqual(['/', '/bible'])
    expect(store.index).toBe(1)
    expect(store.canGoBack).toBe(true)
    expect(store.canGoForward).toBe(false)
  })

  it('moveTo no meio habilita as duas setas', () => {
    const store = useNavigationHistoryStore()
    for (const p of ['/', '/bible', '/liturgy']) store.push(entry(p))
    store.moveTo(1)
    expect(store.current?.fullPath).toBe('/bible')
    expect(store.canGoBack).toBe(true)
    expect(store.canGoForward).toBe(true)
  })

  it('moveTo no início desabilita voltar', () => {
    const store = useNavigationHistoryStore()
    for (const p of ['/', '/bible']) store.push(entry(p))
    store.moveTo(0)
    expect(store.canGoBack).toBe(false)
    expect(store.canGoForward).toBe(true)
  })

  it('push depois de voltar descarta o que estava à frente', () => {
    const store = useNavigationHistoryStore()
    for (const p of ['/', '/bible', '/liturgy']) store.push(entry(p))
    store.moveTo(0)
    store.push(entry('/albums'))
    expect(paths(store)).toEqual(['/', '/albums'])
    expect(store.canGoForward).toBe(false)
  })

  it('replace troca só a atual', () => {
    const store = useNavigationHistoryStore()
    for (const p of ['/', '/settings']) store.push(entry(p))
    store.replace(entry('/settings/appearance', 'settings'))
    expect(paths(store)).toEqual(['/', '/settings/appearance'])
    expect(store.index).toBe(1)
  })

  it('respeita o limite de entradas', () => {
    const store = useNavigationHistoryStore()
    for (let i = 0; i <= HISTORY_MAX_ENTRIES; i++) store.push(entry(`/p${i}`))
    expect(store.entries).toHaveLength(HISTORY_MAX_ENTRIES)
    expect(store.dots).toHaveLength(9)
    expect(store.dots.at(-1)).toEqual({ index: HISTORY_MAX_ENTRIES - 1, current: true, edge: false })
    expect(store.dots[0].edge).toBe(true)
  })

  it('hydrate restaura um histórico salvo', () => {
    const store = useNavigationHistoryStore()
    store.hydrate({ entries: [entry('/'), entry('/bible', 'bible')], index: 0 })
    expect(paths(store)).toEqual(['/', '/bible'])
    expect(store.index).toBe(0)
    expect(store.canGoForward).toBe(true)
  })

  it('reset volta ao estado vazio', () => {
    const store = useNavigationHistoryStore()
    for (const p of ['/', '/bible']) store.push(entry(p))
    store.reset()
    expect(store.entries).toEqual([])
    expect(store.index).toBe(-1)
  })
})
