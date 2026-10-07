// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@shared/services/browser-storage', () => {
  const state = new Map<string, unknown>()
  return {
    getBrowserItem: (key: string, fallback: unknown) => state.get(key) ?? fallback,
    setBrowserItem: (key: string, value: unknown) => { state.set(key, value) },
  }
})

// Mock com hoisting seguro: estado vive dentro da fábrica do módulo mockado
vi.mock('@shared/services/user-preferences', () => {
  const store = new Map<string, unknown>()
  return {
    getUserPreference: (key: string) => store.get(key) ?? null,
    setUserPreference: (key: string, value: unknown) => { store.set(key, value) },
  }
})

import { useLiturgyStore } from '../stores/useLiturgyStore'

vi.mock('../services/liturgy-catalog', () => ({
  loadLiturgyMusicOptions: vi.fn(async () => []),
  loadLiturgyBibleBooks: vi.fn(async () => []),
}))

describe('duração da liturgia importada (.louvorja durationMs: 0)', () => {
  it('catálogo carregando DEPOIS do import ainda preenche durações zeradas', async () => {
    setActivePinia(createPinia())
    const prefsKey = (await import('@shared/constants/storage-keys')).USER_PREFERENCE_KEYS
    const { getUserPreference, setUserPreference } = await import('@shared/services/user-preferences')
    const current = getUserPreference<object>(prefsKey.liturgyState, null) ?? {}
    setUserPreference(prefsKey.liturgyState, {
      ...(current as Record<string, unknown>),
      // sobrescreve via normalizeLiturgyState-safe shape abaixo
      weekdays: {
        saturday: [
          { id: 'm1', type: 'music', name: 'Hino inicial', subtitle: '', done: false, durationMs: 0, accentColor: '', musicId: 2000 },
        ],
        sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
      },
      dayNotes: {}, daySessionTimes: {}, customLiturgies: [], deletionLocks: {},
    } as never)

    const store = useLiturgyStore()
    await store.hydrate()

    expect(store.weekdays.saturday[0]!.durationMs).toBe(0)

    // Catálogo chega DEPOIS (timing real: import/dismiss antes da API responder)
    ;(store as unknown as { musicList: { value: unknown } }).musicList.value = [
      { id: 2000, title: 'Hino inicial', durationMs: 240_000 },
    ]
    await store.refreshMusicCatalog()

    expect(store.weekdays.saturday[0]!.durationMs).toBe(240_000)
  })
})
