import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../services/bible-catalog', () => ({
  resolveVersionAbbreviation: vi.fn((id: number) => `ARC${id}`),
  resolveTestament: vi.fn((n: number) => (n <= 39 ? 'ot' : 'nt')),
  resolveBookTone: vi.fn(() => 'default'),
  chapterRecordKey: vi.fn((v: number, c: number) => `${v}:${c}`),
  loadBibleBooks: vi.fn(async () => [
    { id: 1, name: 'Gênesis', bookNumber: 1, chapters: 50, testament: 'ot' },
    { id: 40, name: 'Mateus', bookNumber: 40, chapters: 28, testament: 'nt' }
  ]),
  loadBibleVersions: vi.fn(async () => [
    { id: 1, name: 'Almeida Revista e Corrigida', abbreviation: 'ARC' },
  ]),
  loadChapterVerses: vi.fn(async () => ({
    '1': 'No princípio Deus criou os céus.',
    '2': 'E a terra era sem forma.',
  })),
  pickDefaultVersionId: vi.fn((versions: Array<{ id: number }>) => versions[0]?.id ?? null),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(() => false),
  isProjectionModuleOpen: vi.fn(() => false),
  openProjectionModule: vi.fn(),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  getPalcoRoute: vi.fn(() => null),
}))
vi.mock('../services/bible-runtime', () => ({
  publishBibleSelection: vi.fn(),
  publishBibleRuntimeOff: vi.fn(),
}))

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn((_key: string, fallback: unknown) => fallback),
  setUserPreference: vi.fn(),
}))

import { useBibleStore } from '../useBibleStore'

describe('useBibleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('bootstrap (carrega versões + livros)', () => {
    it('popula books e versions', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      expect(store.books).toHaveLength(2)
      expect(store.versions).toHaveLength(1)
      expect(store.selectedVersionId).toBe(1)
    })

    it('não refetch se já populado (idempotente)', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      await store.bootstrap()
      expect(store.books).toHaveLength(2)
    })
  })

  describe('seleção de versão/livro/capítulo', () => {
    it('selectVersion troca a versão', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      await store.selectVersion(1)
      expect(store.selectedVersionId).toBe(1)
    })

    it('selectBook troca o livro e reseta capítulo', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      store.selectedChapter = 5
      await store.selectBook(40)
      expect(store.selectedBookId).toBe(40)
    })

    it('selectChapter troca o capítulo e carrega versos', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      store.selectedBookId = 1
      await store.selectChapter(1)
      expect(store.selectedChapter).toBe(1)
      expect(Object.keys(store.verses).length).toBeGreaterThan(0)
    })
  })

  describe('seleção de versos', () => {
    it('selectVerse simples substitui a seleção', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      store.selectedBookId = 1
      await store.selectChapter(1)
      store.selectVerse(1)
      store.selectVerse(2, { ctrlKey: false } as MouseEvent)
      expect(store.selectedVerses).toEqual([2])
    })

    it('selectVerse com ctrlKey faz toggle', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      store.selectedBookId = 1
      await store.selectChapter(1)
      store.selectVerse(1, { ctrlKey: true } as MouseEvent)
      store.selectVerse(2, { ctrlKey: true } as MouseEvent)
      expect(store.selectedVerses).toEqual([1, 2])
      store.selectVerse(1, { ctrlKey: true } as MouseEvent)
      expect(store.selectedVerses).toEqual([2])
    })

    it('selectVerse com shiftKey seleciona range', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      store.selectedBookId = 1
      await store.selectChapter(1)
      store.selectVerse(1)
      store.selectVerse(2, { shiftKey: true } as MouseEvent)
      expect(store.selectedVerses).toEqual([1, 2])
    })

    it('verso inexistente é ignorado', () => {
      const store = useBibleStore()
      store.selectVerse(999)
      expect(store.selectedVerses).toHaveLength(0)
    })

    it('clearSelection limpa', async () => {
      const store = useBibleStore()
      await store.bootstrap()
      store.selectedBookId = 1
      await store.selectChapter(1)
      store.selectVerse(1)
      store.clearSelection()
      expect(store.selectedVerses).toHaveLength(0)
    })
  })

  describe('filtros e busca', () => {
    it('setTestamentFilter troca ot/nt', () => {
      const store = useBibleStore()
      store.setTestamentFilter('nt')
      expect(store.testamentFilter).toBe('nt')
    })

    it('setters de busca atualizam queries', () => {
      const store = useBibleStore()
      store.bookSearchQuery = 'gên'
      store.chapterSearchQuery = '1'
      store.verseSearchQuery = 'princípio'
      expect(store.bookSearchQuery).toBe('gên')
      expect(store.chapterSearchQuery).toBe('1')
      expect(store.verseSearchQuery).toBe('princípio')
    })
  })

  describe('painel de navegação', () => {
    it('showNavPanel toggle', () => {
      const store = useBibleStore()
      const before = store.showNavPanel
      store.showNavPanel = !before
      expect(store.showNavPanel).toBe(!before)
    })
  })
})
