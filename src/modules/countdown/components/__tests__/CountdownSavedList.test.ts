// @vitest-environment jsdom
// CountdownSavedList — render lista, remove(index), clear, vazio
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import CountdownSavedList from '../CountdownSavedList.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      countdown: {
        savedTimes: 'tempos salvos',
        clearAll: 'Limpar tudo',
        removeSaved: 'Remover',
      },
    },
  },
})

function createWrapper(props: { items: number[]; timeFormat?: string }) {
  return mount(CountdownSavedList, {
    props: { timeFormat: 'hh:mm:ss', ...props },
    global: { plugins: [i18n] },
  })
}

describe('CountdownSavedList', () => {
  it('vazio: não renderiza', () => {
    const wrapper = createWrapper({ items: [] })
    expect(wrapper.find('.countdown-saved').exists()).toBe(false)
  })

  it('com items: renderiza contagem e valores formatados', () => {
    const wrapper = createWrapper({ items: [3661000, 60000] }) // 1:01:01, 00:01:00
    expect(wrapper.find('.countdown-saved__count').text()).toBe('2')
    const values = wrapper.findAll('.countdown-saved__value')
    expect(values.length).toBe(2)
    expect(values[0].text()).toContain('01')
  })

  it('remove: emite index', async () => {
    const wrapper = createWrapper({ items: [1000, 2000, 3000] })
    const removes = wrapper.findAll('.countdown-saved__remove')
    expect(removes.length).toBe(3)
    await removes[1].trigger('click')
    expect(wrapper.emitted('remove')).toBeTruthy()
    expect(wrapper.emitted('remove')![0]).toEqual([1])
  })

  it('clear: emite clear', async () => {
    const wrapper = createWrapper({ items: [1000] })
    await wrapper.find('.countdown-saved__clear').trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
  })

  it('formato curto mm:ss aplica no label', () => {
    const wrapper = createWrapper({ items: [65000], timeFormat: 'mm:ss' })
    expect(wrapper.find('.countdown-saved__value').text()).toContain('01:05')
  })
})
