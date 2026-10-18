import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLiturgyStore } from '../stores/useLiturgyStore'
import { loadLiturgyState } from '../services/liturgy-preferences'
import type { LiturgyItem } from '../types/liturgy'

vi.mock('../services/liturgy-catalog', () => ({
  loadLiturgyMusicOptions: async () => [], loadLiturgyBibleBooks: async () => [],
  filterLiturgyMusicOptions: () => [],
}))

const item = (id: string): LiturgyItem => ({
  id, type: 'annotation', name: 'Leitura', subtitle: '', done: false,
  durationMs: 300000, accentColor: '#000',
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setActivePinia(createPinia())
})

describe('Equipe da liturgia', () => {
  it('salva e restaura responsáveis no dia correto, sem alterar os outros dias', () => {
    const store = useLiturgyStore()
    store.selectDay('saturday')
    store.currentItems = [item('reading')]
    store.setTeamAssignments({ reading: '  Marie  ', removed: 'Ignorar' })
    expect(loadLiturgyState().weekdays.saturday[0]?.responsible).toBe('Marie')
    setActivePinia(createPinia())
    const restored = useLiturgyStore()
    restored.selectDay('saturday')
    expect(restored.currentItems[0]?.responsible).toBe('Marie')
    restored.selectDay('sunday')
    expect(restored.currentItems).toEqual([])
  })

  it('preserva a atribuição ao editar e permite removê-la explicitamente', () => {
    const store = useLiturgyStore()
    store.currentItems = [item('reading')]
    store.setTeamAssignments({ reading: 'Marie' })
    store.openEditDialog(0)
    store.setItemDraft({ ...store.itemDraft, name: 'Leitura bíblica' })
    expect(store.saveItemDraft()).toBe(true)
    expect(store.currentItems[0]?.responsible).toBe('Marie')
    store.setTeamAssignments({ reading: '' })
    expect(loadLiturgyState().weekdays[store.selectedDay as 'saturday'][0]?.responsible).toBeUndefined()
  })

  it('persiste na liturgia avulsa e limita o tamanho dos nomes', () => {
    const store = useLiturgyStore()
    store.newCustomName = 'Culto especial'
    store.createCustomLiturgy()
    store.currentItems = [item('custom-reading')]
    store.setTeamAssignments({ 'custom-reading': 'A'.repeat(150) })
    const state = loadLiturgyState()
    expect(state.customLiturgies[0]?.items[0]?.responsible).toHaveLength(120)
  })
})
