// @vitest-environment jsdom
/**
 * Exportar/importar a liturgia da semana pela store: substituir ou
 * acrescentar, salvando de verdade (sobrevive a reabrir o app).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge: vi.fn(() => null) }))
vi.mock('@shared/composables/useProjectionWindow', () => ({ closeProjectionModule: vi.fn() }))
vi.mock('../../services/liturgy-actions', () => ({
  executeLiturgyItem: vi.fn(),
  openLiturgyMusicPlayer: vi.fn(),
  playLiturgyItemOnScreens: vi.fn(),
}))
vi.mock('../../services/liturgy-catalog', () => ({
  filterLiturgyMusicOptions: vi.fn((opts: unknown[]) => opts),
  loadLiturgyBibleBooks: vi.fn(async () => []),
  loadLiturgyMusicOptions: vi.fn(async () => []),
}))
vi.mock('../../services/liturgy-web-runtime', () => ({ clearLiturgyWebRuntime: vi.fn() }))
vi.mock('../../services/media-probe', () => ({ probeMediaDurationMs: vi.fn(async () => 0) }))

import { useLiturgyStore } from '../useLiturgyStore'
import type { LiturgyItem } from '../../types/liturgy'

const mk = (id: string, over: Partial<LiturgyItem> = {}): LiturgyItem =>
  ({ id, type: 'annotation', name: `Item ${id}`, subtitle: '', done: false, durationMs: 0, accentColor: '', ...over }) as LiturgyItem

describe('useLiturgyStore — exportar/importar a semana', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('exporta a semana; importar substituindo salva e sobrevive a reabrir o app', () => {
    const store = useLiturgyStore()
    store.weekdays = { ...store.weekdays, saturday: [mk('s1', { name: 'Regência' })] }
    const exported = store.exportLiturgy()
    expect(exported.weekdays.saturday.map((i) => i.name)).toEqual(['Regência'])

    store.weekdays = { ...store.weekdays, saturday: [mk('x', { name: 'Outra' })], monday: [mk('m')] }
    store.importLiturgy(exported, 'replace')
    expect(store.weekdays.saturday.map((i) => i.name)).toEqual(['Regência'])
    expect(store.weekdays.monday).toEqual([])

    setActivePinia(createPinia())
    const reopened = useLiturgyStore()
    expect(reopened.weekdays.saturday.map((i) => i.name)).toEqual(['Regência'])
  })

  it('importar acrescentando põe os itens no fim do dia', () => {
    const store = useLiturgyStore()
    store.weekdays = { ...store.weekdays, saturday: [mk('a', { name: 'Atual' })] }
    const exported = store.exportLiturgy()
    store.importLiturgy(exported, 'append')
    expect(store.weekdays.saturday.map((i) => i.name)).toEqual(['Atual', 'Atual'])
    expect(store.hasLiturgyContent).toBe(true)
  })
})
