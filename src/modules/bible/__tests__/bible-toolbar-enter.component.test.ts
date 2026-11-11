import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

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

describe('BibleView — busca inteligente da toolbar (modal + Enter)', () => {
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

  async function mountView() {
    const wrapper = mount(BibleView, {
      attachTo: document.body,
      global: { stubs: { GlassCard: false, PalcoRouteSelect: true } },
    })
    await flushPromises()
    return wrapper
  }

  async function typeAndEnter(wrapper: VueWrapper, text: string) {
    await wrapper.find('.smart-search__trigger').trigger('click')
    await flushPromises()
    const input = document.body.querySelector('.smart-search__input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = text
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
  }

  it.each([
    ['genesis 1:1-4, 6', 'hífen'],
    ['genesis 1:1\u20134, 6', 'travessão tipográfico'],
  ])('Enter em "%s" (%s) abre Gênesis 1 filtrado em 1-4 e 6, sem seleção', async (text) => {
    const wrapper = await mountView()
    await typeAndEnter(wrapper, text)

    const store = useBibleStore()
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedChapter).toBe(1)
    expect(store.selectedVerses).toEqual([]) // nada pré-selecionado (ajuste PO)
    expect(store.visibleVerseEntries.map((e) => e.number)).toEqual([1, 2, 3, 4, 6])
    expect(document.body.querySelector('.smart-search__overlay')).toBeNull() // modal fechou
    wrapper.unmount()
  })

  it('Enter com texto comum filtra os versículos sem alterar a seleção', async () => {
    const wrapper = await mountView()
    const store = useBibleStore()
    const bookBefore = store.selectedBookId
    const chapterBefore = store.selectedChapter

    await typeAndEnter(wrapper, 'amor de Deus')

    expect(store.verseSearchQuery).toBe('amor de deus') // serviço normaliza para minúsculas
    expect(store.selectedVerses).toEqual([])
    expect(store.selectedBookId).toBe(bookBefore)
    expect(store.selectedChapter).toBe(chapterBefore)
    wrapper.unmount()
  })
})
