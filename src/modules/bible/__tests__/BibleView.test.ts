// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia, getActivePinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../settings/components/PalcoRouteSelect.vue', () => ({
  default: { name: 'PalcoRouteSelect', props: ['module'], template: '<div class="route-select-stub" />' },
}))

// componentes filhos stubados: o alvo é a orquestração da view
vi.mock('../components/BibleNavPanel.vue', () => ({
  default: {
    name: 'BibleNavPanel',
    props: ['books', 'selectedBookId', 'testament', 'bookSearchQuery', 'chapters', 'selectedChapter', 'chapterSearchQuery'],
    template: '<div class="nav-panel-stub" />',
  },
}))
vi.mock('../components/BibleProjectFab.vue', () => ({
  default: {
    name: 'BibleProjectFab',
    props: ['disabled', 'projecting'],
    emits: ['project', 'clear'],
    template: '<div class="fab-stub" />',
  },
}))
vi.mock('../components/BibleToolbar.vue', () => ({
  default: {
    name: 'BibleToolbar',
    props: ['versions', 'selectedVersionId', 'locationLabel', 'showNavPanel', 'bibleSearchQuery', 'versionsDisabled'],
    emits: ['selectVersion', 'toggleNav', 'update:bibleSearchQuery'],
    template: '<div class="toolbar-stub" />',
  },
}))
vi.mock('../components/BibleVerseList.vue', () => ({
  default: {
    name: 'BibleVerseList',
    props: ['chapterTitle', 'verses', 'selectedVerses', 'verseSearchQuery', 'isLoading', 'projection', 'previewSnippet', 'hasProjection'],
    emits: ['update:verseSearchQuery', 'selectVerse', 'previousVerse', 'nextVerse', 'clearProjection'],
    template: '<div class="verse-list-stub" />',
  },
}))

// store real com catálogo mockado
vi.mock('../services/bible-catalog', () => ({
  loadBibleBooks: vi.fn().mockResolvedValue([
    { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 2, bookNumber: 1, languageId: 'pt' },
  ]),
  loadBibleVersions: vi.fn().mockResolvedValue([
    { id: 1, abbreviation: 'ARA', name: 'ARA', languageId: 'pt' },
  ]),
  loadChapterVerses: vi.fn().mockResolvedValue({ '1': 'v1', '2': 'v2' }),
  pickDefaultVersionId: vi.fn((v: { id: number }[]) => v[0].id),
  resolveTestament: vi.fn(() => 'ot'),
}))
vi.mock('../services/bible-runtime', () => ({
  publishBibleSelection: vi.fn(),
  publishBibleRuntimeOff: vi.fn(),
}))
vi.mock('@shared/composables/useProjectionWindow', () => ({
  openProjectionModule: vi.fn().mockResolvedValue(true),
  closeProjectionModule: vi.fn(),
  isProjectionModuleOpen: vi.fn(() => false),
  hasSelectedExtendedProjectionTargets: vi.fn().mockResolvedValue(true),
}))
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(() => null),
  setUserPreference: vi.fn(),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  getPalcoRoute: vi.fn(() => 'mirror'),
}))

import BibleView from '../views/BibleView.vue'
import { useBibleStore } from '../stores/useBibleStore'

describe('BibleView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function mountView() {
    const wrapper = mount(BibleView, { global: { plugins: [getActivePinia()!] } })
    await flushPromises()
    return wrapper
  }

  it('estado carregado: corpo com nav panel + verse list; fab com projeção', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.route-select-stub').exists()).toBe(true)
    expect(wrapper.find('.toolbar-stub').exists()).toBe(true)
    expect(wrapper.find('.nav-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.verse-list-stub').exists()).toBe(true)
    expect(wrapper.find('.fab-stub').exists()).toBe(true)

    const store = useBibleStore()
    await store.bootstrap()
    await flushPromises()
    expect(store.books.length).toBe(1)
  })

  it('carregando meta: estado de loading; catálogo vazio: emptyCatalog', async () => {
    const store = useBibleStore()
    vi.spyOn(store, 'bootstrap').mockResolvedValue(undefined)
    store.isLoadingMeta = true
    let wrapper = await mountView()
    expect(wrapper.text()).toContain('bible.loading')
    wrapper.unmount()

    store.isLoadingMeta = false
    store.books = []
    store.versions = []
    wrapper = await mountView()
    expect(wrapper.text()).toContain('bible.emptyCatalog')
    wrapper.unmount()
  })

  it('erro: alerta com retry e dismiss', async () => {
    const store = useBibleStore()
    const refreshSpy = vi.spyOn(store, 'bootstrap').mockResolvedValue(undefined)
    const clearSpy = vi.spyOn(store, 'clearError')
    store.lastErrorKey = 'bible.loadFailed'

    const wrapper = await mountView()
    expect(wrapper.text()).toContain('bible.loadFailed')

    const btns = wrapper.findAll('.bible-view__alert-btn')
    await btns[0].trigger('click')
    expect(refreshSpy).toHaveBeenCalled()
    await btns[1].trigger('click')
    expect(clearSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('nav panel fechado: classe reader-only e sem nav', async () => {
    const store = useBibleStore()
    vi.spyOn(store, 'bootstrap').mockResolvedValue(undefined)
    store.books = [{ id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 2, bookNumber: 1, languageId: 'pt' }]
    store.versions = [{ id: 1, abbreviation: 'ARA', name: 'ARA', languageId: 'pt' }]
    store.showNavPanel = false
    const wrapper = await mountView()
    expect(wrapper.find('.nav-panel-stub').exists()).toBe(false)
    expect(wrapper.find('.bible-view__body--reader-only').exists()).toBe(true)
    wrapper.unmount()
  })

  it('eventos: fab project/clear, verse prev/next', async () => {
    const store = useBibleStore()
    vi.spyOn(store, 'bootstrap').mockResolvedValue(undefined)
    store.books = [{ id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 2, bookNumber: 1, languageId: 'pt' }]
    store.versions = [{ id: 1, abbreviation: 'ARA', name: 'ARA', languageId: 'pt' }]
    const projSpy = vi.spyOn(store, 'toggleProjection').mockResolvedValue(undefined)
    const clearWinSpy = vi.spyOn(store, 'clearProjectionWindow')
    const navSpy = vi.spyOn(store, 'goToAdjacentVerse').mockResolvedValue(undefined)
    const clearSpy = vi.spyOn(store, 'clearSelection')

    const wrapper = await mountView()
    const fab = wrapper.findComponent({ name: 'BibleProjectFab' })
    fab.vm.$emit('project')
    await flushPromises()
    expect(projSpy).toHaveBeenCalledTimes(1)

    fab.vm.$emit('clear')
    await flushPromises()
    expect(clearWinSpy).toHaveBeenCalledTimes(1)

    const list = wrapper.findComponent({ name: 'BibleVerseList' })
    list.vm.$emit('previousVerse')
    list.vm.$emit('nextVerse')
    await flushPromises()
    expect(navSpy).toHaveBeenNthCalledWith(1, -1)
    expect(navSpy).toHaveBeenNthCalledWith(2, 1)

    list.vm.$emit('clearProjection')
    await flushPromises()
    expect(clearSpy).toHaveBeenCalledTimes(1)

    list.vm.$emit('update:verseSearchQuery', '3')
    await flushPromises()
    expect(store.verseSearchQuery).toBe('3')

    // selectVerse precisa do versículo carregado no capítulo e evento com ctrl p/ multi
    store.verses = { '1': 'No princípio', '2': 'criou Deus' }
    const evt = new MouseEvent('click', { ctrlKey: true })
    list.vm.$emit('selectVerse', 1, evt)
    await flushPromises()
    expect(store.selectedVerses).toContain(1)
  })

  it('eventos: toolbar toggleNav/selectVersion/search e nav panel binds', async () => {
    const store = useBibleStore()
    vi.spyOn(store, 'bootstrap').mockResolvedValue(undefined)
    store.books = [{ id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 2, bookNumber: 1, languageId: 'pt' }]
    store.versions = [{ id: 1, abbreviation: 'ARA', name: 'ARA', languageId: 'pt' }]
    const wrapper = await mountView()

    const toolbar = wrapper.findComponent({ name: 'BibleToolbar' })
    toolbar.vm.$emit('toggleNav')
    toolbar.vm.$emit('selectVersion', 9)
    toolbar.vm.$emit('update:bibleSearchQuery', 'fe')
    await flushPromises()
    expect(store.showNavPanel).toBe(false)
    expect(store.selectedVersionId).toBe(9)
    expect(store.globalSearchQuery).toBe('fe')

    store.showNavPanel = true
    await flushPromises()
    const nav = wrapper.findComponent({ name: 'BibleNavPanel' })
    nav.vm.$emit('selectBook', 1)
    nav.vm.$emit('selectChapter', 2)
    nav.vm.$emit('update:testament', 'nt')
    nav.vm.$emit('update:bookSearchQuery', 'gn')
    nav.vm.$emit('update:chapterSearchQuery', '2')
    await flushPromises()
    expect(store.selectedBookId).toBe(1)
    expect(store.selectedChapter).toBe(2)
    expect(store.testamentFilter).toBe('nt')
    expect(store.bookSearchQuery).toBe('gn')
    expect(store.chapterSearchQuery).toBe('2')
  })
})
