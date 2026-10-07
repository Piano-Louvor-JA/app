// @vitest-environment jsdom
// BibleNavPanel — repasse de eventos book grid + chapter grid
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

import BibleNavPanel from '../BibleNavPanel.vue'
import type { BibleBook } from '../types/bible'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      bible: {
        searchBook: 'Buscar livro',
        books: 'Livros',
        testamentOld: 'Antigo',
        testamentNew: 'Novo',
        searchChapter: 'Buscar capítulo',
        chapters: 'Capítulos',
      },
    },
  },
})

const books: BibleBook[] = [
  { id: 1, bookNumber: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50 },
]

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(BibleNavPanel, {
    props: {
      books,
      selectedBookId: null,
      testament: 'ot',
      bookSearchQuery: '',
      chapters: [1, 2, 3],
      selectedChapter: 1,
      chapterSearchQuery: '',
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

describe('BibleNavPanel', () => {
  it('renderiza grids de livros e capítulos', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.bible-books').exists()).toBe(true)
    expect(wrapper.find('.bible-chapters').exists()).toBe(true)
    expect(wrapper.findAll('.bible-books__tile').length).toBe(1)
    expect(wrapper.findAll('.bible-chapters__btn').length).toBe(3)
  })

  it('digitar busca de livro repassa update:bookSearchQuery', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-books__search-input').setValue('gên')
    expect(wrapper.emitted('update:bookSearchQuery')![0]).toEqual(['gên'])
  })

  it('digitar busca de capítulo repassa update:chapterSearchQuery', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-chapters__search-input').setValue('2')
    expect(wrapper.emitted('update:chapterSearchQuery')![0]).toEqual(['2'])
  })

  it('tab testament repassa update:testament', async () => {
    const wrapper = createWrapper()
    const tabs = wrapper.findAll('.bible-books__tab')
    await tabs[1].trigger('click')
    expect(wrapper.emitted('update:testament')![0]).toEqual(['nt'])
  })

  it('clicar livro repassa selectBook', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-books__tile').trigger('click')
    expect(wrapper.emitted('selectBook')![0]).toEqual([1])
  })

  it('clicar capítulo repassa selectChapter', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#bible-chapter-2').trigger('click')
    expect(wrapper.emitted('selectChapter')![0]).toEqual([2])
  })

  it('divider presente entre grids', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.bible-nav-panel__divider').exists()).toBe(true)
  })
})
