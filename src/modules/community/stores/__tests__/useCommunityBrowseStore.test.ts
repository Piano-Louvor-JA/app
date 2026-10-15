import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useCommunityBrowseStore } from '../useCommunityBrowseStore'

describe('useCommunityBrowseStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('começa sem busca e na página 1', () => {
    const store = useCommunityBrowseStore()
    expect(store.searchQuery).toBe('')
    expect(store.page).toBe(1)
  })

  it('mantém os valores entre usos da store na mesma sessão', () => {
    const first = useCommunityBrowseStore()
    first.searchQuery = 'vox'
    first.page = 3
    const again = useCommunityBrowseStore()
    expect(again.searchQuery).toBe('vox')
    expect(again.page).toBe(3)
  })
})
