// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import CountdownSavedList from '../components/CountdownSavedList.vue'

describe('CountdownSavedList', () => {
  it('sem itens: não renderiza o aside', () => {
    const wrapper = mount(CountdownSavedList, {
      props: { items: [], timeFormat: 'mm-ss' },
    })
    expect(wrapper.find('.countdown-saved').exists()).toBe(false)
  })

  it('com itens: contagem, rótulo formatado e remoção individual', async () => {
    const wrapper = mount(CountdownSavedList, {
      props: { items: [65_000, 125_000], timeFormat: 'mm:ss' },
    })
    expect(wrapper.find('.countdown-saved__count').text()).toBe('2')
    const values = wrapper.findAll('.countdown-saved__value')
    expect(values[0].text()).toBe('01:05')
    expect(values[1].text()).toBe('02:05')

    await wrapper.findAll('.countdown-saved__remove')[1].trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[1]])
  })

  it('botão limpar tudo emite clear', async () => {
    const wrapper = mount(CountdownSavedList, {
      props: { items: [1000], timeFormat: 'mm-ss' },
    })
    await wrapper.find('.countdown-saved__clear').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })
})
