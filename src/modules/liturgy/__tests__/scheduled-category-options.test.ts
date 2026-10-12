// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock com hoisting seguro: estado vive dentro da fábrica do módulo mockado
vi.mock('@shared/services/browser-storage', () => {
  const state = new Map<string, unknown>()
  return {
    getBrowserItem: (key: string, fallback: unknown) => state.get(key) ?? fallback,
    setBrowserItem: (key: string, value: unknown) => { state.set(key, value) },
  }
})

import { useLiturgyStore } from '../stores/useLiturgyStore'
import { useScheduledStore } from '../stores/useScheduledStore'

describe('categoryOptions para placeholder agendado', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('quando draft.type = scheduled, opções incluem as rotações agendadas', () => {
    const scheduled = useScheduledStore()
    scheduled.upsertCategory({ id: 'rot-1', name: 'Provai e Vede' })

    const store = useLiturgyStore()
    store.setItemDraft({ type: 'scheduled', name: '' } as never)

    const options = store.categoryOptions
    expect(options.some((o) => o.id === 'rot-1' && o.name === 'Provai e Vede')).toBe(true)
  })

  it('quando draft é outro tipo, opções continuam sendo só categorias da liturgia', () => {
    const scheduled = useScheduledStore()
    scheduled.upsertCategory({ id: 'rot-2', name: 'Rotação isolada' })

    const store = useLiturgyStore()
    store.setItemDraft({ type: 'music', name: '' } as never)
    expect(store.categoryOptions.some((o) => o.id === 'rot-2')).toBe(false)
  })
})
