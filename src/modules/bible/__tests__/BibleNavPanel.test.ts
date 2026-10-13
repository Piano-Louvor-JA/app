// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-stub"><slot /></div>' },
}))

vi.mock('../components/BibleBookGrid.vue', () => ({
  default: {
    name: 'BibleBookGrid',
    emits: ['update:searchQuery', 'update:testament', 'selectBook'],
    props: ['books', 'selectedBookId', 'testament', 'searchQuery'],
    template: '<div class="book-grid-stub" />',
  },
}))

vi.mock('../components/BibleChapterGrid.vue', () => ({
  default: {
    name: 'BibleChapterGrid',
    emits: ['update:searchQuery', 'selectChapter'],
    props: ['chapters', 'selectedChapter', 'searchQuery'],
    template: '<div class="chapter-grid-stub" />',
  },
}))

import BibleNavPanel from '../components/BibleNavPanel.vue'
import type { BibleBook } from '../types/bible'

const books: BibleBook[] = [
  { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 2, bookNumber: 1, languageId: 'pt' },
]

function mountPanel() {
  return mount(BibleNavPanel, {
    props: {
      books,
      selectedBookId: 1,
      testament: 'ot',
      bookSearchQuery: '',
      chapters: [1, 2],
      selectedChapter: 1,
      chapterSearchQuery: '',
    },
  })
}

describe('BibleNavPanel', () => {
  it('renderiza os dois grids filhos e o label acessível', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.book-grid-stub').exists()).toBe(true)
    expect(wrapper.find('.chapter-grid-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('bible.browseBooksAndChapters')
  })

  it('repassa eventos do grid de livros', async () => {
    const wrapper = mountPanel()
    const bookGrid = wrapper.findComponent({ name: 'BibleBookGrid' })
    bookGrid.vm.$emit('update:searchQuery', 'gn')
    bookGrid.vm.$emit('update:testament', 'nt')
    bookGrid.vm.$emit('selectBook', 7)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:bookSearchQuery')?.[0]).toEqual(['gn'])
    expect(wrapper.emitted('update:testament')?.[0]).toEqual(['nt'])
    expect(wrapper.emitted('selectBook')?.[0]).toEqual([7])
  })

  it('repassa eventos do grid de capítulos', async () => {
    const wrapper = mountPanel()
    const chapterGrid = wrapper.findComponent({ name: 'BibleChapterGrid' })
    chapterGrid.vm.$emit('update:searchQuery', '2')
    chapterGrid.vm.$emit('selectChapter', 2)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:chapterSearchQuery')?.[0]).toEqual(['2'])
    expect(wrapper.emitted('selectChapter')?.[0]).toEqual([2])
  })
})
