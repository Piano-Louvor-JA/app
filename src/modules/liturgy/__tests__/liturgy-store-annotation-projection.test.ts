// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { LiturgyItem } from '../types/liturgy'

vi.mock('../services/liturgy-preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/liturgy-preferences')>()
  return { ...actual, saveLiturgyState: vi.fn() }
})

const playLiturgyItemOnScreens = vi.fn(async () => ({ ok: true }))
vi.mock('../services/liturgy-actions', () => ({
  executeLiturgyItem: vi.fn(async () => ({ ok: true })),
  openLiturgyMusicPlayer: vi.fn(async () => ({ ok: true })),
  playLiturgyItemOnScreens: () => playLiturgyItemOnScreens(),
}))

const projectingItemId = ref<string | null>(null)
const toggleAnnotationProjection = vi.fn(async (item: LiturgyItem) => {
  projectingItemId.value = projectingItemId.value === item.id ? null : item.id
  return projectingItemId.value === item.id
})
vi.mock('../services/annotation-projection', () => ({
  toggleAnnotationProjection: (item: LiturgyItem) => toggleAnnotationProjection(item),
  useAnnotationProjection: () => ({ projectingItemId }),
}))

import { useLiturgyStore } from '../stores/useLiturgyStore'

const note: LiturgyItem = {
  id: 'note-1',
  type: 'annotation',
  name: 'Avisos',
  subtitle: 'Reunião',
  done: false,
  durationMs: 0,
  accentColor: '#000',
}

function storeWith(items: LiturgyItem[]) {
  const store = useLiturgyStore()
  ;(store as unknown as { currentItems: LiturgyItem[] }).currentItems = items
  return store
}

describe('liturgia — play da anotação', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    projectingItemId.value = null
    toggleAnnotationProjection.mockClear()
    playLiturgyItemOnScreens.mockClear()
  })

  it('liga e desliga a projeção da anotação sem marcar concluída', async () => {
    const store = storeWith([{ ...note }])
    await store.playItemOnScreens(0)
    expect(toggleAnnotationProjection).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }))
    expect(projectingItemId.value).toBe('note-1')
    expect(store.selectedItemIndex).toBe(0)
    expect(store.lastActionMessageKey).toBeNull()
    expect(store.currentItems[0].done).toBe(false)
    expect(playLiturgyItemOnScreens).not.toHaveBeenCalled()

    await store.playItemOnScreens(0)
    expect(projectingItemId.value).toBeNull()
    expect(store.lastActionMessageKey).toBeNull()
  })

  it('falha ao abrir avisa o operador', async () => {
    toggleAnnotationProjection.mockResolvedValueOnce(false)
    const store = storeWith([{ ...note }])
    await store.playItemOnScreens(0)
    expect(store.lastActionMessageKey).toBe('liturgy.messages.projectionFailed')
  })
})
