import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
const language = vi.hoisted(() => ({ value: 'pt' }))
vi.mock('@modules/sync/services/library-catalog', () => ({ getCurrentApiPrefix: () => language.value }))
vi.mock('../services/liturgy-catalog', () => ({
  loadLiturgyMusicOptions: async () => [],
  loadLiturgyBibleBooks: async () => [{ id: 1, name: language.value === 'fr' ? 'Genèse' : 'Gênesis', chapters: 50 }],
  filterLiturgyMusicOptions: () => [],
}))
import { useLiturgyStore } from '../stores/useLiturgyStore'
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); language.value = 'pt'; setActivePinia(createPinia()) })
describe('Troca de idioma na liturgia aberta anteriormente', () => {
  it('recarrega o catálogo sem perder a seleção ou o programa do usuário', async () => {
    const store = useLiturgyStore()
    await store.hydrate()
    expect(store.bibleBooks[0]?.name).toBe('Gênesis')
    store.selectDay('saturday')
    store.currentItems = [{ id: 'reading', type: 'annotation', name: 'Leitura escolhida', done: false, subtitle: '', durationMs: 60000, accentColor: '#fff' }]
    language.value = 'fr'
    await store.hydrate()
    expect(store.bibleBooks[0]?.name).toBe('Genèse')
    expect(store.selectedDay).toBe('saturday')
    expect(store.currentItems[0]?.name).toBe('Leitura escolhida')
  })
})
