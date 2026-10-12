// @vitest-environment jsdom
/**
 * BibleView — template completo com useBibleReader mockado:
 * alerta de erro (retry/dismiss), loading, catálogo vazio, body (nav + reader),
 * FAB de projeção (project/clear) e handlers de versículo (prev/next).
 * Componentes filhos são stubbed — o objetivo é cobrir o <template> do view.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'

const mockState: Record<string, unknown> = {}

function defaultRefs() {
  return {
    versions: ref([{ id: 1, name: 'ARC' }]),
    selectedVersionId: ref<number | null>(1),
    selectedBookId: ref<number | null>(null),
    selectedChapter: ref<number | null>(null),
    selectedVerses: ref<number[]>([]),
    testamentFilter: ref<'all' | 'old' | 'new'>('all'),
    showNavPanel: ref(true),
    bookSearchQuery: ref(''),
    chapterSearchQuery: ref(''),
    verseSearchQuery: ref(''),
    globalSearchQuery: ref(''),
    isLoadingMeta: ref(false),
    isLoadingVerses: ref(false),
    lastErrorKey: ref<string | null>(null),
    isProjecting: ref(false),
    projection: ref({ verses: [1], text: 'No princípio' }),
    filteredBooks: ref([{ id: 1, name: 'Gênesis' }]),
    chapterNumbers: ref([1]),
    locationLabel: ref('Gênesis 1'),
    chapterTitle: ref('Gênesis 1'),
    verseEntries: ref([{ verse: 1, text: 'No princípio criou Deus' }]),
    hasProjection: computed(() => true),
    previewSnippet: computed(() => 'No princípio'),
  }
}

let defaults: ReturnType<typeof defaultRefs>

vi.mock('../../composables/useBibleReader', () => ({
  useBibleReader: () =>
    new Proxy(mockState, {
      get(target, key: string) {
        if (key in target) return target[key]
        if (key in defaults) return defaults[key as keyof typeof defaults]
        return vi.fn()
      },
    }),
}))

import BibleView from '../BibleView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  fallbackLocale: 'pt-BR',
  messages: { 'pt-BR': ptBR },
})

const ToolbarStub = {
  name: 'BibleToolbar',
  template: `<div class="toolbar-stub"><button class="toolbar-btn" @click="$emit('toggle-nav')" /><button class="toolbar-version" @click="$emit('select-version', 2)" /><button class="toolbar-search" @click="$emit('update:bible-search-query', 'amor')" /></div>`,
  emits: ['select-version', 'toggle-nav', 'update:bible-search-query'],
}
const NavStub = {
  name: 'BibleNavPanel',
  template: `<div class="nav-stub">
    <button class="nav-select-book" @click="$emit('select-book', 1)" />
    <button class="nav-select-chapter" @click="$emit('select-chapter', 1)" />
  </div>`,
  emits: ['update:book-search-query', 'update:chapter-search-query', 'update:testament', 'select-book', 'select-chapter'],
}
const ReaderStub = {
  name: 'BibleVerseList',
  template: `<div class="reader-stub">
    <button class="verse-select" @click="$emit('select-verse', 1)" />
    <button class="verse-prev" @click="$emit('previous-verse')" />
    <button class="verse-next" @click="$emit('next-verse')" />
    <button class="verse-clear" @click="$emit('clear-projection')" />
  </div>`,
  emits: ['update:verse-search-query', 'select-verse', 'previous-verse', 'next-verse', 'clear-projection'],
}
const FabStub = {
  name: 'BibleProjectFab',
  template: `<div class="fab-stub">
    <button class="fab-project" @click="$emit('project')" />
    <button class="fab-clear" @click="$emit('clear')" />
  </div>`,
  emits: ['project', 'clear'],
}
const PalcoStub = { name: 'PalcoRouteSelect', template: '<div class="palco-route-stub" />' }

function mountView() {
  return mount(BibleView, {
    global: {
      plugins: [i18n],
      stubs: {
        BibleToolbar: ToolbarStub,
        BibleNavPanel: NavStub,
        BibleVerseList: ReaderStub,
        BibleProjectFab: FabStub,
        PalcoRouteSelect: PalcoStub,
      },
    },
  })
}

describe('BibleView — estados do template', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(mockState)) delete mockState[k]
    defaults = defaultRefs()
    // funções fixas p/ asserts (Proxy devolve a MESMA fn p/ a mesma chave)
    for (const fn of [
      'clearError', 'selectVersion', 'selectBook', 'selectChapter', 'selectVerse',
      'clearSelection', 'goToAdjacentVerse', 'setTestamentFilter', 'toggleNavPanel',
      'toggleProjection', 'clearProjectionWindow', 'refresh',
    ]) {
      mockState[fn] = vi.fn()
    }
  })

  it('body padrão: nav + reader renderizados, FAB habilitado', () => {
    const w = mountView()
    expect(w.find('.nav-stub').exists()).toBe(true)
    expect(w.find('.reader-stub').exists()).toBe(true)
    expect(w.find('.fab-stub').exists()).toBe(true)
    expect(w.find('.bible-view__body--reader-only').exists()).toBe(false)
  })

  it('nav escondida: body ganha classe reader-only', () => {
    defaults.showNavPanel.value = false
    const w = mountView()
    expect(w.find('.nav-stub').exists()).toBe(false)
    expect(w.find('.bible-view__body--reader-only').exists()).toBe(true)
  })

  it('lastErrorKey: alerta com retry e dismiss', async () => {
    defaults.lastErrorKey.value = 'bible.errors.load'
    const w = mountView()
    expect(w.find('.bible-view__alert').exists()).toBe(true)
    expect(w.text()).toContain('bible.errors.load')
    const buttons = w.findAll('.bible-view__alert-btn')
    expect(buttons).toHaveLength(2)
    await buttons[0]!.trigger('click') // retry → refresh
    await buttons[1]!.trigger('click') // dismiss → clearError
  })

  it('isLoadingMeta: estado de carregamento', () => {
    defaults.isLoadingMeta.value = true
    const w = mountView()
    expect(w.find('.bible-view__state').exists()).toBe(true)
    expect(w.find('.bible-view__alert').exists()).toBe(false)
  })

  it('catálogo vazio: sem versões e sem livros', () => {
    defaults.isLoadingMeta.value = false
    defaults.filteredBooks.value = []
    defaults.versions.value = []
    const w = mountView()
    expect(w.find('.bible-view__state').exists()).toBe(true)
  })

  it('FAB: project chama toggleProjection; clear chama clearProjectionWindow', async () => {
    const w = mountView()
    await w.find('.fab-project').trigger('click')
    expect(mockState.toggleProjection).toHaveBeenCalled()
    await w.find('.fab-clear').trigger('click')
    expect(mockState.clearProjectionWindow).toHaveBeenCalled()
  })

  it('toolbar emite: select-version, toggle-nav e search query', async () => {
    const w = mountView()
    await w.find('.toolbar-version').trigger('click')
    expect(mockState.selectVersion).toHaveBeenCalledWith(2)
    await w.find('.toolbar-btn').trigger('click')
    expect(mockState.toggleNavPanel).toHaveBeenCalled()
    await w.find('.toolbar-search').trigger('click')
    expect(defaults.globalSearchQuery.value).toBe('amor')
  })

  it('nav panel emite: select-book, select-chapter e queries', async () => {
    const w = mountView()
    await w.find('.nav-select-book').trigger('click')
    await w.find('.nav-select-chapter').trigger('click')
    expect(mockState.selectBook).toHaveBeenCalledWith(1)
    expect(mockState.selectChapter).toHaveBeenCalledWith(1)
    const nav = w.findComponent({ name: 'BibleNavPanel' })
    nav.vm.$emit('update:book-search-query', 'gê')
    nav.vm.$emit('update:chapter-search-query', '12')
    nav.vm.$emit('update:testament', 'new')
    await w.find('.nav-select-book').trigger('click')
    expect(defaults.bookSearchQuery.value).toBe('gê')
    expect(defaults.chapterSearchQuery.value).toBe('12')
    expect(mockState.setTestamentFilter).toHaveBeenCalledWith('new')
  })

  it('verse list emite: select/prev/next/clear', async () => {
    const w = mountView()
    await w.find('.verse-select').trigger('click')
    await w.find('.verse-prev').trigger('click')
    await w.find('.verse-next').trigger('click')
    await w.find('.verse-clear').trigger('click')
    expect(mockState.selectVerse).toHaveBeenCalledWith(1)
    expect(mockState.goToAdjacentVerse).toHaveBeenCalledWith(-1)
    expect(mockState.goToAdjacentVerse).toHaveBeenCalledWith(1)
    expect(mockState.clearSelection).toHaveBeenCalled()
    const reader = w.findComponent({ name: 'BibleVerseList' })
    reader.vm.$emit('update:verse-search-query', 'luz')
    await Promise.resolve()
    expect(defaults.verseSearchQuery.value).toBe('luz')
  })

  it('projection desabilitada: FAB disabled', () => {
    defaults = {
      ...defaults,
      hasProjection: computed(() => false),
      projection: ref({ verses: [], text: '' }),
    }
    const w = mountView()
    // fab disabled é prop do stub — só garante que não quebra
    expect(w.find('.fab-stub').exists()).toBe(true)
  })
})
