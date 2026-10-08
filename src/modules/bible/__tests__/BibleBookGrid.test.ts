// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../services/bible-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bible-catalog')>()
  return { ...actual, resolveBookTone: vi.fn(() => 'law') }
})

import BibleBookGrid from '../components/BibleBookGrid.vue'
import type { BibleBook } from '../types/bible'

const book = (id: number, abbr = 'Gn'): BibleBook => ({
  id,
  name: `Livro ${id}`,
  abbreviation: abbr,
  chapters: 3,
  bookNumber: id,
  languageId: 'pt',
})

function mountGrid(props: Partial<{ books: BibleBook[]; selectedBookId: number | null; testament: 'ot' | 'nt'; searchQuery: string }> = {}) {
  return mount(BibleBookGrid, {
    props: {
      books: [book(1), book(2, 'Êx')],
      selectedBookId: null,
      testament: 'ot',
      searchQuery: '',
      ...props,
    },
  })
}

describe('BibleBookGrid', () => {
  it('renderiza busca, tabs e tiles dos livros', () => {
    const wrapper = mountGrid({ selectedBookId: 1 })
    expect(wrapper.find('input[type="search"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)
    const tiles = wrapper.findAll('.bible-books__tile')
    expect(tiles).toHaveLength(2)
    // tile ativo
    expect(tiles[0].classes()).toContain('bible-books__tile--active')
    expect(tiles[1].classes()).not.toContain('bible-books__tile--active')
  })

  it('digitar na busca emite update:searchQuery', async () => {
    const wrapper = mountGrid()
    await wrapper.find('input[type="search"]').setValue('gene')
    expect(wrapper.emitted('update:searchQuery')?.[0]).toEqual(['gene'])
  })

  it('clicar nas tabs emite update:testament', async () => {
    const wrapper = mountGrid()
    const tabs = wrapper.findAll('[role="tab"]')
    await tabs[0].trigger('click')
    await tabs[1].trigger('click')
    expect(wrapper.emitted('update:testament')).toEqual([['ot'], ['nt']])
  })

  it('clicar num tile emite selectBook com o id', async () => {
    const wrapper = mountGrid()
    await wrapper.findAll('.bible-books__tile')[1].trigger('click')
    expect(wrapper.emitted('selectBook')?.[0]).toEqual([2])
  })
})
