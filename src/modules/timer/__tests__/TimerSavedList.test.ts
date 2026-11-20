// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import TimerSavedList from '../components/TimerSavedList.vue'

describe('TimerSavedList', () => {
  it('sem itens: não renderiza o aside', () => {
    const wrapper = mount(TimerSavedList, {
      props: { items: [], timeFormat: 'mm:ss' },
    })
    expect(wrapper.find('.timer-saved').exists()).toBe(false)
  })

  it('com itens: contagem, rótulo formatado e remoção individual', async () => {
    const wrapper = mount(TimerSavedList, {
      props: { items: [65_000, 125_000], timeFormat: 'mm:ss' },
    })
    expect(wrapper.find('.timer-saved__count').text()).toBe('2')
    const values = wrapper.findAll('.timer-saved__value')
    expect(values[0].text()).toBe('01:05')
    expect(values[1].text()).toBe('02:05')

    await wrapper.findAll('.timer-saved__remove')[1].trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[1]])
  })

  it('botão limpar tudo emite clear', async () => {
    const wrapper = mount(TimerSavedList, {
      props: { items: [1000], timeFormat: 'mm:ss' },
    })
    await wrapper.find('.timer-saved__clear').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })
})
