// @vitest-environment jsdom
// BibleVerseList — nav, search, copy feedback, loading/empty, verses, preview
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: vi.fn(() => ({
    backgroundColor: '#101010',
    backgroundImage: null,
  })),
}))

vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: vi.fn(() => null),
}))

import BibleVerseList from '../BibleVerseList.vue'
import type { BibleSelection } from '../types/bible'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      bible: {
        title: 'Bíblia',
        previousVerse: 'Anterior',
        nextVerse: 'Próxima',
        clearProjection: 'Limpar projeção',
        searchVerse: 'Buscar versículo',
        copy: 'Copiar',
        copied: 'Copiado!',
        copyFailed: 'Falha ao copiar',
        loading: 'Carregando...',
        emptyChapter: 'Capítulo vazio',
      },
    },
  },
})

const projection: BibleSelection = {
  versionId: 1,
  bookId: 1,
  bookName: 'Gênesis',
  chapter: 1,
  verseStart: 1,
  verseEnd: 1,
  verses: [{ number: 1, text: 'No princípio...' }],
  text: 'No princípio...',
  scripturalReference: 'Gn 1:1',
}

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(BibleVerseList, {
    props: {
      chapterTitle: 'Gênesis 1',
      verses: [
        { number: 1, text: 'No princípio criou Deus os céus.' },
        { number: 2, text: 'E a terra era sem forma.' },
      ],
      selectedVerses: [],
      verseSearchQuery: '',
      isLoading: false,
      projection,
      previewSnippet: 'No princípio...',
      hasProjection: false,
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

describe('BibleVerseList', () => {
  let timeoutSpy: ReturnType<typeof vi.spyOn> | null = null

  afterEach(() => {
    timeoutSpy?.mockRestore()
    timeoutSpy = null
    vi.restoreAllMocks()
  })

  it('renderiza título do capítulo', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.bible-reader__title').text()).toBe('Gênesis 1')
  })

  it('título vazio: fallback t(bible.title)', () => {
    const wrapper = createWrapper({ chapterTitle: '' })
    expect(wrapper.find('.bible-reader__title').text()).toBe('Bíblia')
  })

  it('nav desabilitada sem seleção', () => {
    const wrapper = createWrapper({ selectedVerses: [] })
    const btns = wrapper.findAll('.bible-reader__circle-btn')
    expect((btns[0].element as HTMLButtonElement).disabled).toBe(true)
    expect((btns[1].element as HTMLButtonElement).disabled).toBe(true)
  })

  it('nav habilitada com seleção; cliques emitem previous/next', async () => {
    const wrapper = createWrapper({ selectedVerses: [1] })
    const btns = wrapper.findAll('.bible-reader__circle-btn')
    expect((btns[0].element as HTMLButtonElement).disabled).toBe(false)
    await btns[0].trigger('click')
    expect(wrapper.emitted('previousVerse')).toBeTruthy()
    await btns[1].trigger('click')
    expect(wrapper.emitted('nextVerse')).toBeTruthy()
  })

  it('clear projection: desabilitado sem projeção, habilitado com', async () => {
    const off = createWrapper({ hasProjection: false })
    const offBtns = off.findAll('.bible-reader__circle-btn')
    expect((offBtns[2].element as HTMLButtonElement).disabled).toBe(true)

    const on = createWrapper({ hasProjection: true })
    const onBtns = on.findAll('.bible-reader__circle-btn')
    expect((onBtns[2].element as HTMLButtonElement).disabled).toBe(false)
    await onBtns[2].trigger('click')
    expect(on.emitted('clearProjection')).toBeTruthy()
  })

  it('digitar busca emite update:verseSearchQuery', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-reader__search-input').setValue('luz')
    expect(wrapper.emitted('update:verseSearchQuery')![0]).toEqual(['luz'])
  })

  it('renderiza versículos com num e texto', () => {
    const wrapper = createWrapper()
    const verses = wrapper.findAll('.bible-reader__verse')
    expect(verses.length).toBe(2)
    expect(verses[0].find('.bible-reader__verse-num').text()).toBe('1')
    expect(wrapper.find('#bible-verse-2 .bible-reader__verse-text').text()).toContain('sem forma')
  })

  it('versículo selecionado: classe --active', () => {
    const wrapper = createWrapper({ selectedVerses: [2] })
    const verses = wrapper.findAll('.bible-reader__verse')
    expect(verses[1].classes()).toContain('bible-reader__verse--active')
    expect(verses[0].classes()).not.toContain('bible-reader__verse--active')
  })

  it('clicar versículo emite selectVerse com número e evento', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#bible-verse-1').trigger('click')
    const emitted = wrapper.emitted('selectVerse')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe(1)
    expect(emitted![0][1]).toBeTruthy() // MouseEvent
  })

  it('isLoading: mostra estado loading', () => {
    const wrapper = createWrapper({ isLoading: true })
    expect(wrapper.text()).toContain('Carregando')
    expect(wrapper.findAll('.bible-reader__verse').length).toBe(0)
  })

  it('capítulo vazio: mostra estado vazio', () => {
    const wrapper = createWrapper({ verses: [] })
    expect(wrapper.text()).toContain('Capítulo vazio')
  })

  it('sem projeção: preview escondido', () => {
    const wrapper = createWrapper({ hasProjection: false })
    expect(wrapper.find('.bible-reader__preview').exists()).toBe(false)
  })

  it('com projeção: preview com snippet e referência', () => {
    const wrapper = createWrapper({ hasProjection: true })
    expect(wrapper.find('.bible-reader__preview-text').text()).toContain('No princípio')
    expect(wrapper.find('.bible-reader__preview-ref').text()).toBe('Gn 1:1')
  })

  it('copy: com projeção copia texto+ref, feedback copied, emite copy', async () => {
    timeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const wrapper = createWrapper({ hasProjection: true })
    await wrapper.find('.bible-reader__icon-btn').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('No princípio...\nGn 1:1')
    expect(wrapper.find('.bible-reader__feedback').text()).toBe('Copiado!')
    expect(wrapper.emitted('copy')).toBeTruthy()
  })

  it('copy: sem projeção copia todos os versículos', async () => {
    timeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const wrapper = createWrapper({ hasProjection: false })
    await wrapper.find('.bible-reader__icon-btn').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('1. No princípio criou Deus os céus.\n2. E a terra era sem forma.')
  })

  it('copy: falha no clipboard → feedback copyFailed', async () => {
    timeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>)
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })
    const wrapper = createWrapper()
    await wrapper.find('.bible-reader__icon-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.bible-reader__feedback').text()).toBe('Falha ao copiar')
    expect(wrapper.emitted('copy')).toBeTruthy()
  })
})
