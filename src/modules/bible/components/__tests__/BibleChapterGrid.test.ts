// @vitest-environment jsdom
// BibleChapterGrid — search, capítulos renderizados, select, ativo
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import BibleChapterGrid from '../BibleChapterGrid.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      bible: { searchChapter: 'Buscar capítulo', chapters: 'Capítulos' },
    },
  },
})

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(BibleChapterGrid, {
    props: { chapters: [1, 2, 3], selectedChapter: 1, searchQuery: '', ...props },
    global: { plugins: [i18n] },
  })
}

describe('BibleChapterGrid', () => {
  it('renderiza busca e título', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.bible-chapters__search-input').exists()).toBe(true)
    expect(wrapper.find('.bible-chapters__title').text()).toBe('Capítulos')
  })

  it('renderiza um botão por capítulo', () => {
    const wrapper = createWrapper({ chapters: [1, 2, 3, 4, 5] })
    expect(wrapper.findAll('.bible-chapters__btn').length).toBe(5)
  })

  it('capítulo ativo: classe --active', () => {
    const wrapper = createWrapper({ selectedChapter: 2 })
    const btns = wrapper.findAll('.bible-chapters__btn')
    expect(btns[1].classes()).toContain('bible-chapters__btn--active')
    expect(btns[0].classes()).not.toContain('bible-chapters__btn--active')
  })

  it('botão tem id bible-chapter-<n>', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('#bible-chapter-3').exists()).toBe(true)
  })

  it('digitar busca emite update:searchQuery', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-chapters__search-input').setValue('12')
    expect(wrapper.emitted('update:searchQuery')![0]).toEqual(['12'])
  })

  it('clicar capítulo emite selectChapter', async () => {
    const wrapper = createWrapper()
    await wrapper.find('#bible-chapter-3').trigger('click')
    expect(wrapper.emitted('selectChapter')![0]).toEqual([3])
  })

  it('lista vazia: sem botões', () => {
    const wrapper = createWrapper({ chapters: [] })
    expect(wrapper.findAll('.bible-chapters__btn').length).toBe(0)
  })
})
