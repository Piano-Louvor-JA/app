// @vitest-environment jsdom
// BibleBookGrid — search input, testament tabs, book tiles, select
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import BibleBookGrid from '../BibleBookGrid.vue'
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
      },
    },
  },
})

const books: BibleBook[] = [
  { id: 1, bookNumber: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50 },
  { id: 2, bookNumber: 2, name: 'Êxodo', abbreviation: 'Ex', chapters: 40 },
  { id: 40, bookNumber: 40, name: 'Mateus', abbreviation: 'Mt', chapters: 28 },
]

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(BibleBookGrid, {
    props: { books, selectedBookId: null, testament: 'ot', searchQuery: '', ...props },
    global: { plugins: [i18n] },
  })
}

describe('BibleBookGrid', () => {
  it('renderiza busca, título e tabs', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.bible-books__search-input').exists()).toBe(true)
    expect(wrapper.find('.bible-books__title').text()).toBe('Livros')
    expect(wrapper.findAll('.bible-books__tab').length).toBe(2)
  })

  it('renderiza tiles com abbr e nome', () => {
    const wrapper = createWrapper()
    const tiles = wrapper.findAll('.bible-books__tile')
    expect(tiles.length).toBe(3)
    expect(tiles[0].find('.bible-books__abbr').text()).toBe('Gn')
    expect(tiles[0].find('.bible-books__name').text()).toBe('Gênesis')
  })

  it('tile ativo: classe --active no selecionado', () => {
    const wrapper = createWrapper({ selectedBookId: 2 })
    const tiles = wrapper.findAll('.bible-books__tile')
    expect(tiles[1].classes()).toContain('bible-books__tile--active')
    expect(tiles[0].classes()).not.toContain('bible-books__tile--active')
  })

  it('tile tem id bible-book-<id>', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('#bible-book-1').exists()).toBe(true)
    expect(wrapper.find('#bible-book-40').exists()).toBe(true)
  })

  it('tile com tone por bookNumber', () => {
    const wrapper = createWrapper()
    const tiles = wrapper.findAll('.bible-books__tile')
    expect(tiles[0].classes().some((c) => c.startsWith('bible-books__tile--') && c !== 'bible-books__tile--active')).toBe(true)
  })

  it('digitar busca emite update:searchQuery', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-books__search-input').setValue('salmos')
    expect(wrapper.emitted('update:searchQuery')).toBeTruthy()
    expect(wrapper.emitted('update:searchQuery')![0]).toEqual(['salmos'])
  })

  it('tab OT emite update:testament ot', async () => {
    const wrapper = createWrapper({ testament: 'nt' })
    const tabs = wrapper.findAll('.bible-books__tab')
    await tabs[0].trigger('click')
    expect(wrapper.emitted('update:testament')![0]).toEqual(['ot'])
  })

  it('tab NT emite update:testament nt', async () => {
    const wrapper = createWrapper({ testament: 'ot' })
    const tabs = wrapper.findAll('.bible-books__tab')
    await tabs[1].trigger('click')
    expect(wrapper.emitted('update:testament')![0]).toEqual(['nt'])
  })

  it('tab ativa: classe --active conforme testament', () => {
    const otWrapper = createWrapper({ testament: 'ot' })
    const otTabs = otWrapper.findAll('.bible-books__tab')
    expect(otTabs[0].classes()).toContain('bible-books__tab--active')

    const ntWrapper = createWrapper({ testament: 'nt' })
    const ntTabs = ntWrapper.findAll('.bible-books__tab')
    expect(ntTabs[1].classes()).toContain('bible-books__tab--active')
  })

  it('clicar tile emite selectBook com id', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#bible-book-40').trigger('click')
    expect(wrapper.emitted('selectBook')).toBeTruthy()
    expect(wrapper.emitted('selectBook')![0]).toEqual([40])
  })

  it('lista vazia: grid sem tiles', () => {
    const wrapper = createWrapper({ books: [] })
    expect(wrapper.findAll('.bible-books__tile').length).toBe(0)
  })
})
