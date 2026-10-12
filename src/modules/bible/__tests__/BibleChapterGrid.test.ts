// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import BibleChapterGrid from '../components/BibleChapterGrid.vue'

function mountGrid(props: Partial<{ chapters: number[]; selectedChapter: number; searchQuery: string }> = {}) {
  return mount(BibleChapterGrid, {
    props: {
      chapters: [1, 2, 3],
      selectedChapter: 2,
      searchQuery: '',
      ...props,
    },
  })
}

describe('BibleChapterGrid', () => {
  it('renderiza busca, título e botões dos capítulos; ativo destacado', () => {
    const wrapper = mountGrid()
    expect(wrapper.find('input[type="search"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('bible.chapters')
    const btns = wrapper.findAll('.bible-chapters__btn')
    expect(btns).toHaveLength(3)
    expect(btns[1].classes()).toContain('bible-chapters__btn--active')
    expect(btns[0].classes()).not.toContain('bible-chapters__btn--active')
  })

  it('digitar na busca emite update:searchQuery', async () => {
    const wrapper = mountGrid()
    await wrapper.find('input[type="search"]').setValue('3')
    expect(wrapper.emitted('update:searchQuery')?.[0]).toEqual(['3'])
  })

  it('clicar num capítulo emite selectChapter', async () => {
    const wrapper = mountGrid()
    await wrapper.findAll('.bible-chapters__btn')[2].trigger('click')
    expect(wrapper.emitted('selectChapter')?.[0]).toEqual([3])
  })
})
