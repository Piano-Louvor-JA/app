import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { loadBibleBooks, loadBibleVersions, loadChapterVerses } = vi.hoisted(() => ({
  loadBibleBooks: vi.fn(),
  loadBibleVersions: vi.fn(),
  loadChapterVerses: vi.fn(),
}))

vi.mock('../services/bible-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bible-catalog')>()
  return {
    ...actual,
    loadBibleBooks,
    loadBibleVersions,
    loadChapterVerses,
  }
})

import { useBibleStore } from '../stores/useBibleStore'
import type { BibleBook } from '../types/bible'

const books: BibleBook[] = [
  { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50, bookNumber: 1, languageId: 'pt' },
  { id: 66, name: 'Apocalipse', abbreviation: 'Ap', chapters: 22, bookNumber: 66, languageId: 'pt' },
]

function versesFor(chapter: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: 31 }, (_, i) => [String(i + 1), `v${i + 1}`]),
  ) as Record<string, string>
}

describe('useBibleStore — busca de livros (SPEC R1/R2/R4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    loadBibleBooks.mockResolvedValue(books)
    loadBibleVersions.mockResolvedValue([
      { id: 7, abbreviation: 'ARA', languageId: 'pt' },
    ])
    loadChapterVerses.mockImplementation(async (_v: number, _b: number, ch: number) => versesFor(ch))
  })

  it('R1: "apocalipse" com AT ativo acha Apocalipse', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    store.setTestamentFilter('ot')
    store.bookSearchQuery = 'apocalipse'
    expect(store.filteredBooks.map((b) => b.name)).toEqual(['Apocalipse'])
  })

  it('R2: "genesis" sem acento acha Gênesis', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    store.bookSearchQuery = 'genesis'
    expect(store.filteredBooks.map((b) => b.name)).toEqual(['Gênesis'])
  })

  it('sem query, filtro AT preserva AT', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    store.setTestamentFilter('ot')
    store.bookSearchQuery = ''
    expect(store.filteredBooks.map((b) => b.name)).toEqual(['Gênesis'])
  })

  it('R4: referência completa 1-shot seleciona livro+capítulo+versículos', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    store.setTestamentFilter('ot')
    store.bookSearchQuery = 'genesis 1:1-4, 6'

    const applied = await store.applyBookSearchReference()
    expect(applied).toBe(true)
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedChapter).toBe(1)
    expect([...store.selectedVerses]).toEqual([1, 2, 3, 4, 6])
    expect(store.bookSearchQuery).toBe('')
  })

  it('R4: referência cruza testamento (apocalipse com AT ativo)', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    store.setTestamentFilter('ot')
    store.bookSearchQuery = 'ap 1:1-2'

    expect(await store.applyBookSearchReference()).toBe(true)
    expect(store.selectedBookId).toBe(66)
    expect(store.selectedChapter).toBe(1)
    expect([...store.selectedVerses]).toEqual([1, 2])
    // selectBook troca o filtro p/ o testamento do livro escolhido
    expect(store.testamentFilter).toBe('nt')
  })

  it('livro sem capítulo NÃO dispara 1-shot (filtra grid)', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    store.bookSearchQuery = 'genesis'
    expect(await store.applyBookSearchReference()).toBe(false)
    expect(store.selectedBookId).toBe(books[0]!.id) // bootstrap default, não 1-shot
  })
})
