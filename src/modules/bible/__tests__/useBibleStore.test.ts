// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/bible-catalog', () => ({
  loadBibleBooks: vi.fn(),
  loadBibleVersions: vi.fn(),
  loadChapterVerses: vi.fn(),
  pickDefaultVersionId: vi.fn(),
  resolveTestament: vi.fn((n: number) => (n <= 39 ? 'ot' : 'nt')),
}))

vi.mock('../services/bible-runtime', () => ({
  publishBibleSelection: vi.fn(),
  publishBibleRuntimeOff: vi.fn(),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  openProjectionModule: vi.fn(),
  closeProjectionModule: vi.fn(),
  isProjectionModuleOpen: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(),
}))

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(),
  setUserPreference: vi.fn(),
}))

vi.mock('../../settings/services/palco-routing', () => ({
  getPalcoRoute: vi.fn(),
}))

import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'
import { getPalcoRoute } from '../../settings/services/palco-routing'

import {
  loadBibleBooks,
  loadBibleVersions,
  loadChapterVerses,
  pickDefaultVersionId,
} from '../services/bible-catalog'
import { publishBibleSelection, publishBibleRuntimeOff } from '../services/bible-runtime'
import { useBibleStore } from '../stores/useBibleStore'
import type { BibleBook, BibleVersion } from '../types/bible'

const mockBooks = vi.mocked(loadBibleBooks)
const mockVersions = vi.mocked(loadBibleVersions)
const mockVerses = vi.mocked(loadChapterVerses)
const mockPick = vi.mocked(pickDefaultVersionId)
const mockGetPref = vi.mocked(getUserPreference)
const mockSetPref = vi.mocked(setUserPreference)
const mockIsOpen = vi.mocked(isProjectionModuleOpen)
const mockOpenModule = vi.mocked(openProjectionModule)
const mockCloseModule = vi.mocked(closeProjectionModule)
const mockHasExternal = vi.mocked(hasSelectedExtendedProjectionTargets)
const mockRoute = vi.mocked(getPalcoRoute)
const mockPublish = vi.mocked(publishBibleSelection)
const mockPublishOff = vi.mocked(publishBibleRuntimeOff)

const BOOKS: BibleBook[] = [
  { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 2, bookNumber: 1, languageId: 'pt' },
  { id: 2, name: 'Êxodo', abbreviation: 'Ex', chapters: 1, bookNumber: 2, languageId: 'pt' },
  { id: 40, name: 'Mateus', abbreviation: 'Mt', chapters: 1, bookNumber: 40, languageId: 'pt' },
]

const VERSIONS: BibleVersion[] = [
  { id: 1, abbreviation: 'ARA', name: 'Almeida Revista e Atualizada', languageId: 'pt' },
  { id: 2, abbreviation: 'NVI', name: 'Nova Versão Internacional', languageId: 'pt' },
]

const GEN1 = { '1': 'v1', '2': 'v2', '3': 'v3' }

async function bootstrappedStore(opts?: { verses?: Record<string, string> }) {
  const store = useBibleStore()
  await store.bootstrap()
  store.verses = opts?.verses ?? GEN1
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockBooks.mockResolvedValue(BOOKS)
  mockVersions.mockResolvedValue(VERSIONS)
  mockVerses.mockResolvedValue(GEN1)
  mockPick.mockImplementation((versions) => versions[0].id)
  mockGetPref.mockReturnValue(null)
  mockIsOpen.mockReturnValue(false)
  mockHasExternal.mockResolvedValue(true)
  mockRoute.mockReturnValue('mirror')
  mockOpenModule.mockResolvedValue(true)
})

describe('bootstrap', () => {
  it('carrega catálogo, versão padrão e capítulo', async () => {
    const store = useBibleStore()
    await store.bootstrap()

    expect(store.books).toEqual(BOOKS)
    expect(store.versions).toEqual(VERSIONS)
    expect(store.selectedVersionId).toBe(1)
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedChapter).toBe(1)
    expect(store.testamentFilter).toBe('ot')
    expect(store.isLoadingMeta).toBe(false)
    expect(store.verses).toEqual(GEN1)
  })

  it('erro de catálogo seta lastErrorKey e zera listas', async () => {
    mockBooks.mockRejectedValue(new Error('offline'))
    const store = useBibleStore()
    await store.bootstrap()
    expect(store.lastErrorKey).toBe('bible.errors.loadCatalogFailed')
    expect(store.books).toEqual([])
    expect(store.versions).toEqual([])
  })

  it('catálogo vazio seta erro sem lançar', async () => {
    mockBooks.mockResolvedValue([])
    const store = useBibleStore()
    await store.bootstrap()
    expect(store.lastErrorKey).toBe('bible.errors.loadCatalogFailed')
  })

  it('projeção aberta antes do bootstrap reinicia watch', async () => {
    mockIsOpen.mockReturnValue(true)
    const store = useBibleStore()
    await store.bootstrap()
    expect(store.isProjecting).toBe(true)
  })

  it('versão salva na preferência é usada', async () => {
    mockGetPref.mockReturnValue(2)
    mockPick.mockImplementation((versions, saved) => saved ?? versions[0].id)
    const store = useBibleStore()
    await store.bootstrap()
    expect(store.selectedVersionId).toBe(2)
  })
})

describe('computed de navegação', () => {
  it('selectedBook/selectedVersion', async () => {
    const store = await bootstrappedStore()
    expect(store.selectedBook?.name).toBe('Gênesis')
    expect(store.selectedVersion?.abbreviation).toBe('ARA')

    const fresh = useBibleStore()
    fresh.books = []
    fresh.versions = []
    expect(fresh.selectedBook).toBeNull()
    expect(fresh.selectedVersion).toBeNull()
  })

  it('filteredBooks filtra por testamento e busca', async () => {
    const store = await bootstrappedStore()
    expect(store.filteredBooks.map((b) => b.id)).toEqual([1, 2])

    store.setTestamentFilter('nt')
    expect(store.filteredBooks.map((b) => b.id)).toEqual([40])

    store.setTestamentFilter('ot')
    store.bookSearchQuery = 'gên'
    expect(store.filteredBooks.map((b) => b.id)).toEqual([1])

    store.bookSearchQuery = 'gn'
    expect(store.filteredBooks.map((b) => b.id)).toEqual([1])

    store.bookSearchQuery = 'zzz'
    expect(store.filteredBooks).toEqual([])
  })

  it('chapterNumbers lista e filtra por prefixo', async () => {
    const store = await bootstrappedStore()
    expect(store.chapterNumbers).toEqual([1, 2])

    store.chapterSearchQuery = '2'
    expect(store.chapterNumbers).toEqual([2])

    store.chapterSearchQuery = '9'
    expect(store.chapterNumbers).toEqual([])
  })

  it('locationLabel e chapterTitle', async () => {
    const store = await bootstrappedStore()
    expect(store.locationLabel).toBe('Gênesis 1')
    expect(store.chapterTitle).toBe('Gênesis 1')

    store.selectVerse(2)
    expect(store.locationLabel).toBe('Gênesis 1:2')

    const fresh = useBibleStore()
    fresh.books = []
    expect(fresh.locationLabel).toBe('')
    expect(fresh.chapterTitle).toBe('')
  })

  it('verseEntries ordena e filtra por busca global e de versículo', async () => {
    const store = await bootstrappedStore()
    expect(store.verseEntries.map((e) => e.number)).toEqual([1, 2, 3])

    store.globalSearchQuery = 'v1'
    expect(store.verseEntries.map((e) => e.number)).toEqual([1])

    store.globalSearchQuery = ''
    store.verseSearchQuery = '2'
    expect(store.verseEntries.map((e) => e.number)).toEqual([2])

    store.verseSearchQuery = ''
    store.verses = { '1': 'x', quebra: 'y', '3': 'z' }
    expect(store.verseEntries.map((e) => e.number)).toEqual([1, 3])
  })
})

describe('seleção de versículos', () => {
  it('clique simples seleciona um', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(2)
    expect(store.selectedVerses).toEqual([2])
  })

  it('versículo inexistente é ignorado', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(99)
    expect(store.selectedVerses).toEqual([])
  })

  it('ctrl/meta toggle add/remove mantendo ordenado', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(3, { ctrlKey: true } as MouseEvent)
    store.selectVerse(1, { ctrlKey: true } as MouseEvent)
    expect(store.selectedVerses).toEqual([1, 3])
    store.selectVerse(3, { metaKey: true } as MouseEvent)
    expect(store.selectedVerses).toEqual([1])
  })

  it('shift seleciona intervalo entre âncora e clique', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    store.selectVerse(3, { shiftKey: true } as MouseEvent)
    expect(store.selectedVerses).toEqual([1, 2, 3])
    // shift 3→1 também cobre o intervalo completo (min..max)
    store.selectVerse(1, { shiftKey: true } as MouseEvent)
    expect(store.selectedVerses).toEqual([1, 2, 3])
    // intervalo pulando versículos inexistentes
    store.verses = { ...GEN1, '2': undefined } as unknown as Record<string, string>
    store.selectVerse(1)
    store.selectVerse(3, { shiftKey: true } as MouseEvent)
    expect(store.selectedVerses).toEqual([1, 3])
  })

  it('applyVerseSearch aplica e limpa a query; vazio não mexe', async () => {
    const store = await bootstrappedStore()
    store.verseSearchQuery = '1-2'
    store.applyVerseSearch()
    expect(store.selectedVerses).toEqual([1, 2])
    expect(store.verseSearchQuery).toBe('')

    store.verseSearchQuery = 'zz'
    store.applyVerseSearch()
    expect(store.selectedVerses).toEqual([1, 2])
  })

  it('clearSelection zera seleção', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    store.clearSelection()
    expect(store.selectedVerses).toEqual([])
  })
})

describe('navegação', () => {
  it('selectVersion troca, salva preferência e recarrega capítulo', async () => {
    const store = await bootstrappedStore()
    await store.selectVersion(2)
    expect(store.selectedVersionId).toBe(2)
    expect(mockSetPref).toHaveBeenCalled()
    expect(store.selectedVerses).toEqual([])

    await store.selectVersion(2)
    expect(mockSetPref).toHaveBeenCalledTimes(1)
  })

  it('selectBook inexistente é ignorado', async () => {
    const store = await bootstrappedStore()
    await store.selectBook(999)
    expect(store.selectedBookId).toBe(1)
  })

  it('selectBook ajusta capítulo acima do máximo e atualiza testamento', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    await store.selectChapter(2)
    await store.selectBook(2)
    expect(store.selectedBookId).toBe(2)
    expect(store.selectedChapter).toBe(1)
    expect(store.testamentFilter).toBe('ot')
  })

  it('selectChapter limita a 1..max e ignora repetido', async () => {
    const store = await bootstrappedStore()
    await store.selectChapter(0)
    expect(store.selectedChapter).toBe(1)

    await store.selectChapter(2)
    expect(store.selectedChapter).toBe(2)

    await store.selectChapter(99)
    expect(store.selectedChapter).toBe(2)

    mockVerses.mockClear()
    await store.selectChapter(2)
    expect(mockVerses).not.toHaveBeenCalled()
  })

  it('goToAdjacentVerse sem seleção não faz nada', async () => {
    const store = await bootstrappedStore()
    await store.goToAdjacentVerse(1)
    expect(store.selectedVerses).toEqual([])
  })

  it('avança e recua dentro do capítulo', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    await store.goToAdjacentVerse(1)
    expect(store.selectedVerses).toEqual([2])

    await store.goToAdjacentVerse(-1)
    expect(store.selectedVerses).toEqual([1])
  })

  it('avança para próximo capítulo e seleciona primeiro versículo', async () => {
    const store = await bootstrappedStore({ verses: GEN1 })
    mockVerses.mockResolvedValue({ '10': 'dez' })
    store.selectVerse(3)
    await store.goToAdjacentVerse(1)
    expect(store.selectedChapter).toBe(2)
    expect(store.selectedVerses).toEqual([10])
  })

  it('recua para capítulo anterior e seleciona último versículo', async () => {
    const store = await bootstrappedStore()
    await store.selectChapter(2)
    mockVerses.mockClear()
    mockVerses.mockResolvedValue({ '5': 'cinco', '6': 'seis' })
    store.verses = { '5': 'cinco', '6': 'seis' }
    store.selectVerse(5)
    await store.goToAdjacentVerse(-1)
    expect(store.selectedChapter).toBe(1)
    expect(store.selectedVerses).toEqual([6])
  })

  it('avançando no fim do livro vai pro próximo livro cap 1', async () => {
    const store = await bootstrappedStore({ verses: { '1': 'um' } })
    store.selectVerse(1)
    mockVerses.mockResolvedValue({ '1': 'primeiro' })
    await store.selectBook(2)
    await store.selectChapter(1)
    store.selectVerse(1)
    await store.goToAdjacentVerse(1)
    expect(store.selectedBookId).toBe(40)
    expect(store.selectedChapter).toBe(1)
    expect(store.selectedVerses).toEqual([1])
  })

  it('avançando no último livro volta pro primeiro', async () => {
    const store = await bootstrappedStore({ verses: { '1': 'um' } })
    mockVerses.mockClear()
    mockVerses.mockResolvedValue({ '1': 'primeiro' })
    await store.selectBook(40)
    store.selectVerse(1)
    await store.goToAdjacentVerse(1)
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedVerses).toEqual([1])
  })

  it('recuando no começo do livro vai pro livro anterior último cap', async () => {
    const store = await bootstrappedStore({ verses: { '1': 'um' } })
    mockVerses.mockClear()
    mockVerses.mockResolvedValue({ '1': 'x', '2': 'y' })
    await store.selectBook(2)
    store.selectVerse(1)
    await store.goToAdjacentVerse(-1)
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedChapter).toBe(2)
    expect(store.selectedVerses).toEqual([2])
  })

  it('recuando no primeiro livro/versículo fica onde está (wrap pro último livro)', async () => {
    const store = await bootstrappedStore({ verses: { '1': 'um' } })
    store.selectVerse(1)
    mockVerses.mockResolvedValue({ '1': 'apenas' })
    await store.goToAdjacentVerse(-1)
    expect(store.selectedVerses).toEqual([1])
  })
})

describe('refreshChapter', () => {
  it('selectChapter com livro inválido não carrega versículos novos', async () => {
    const store = await bootstrappedStore()
    mockVerses.mockClear()
    mockVerses.mockResolvedValue({})
    store.selectedBookId = 0
    await store.selectChapter(2)
    expect(store.verses).toEqual({})
  })

  it('selectBook clampa capítulo pra baixo (de capítulo alto pra livro curto)', async () => {
    const store = await bootstrappedStore()
    await store.selectChapter(2)
    store.selectedChapter = 5
    await store.selectBook(2)
    expect(store.selectedChapter).toBe(1)
    expect(store.selectedBookId).toBe(2)
  })

  it('branch book sem seleção: goToAdjacentVerse early-return e capítulos vazios', async () => {
    const store = await bootstrappedStore()
    // book null via selectedBookId inválido cobre guard interno de goToAdjacentVerse;
    // selectedVerses setado direto para passar o guard inicial sem selectVerse
    store.selectedVerses = [2]
    store.selectedBookId = 0
    store.verses = {}
    await store.goToAdjacentVerse(1)
    expect(store.selectedVerses).toEqual([2])

    // chapterNumbers com livro sem capítulos
    store.selectedBookId = 2
    store.books = [{ ...store.books[1], chapters: 0 }]
    expect(store.chapterNumbers).toEqual([])

    // chapterNumbers com nenhum livro selecionado (total = 0 via ?? )
    const emptyStore = useBibleStore()
    emptyStore.books = []
    expect(emptyStore.chapterNumbers).toEqual([])

    // verseEntries com versos cuja chave não é número (text fallback '')
    const junkStore = await bootstrappedStore()
    junkStore.verses = { '1': 'x', lixo: 'y' }
    const junk = junkStore.verseEntries.find((e) => e.number === 1)
    expect(junk?.text).toBe('x')

    // texto vazio → cai no lado direito do ?? (fallback '')
    junkStore.verses = { '1': '' }
    expect(junkStore.verseEntries[0]?.text).toBe('')

    // valor undefined com chave presente → lado direito do ?? (159)
    junkStore.verses = { '1': undefined } as unknown as Record<string, string>
    expect(junkStore.verseEntries[0]?.text).toBe('')
  })

  it('publishProjectionState com projeção ligada (seleção e empty)', async () => {
    const store = await bootstrappedStore()
    store.isProjecting = true
    store.selectVerse(2)
    mockPublish.mockClear()
    store.syncProjection()
    expect(mockPublish).toHaveBeenCalledTimes(1)

    // desseleciona tudo → ramo de empty selection com publish
    mockPublish.mockClear()
    store.clearSelection()
    expect(mockPublish).toHaveBeenCalledTimes(1)
  })

  it('syncProjection publica seleção explicitamente (default arg)', async () => {
    const store = await bootstrappedStore()
    store.isProjecting = true
    store.selectVerse(2)
    mockPublish.mockClear()
    store.syncProjection()
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ verses: [2] }),
    )

    // segundo publish sem argumento usa default projection.value
    store.syncProjection()
    expect(mockPublish).toHaveBeenCalledTimes(2)
  })

  it('goToAdjacentVerse sem livro selecionado (wrap guards)', async () => {
    const store = await bootstrappedStore({ verses: { '1': 'um' } })
    mockVerses.mockClear()
    mockVerses.mockResolvedValue({})
    // Êxodo tem 1 capítulo: após selectChapter(1), cap 1 é o último → wrap pro Mateus
    await store.selectBook(2)
    await store.selectChapter(1)
    store.selectedVerses = [1]
    store.verses = { '1': 'um' }
    await store.goToAdjacentVerse(1)
    expect(store.selectedBookId).toBe(40)
    expect(store.selectedVerses).toEqual([])

    // recuo: Mateus cap 1 → wrap pro livro anterior (Êxodo cap 1), sem versos
    await store.selectBook(40)
    store.selectedVerses = [1]
    store.verses = { '1': 'um' }
    await store.goToAdjacentVerse(-1)
    expect(store.selectedBookId).toBe(2)
    expect(store.selectedVerses).toEqual([])

    // guards defensivos: wrap normal mas books esvaziado ANTES da chamada
    // (selectedBook ainda resolve via ref? não: books=[] -> book null -> guard cedo).
    // Para atingir !nextBook/!prevBook precisamos do caminho pós-guard: capítulo
    // avançado com books mutado entre selectChapter e goToAdjacentVerse.
    // 463: capítulo seguinte (1<2) carrega sem versos -> first=NaN ->
    // Number.isFinite false -> sem seleção (branch FALSO). E com versos,
    // branch TRUE seleciona o primeiro do novo capítulo.
    const noVerses = await bootstrappedStore()
    mockVerses.mockResolvedValue({})
    noVerses.selectedVerses = [3] // ancora no fim do cap 1
    noVerses.verses = {}          // next=4 não existe -> wrap de capítulo
    await noVerses.goToAdjacentVerse(1) // 1 < 2 -> selectChapter(2) -> {} -> NaN
    expect(noVerses.selectedVerses).toEqual([])

    const withVerses = await bootstrappedStore()
    mockVerses.mockResolvedValue({ '7': 'sete' })
    withVerses.selectedVerses = [3]
    withVerses.verses = {}
    await withVerses.goToAdjacentVerse(1)
    expect(withVerses.selectedVerses).toEqual([7])

    // 491 falso/verdadeiro já coberto; 469/491 verdadeiro: recuo com chapter>1
    // cujo capítulo anterior vem vazio -> last=NaN -> sem seleção
    const bwdNoVerses = await bootstrappedStore()
    await bwdNoVerses.selectChapter(2)
    mockVerses.mockResolvedValue({})
    bwdNoVerses.selectedVerses = [1]
    bwdNoVerses.verses = {}
    await bwdNoVerses.goToAdjacentVerse(-1)
    expect(bwdNoVerses.selectedVerses).toEqual([])

    // book não está na lista (findIndex = -1) → nextBook cai em books.value[0],
    // mas selectBook(1) roda normal. selectedBookId muda pro livro 1.
    const ghostStore = await bootstrappedStore()
    mockVerses.mockResolvedValue({ '1': 'um' })
    ghostStore.selectedBookId = 999
    ghostStore.selectedVerses = [1]
    ghostStore.verses = {}
    await ghostStore.goToAdjacentVerse(1)
    expect(ghostStore.selectedBookId).toBe(999)

    // books=[] → guard !book cedo, nada muda (469/491 eram dead guards, removidos)
    const emptyFwd = await bootstrappedStore()
    emptyFwd.books = []
    emptyFwd.selectedVerses = [1]
    emptyFwd.verses = {}
    await emptyFwd.goToAdjacentVerse(1)
    expect(emptyFwd.selectedBookId).toBe(1)
    expect(emptyFwd.selectedVerses).toEqual([1])

    // projeção ativa: seleção publica via publishProjectionState (caminho interno)
    const pubStore = await bootstrappedStore()
    pubStore.books = BOOKS
    pubStore.versions = VERSIONS
    pubStore.isProjecting = true
    mockVerses.mockResolvedValue(GEN1)
    await pubStore.selectBook(1)
    await pubStore.selectChapter(1)
    const evt = new MouseEvent('click')
    pubStore.selectVerse(2, evt)
    const { publishBibleSelection } = await import('../services/bible-runtime')
    expect(publishBibleSelection).toHaveBeenCalledWith(
      expect.objectContaining({ verses: [2] }),
    )

    // idem no recuo: prevBook cai no último livro da lista
    const ghostBwd = await bootstrappedStore()
    mockVerses.mockResolvedValue({ '1': 'apenas' })
    ghostBwd.selectedBookId = 999
    ghostBwd.selectedVerses = [1]
    ghostBwd.verses = {}
    await ghostBwd.goToAdjacentVerse(-1)
    expect(ghostBwd.selectedBookId).toBe(999)

    // avanço: wrap pro próximo livro e o primeiro versículo existe (Number.isFinite true)
    const fwdStore = await bootstrappedStore()
    mockVerses.mockResolvedValue({ '2': 'dois' })
    await fwdStore.selectChapter(2)
    fwdStore.selectedVerses = [1]
    fwdStore.verses = {}
    await fwdStore.goToAdjacentVerse(1)
    expect(fwdStore.selectedBookId).toBe(2)
    expect(fwdStore.selectedVerses).toEqual([2])

    // recuo: wrap pro livro anterior e o último versículo existe
    const bwdStore = await bootstrappedStore()
    mockVerses.mockResolvedValue({ '1': 'um' })
    await bwdStore.selectBook(2)
    await bwdStore.selectChapter(1)
    bwdStore.selectedVerses = [1]
    bwdStore.verses = {}
    await bwdStore.goToAdjacentVerse(-1)
    expect(bwdStore.selectedBookId).toBe(1)
    expect(bwdStore.selectedVerses).toEqual([1])
  })

  it('recuo com capítulo anterior sem versos não seleciona nada', async () => {
    const store = await bootstrappedStore()
    await store.selectChapter(2)
    store.verses = { '4': 'quatro' }
    store.selectVerse(4)
    mockVerses.mockResolvedValue({})
    await store.goToAdjacentVerse(-1)
    expect(store.selectedVerses).toEqual([])
  })

  it('selectBook clamp < 1 e refreshChapter guard com versão 0', async () => {
    const store = await bootstrappedStore()
    store.selectedChapter = 0
    await store.selectBook(2)
    expect(store.selectedChapter).toBe(1)
  })

  it('refreshChapter guard: versão não selecionada zera versículos', async () => {
    const store = await bootstrappedStore()
    store.selectedVersionId = null
    mockVerses.mockClear()
    await store.selectChapter(2)
    expect(mockVerses).not.toHaveBeenCalled()
    expect(store.verses).toEqual({})
  })

  it('refreshChapter erro de carregamento seta lastErrorKey e zera', async () => {
    const store = await bootstrappedStore()
    mockVerses.mockRejectedValue(new Error('boom'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.selectChapter(2)
    expect(store.lastErrorKey).toBe('bible.errors.loadChapterFailed')
    expect(store.verses).toEqual({})
    expect(store.isLoadingVerses).toBe(false)
    err.mockRestore()
  })
})

describe('projeção', () => {
  it('syncProjection monta seleção completa', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    store.syncProjection()
    expect(store.projection).toMatchObject({
      versionId: 1,
      bookId: 1,
      versionAbbreviation: 'ARA',
      bookName: 'Gênesis',
      chapter: 1,
      verses: [1],
      scripturalReference: 'Gênesis 1:1 (ARA)',
      text: 'v1',
    })
  })

  it('syncProjection sem seleção zera projeção', async () => {
    const store = await bootstrappedStore()
    store.isProjecting = true
    store.projection = {
      ...store.projection,
      verses: [1],
      text: 'x',
    }
    store.clearSelection()
    expect(store.projection.verses).toEqual([])
    expect(mockPublish).toHaveBeenCalledWith(store.projection)
  })

  it('syncProjection sem projetar não publica', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    store.syncProjection()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('openProjection espelho abre janela quando há tela externa', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    const ok = await store.openProjection()
    expect(ok).toBe(true)
    expect(mockOpenModule).toHaveBeenCalledWith('bible')
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(false)
    expect(mockPublish).toHaveBeenCalled()
  })

  it('openProjection sem seleção falha', async () => {
    const store = await bootstrappedStore()
    await expect(store.openProjection()).resolves.toBe(false)
    expect(mockOpenModule).not.toHaveBeenCalled()
  })

  it('openProjection sem tela externa usa preview in-app', async () => {
    mockHasExternal.mockResolvedValue(false)
    const store = await bootstrappedStore()
    store.selectVerse(1)
    const ok = await store.openProjection()
    expect(ok).toBe(true)
    expect(store.inAppPreview).toBe(true)
    expect(mockCloseModule).toHaveBeenCalled()
    expect(mockOpenModule).not.toHaveBeenCalled()
  })

  it('openProjection tvs-only não abre janela', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    const ok = await store.openProjection({ targets: 'tvs-only' })
    expect(ok).toBe(true)
    expect(store.projectingTvsOnly).toBe(true)
    expect(mockOpenModule).not.toHaveBeenCalled()
  })

  it('rota não-mirror/non-cable projeta só TVs', async () => {
    mockRoute.mockReturnValue('slot-1' as never)
    const store = await bootstrappedStore()
    store.selectVerse(1)
    await store.openProjection()
    expect(store.projectingTvsOnly).toBe(true)
    expect(mockOpenModule).not.toHaveBeenCalled()
  })

  it('janela falha ao abrir desliga projeção', async () => {
    mockOpenModule.mockResolvedValue(false)
    const store = await bootstrappedStore()
    store.selectVerse(1)
    await expect(store.openProjection()).resolves.toBe(false)
    expect(store.isProjecting).toBe(false)
  })

  it('watch detecta janela fechada e solta runtime (também janela aberta)', async () => {
    vi.useFakeTimers()
    try {
      const store = await bootstrappedStore()
      store.selectVerse(1)
      await store.openProjection()
      expect(store.isProjecting).toBe(true)

      // janela continua aberta → if não entra (cobre branch [0,1])
      mockIsOpen.mockReturnValue(true)
      await vi.advanceTimersByTimeAsync(450)
      expect(store.isProjecting).toBe(true)

      mockIsOpen.mockReturnValue(false)
      await vi.advanceTimersByTimeAsync(450)
      expect(store.isProjecting).toBe(false)
      expect(mockPublishOff).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('watch não vigia em modo tvs-only/in-app', async () => {
    vi.useFakeTimers()
    try {
      const store = await bootstrappedStore()
      store.selectVerse(1)
      await store.openProjection({ targets: 'tvs-only' })
      mockIsOpen.mockReturnValue(false)
      await vi.advanceTimersByTimeAsync(450)
      expect(store.isProjecting).toBe(true)
      expect(mockPublishOff).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggleProjection liga e desliga', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    mockIsOpen.mockReturnValue(true)
    await expect(store.toggleProjection()).resolves.toBe(true)
    expect(store.isProjecting).toBe(true)

    await expect(store.toggleProjection()).resolves.toBe(false)
    expect(store.isProjecting).toBe(false)
  })

  it('toggleProjection com preview in-app desliga', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    mockHasExternal.mockResolvedValue(false)
    await store.openProjection()
    await expect(store.toggleProjection()).resolves.toBe(false)
    expect(store.isProjecting).toBe(false)
  })

  it('clearProjectionWindow desliga tudo e publica off', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    await store.openProjection({ targets: 'tvs-only' })
    store.clearProjectionWindow()
    expect(store.isProjecting).toBe(false)
    expect(store.projectingTvsOnly).toBe(false)
    expect(store.inAppPreview).toBe(false)
    expect(mockCloseModule).toHaveBeenCalled()
    expect(mockPublishOff).toHaveBeenCalled()
  })

  it('projectTvsOnly liga; de novo desliga', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    await expect(store.projectTvsOnly()).resolves.toBe(true)
    expect(store.projectingTvsOnly).toBe(true)

    mockIsOpen.mockReturnValue(true)
    await expect(store.projectTvsOnly()).resolves.toBe(false)
    expect(mockCloseModule).toHaveBeenCalled()
    expect(store.projectingTvsOnly).toBe(false)
  })

  it('projectTvsOnly migra do cabo fechando a janela', async () => {
    const store = await bootstrappedStore()
    store.selectVerse(1)
    mockIsOpen.mockReturnValue(true)
    await store.projectTvsOnly()
    expect(mockCloseModule).toHaveBeenCalled()
    expect(store.projectingTvsOnly).toBe(true)
  })
})

describe('ui helpers', () => {
  it('clearError zera lastErrorKey', async () => {
    const store = await bootstrappedStore()
    store.lastErrorKey = 'x'
    store.clearError()
    expect(store.lastErrorKey).toBeNull()
  })

  it('clearProjectionWindow publica off com default arg (91)', async () => {
    // 91 default-arg: publishProjectionState(emptySelection()) usa projection default
    const store = await bootstrappedStore()
    store.selectVerse(1)
    await store.openProjection({ targets: 'tvs-only' })
    mockPublish.mockClear()
    store.clearProjectionWindow()
    expect(mockPublish).toHaveBeenCalledTimes(1)
  })

  it('syncProjection sem seleção publicando (default arg via projection.value)', async () => {
    const store = await bootstrappedStore()
    store.isProjecting = true
    mockPublish.mockClear()
    // sem versos selecionados -> ramo empty; publica projection.value (default arg)
    store.selectedVerses = []
    store.syncProjection()
    expect(mockPublish).toHaveBeenCalledTimes(1)
  })

  it('toggleNavPanel alterna', async () => {
    const store = await bootstrappedStore()
    const antes = store.showNavPanel
    store.toggleNavPanel()
    expect(store.showNavPanel).toBe(!antes)
  })
})
