import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

// Loaders reais vivem em bible-catalog.ts — mock dos 3 que a store usa no boot.
const { loadBibleBooks, loadBibleVersions, loadChapterVerses } = vi.hoisted(() => ({
  loadBibleBooks: vi.fn(),
  loadBibleVersions: vi.fn(),
  loadChapterVerses: vi.fn(),
}))

vi.mock('../services/bible-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bible-catalog')>()
  return { ...actual, loadBibleBooks, loadBibleVersions, loadChapterVerses }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
  createI18n: vi.fn(),
}))

import { useBibleStore } from '../stores/useBibleStore'
import BibleView from '../views/BibleView.vue'
import type { BibleBook } from '../types/bible'

const books: BibleBook[] = [
  { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50, bookNumber: 1, languageId: 'pt' },
  { id: 66, name: 'Apocalipse', abbreviation: 'Ap', chapters: 22, bookNumber: 66, languageId: 'pt' },
]

describe('BibleView — toolbar 1-shot (Enter no campo global)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    loadBibleBooks.mockResolvedValue(books)
    loadBibleVersions.mockResolvedValue([
      { id: 1, name: 'SEV', abbreviation: 'sev', languageId: 'pt' },
    ])
    loadChapterVerses.mockImplementation(
      async (_v: number, _b: number, ch: number) =>
        Object.fromEntries(Array.from({ length: 31 }, (_, i) => [String(i + 1), `v${i + 1}`])),
    )
  })

  it('Enter na toolbar dispara 1-shot: genesis 1:1-4, 6 seleciona versículos', async () => {
    const wrapper = mount(BibleView, {
      global: { stubs: { GlassCard: false, PalcoRouteSelect: true,teleport: true } },
    })
    await flushPromises()

    // Abre nav panel para o fluxo real? Não — o campo alvo é o da toolbar.
    const toolbar = wrapper.findComponent({ name: 'BibleToolbar' })
    const input = toolbar.find('.bible-toolbar__search-input')
    expect(input.exists()).toBe(true)

    await input.setValue('genesis 1:1-4, 6')
    await input.trigger('keydown.enter')
    await flushPromises()

    const store = useBibleStore()
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedChapter).toBe(1)
    expect(store.selectedVerses).toEqual([]) // nada pré-selecionado (ajuste PO)
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('Enter na toolbar com travessão tipográfico também resolve', async () => {
    const wrapper = mount(BibleView, {
      global: { stubs: { GlassCard: false, PalcoRouteSelect: true, teleport: true } },
    })
    await flushPromises()

    const input = wrapper
      .findComponent({ name: 'BibleToolbar' })
      .find('.bible-toolbar__search-input')
    await input.setValue('genesis 1:1\u20134, 6')
    await input.trigger('keydown.enter')
    await flushPromises()

    const store = useBibleStore()
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedVerses).toEqual([]) // nada pré-selecionado (ajuste PO)
    wrapper.unmount()
  })

  it('Enter com texto comum NÃO altera seleção (mantém filtro textual)', async () => {
    const wrapper = mount(BibleView, {
      global: { stubs: { GlassCard: false, PalcoRouteSelect: true, teleport: true } },
    })
    await flushPromises()

    const input = wrapper
      .findComponent({ name: 'BibleToolbar' })
      .find('.bible-toolbar__search-input')
    await input.setValue('amor de Deus')
    await input.trigger('keydown.enter')
    await flushPromises()

    const store = useBibleStore()
    expect(store.selectedVerses).toEqual([])
    expect(store.globalSearchQuery).toBe('amor de Deus')
    wrapper.unmount()
  })
})
