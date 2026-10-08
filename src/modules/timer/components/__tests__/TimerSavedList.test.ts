// @vitest-environment jsdom
/**
 * TimerSavedList — render da lista de tempos salvos:
 * v-if vazio, contagem, clear, remove por índice, label por timeFormat.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import TimerSavedList from '../TimerSavedList.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': {} },
})

function mountList(items = [61_000, 122_000], timeFormat: 'mmss' | 'ms' | 'clock' = 'mmss') {
  return mount(TimerSavedList, {
    props: { items, timeFormat },
    global: { plugins: [i18n] },
  })
}

describe('TimerSavedList.vue', () => {
  it('sem itens: não renderiza nada', () => {
    const w = mountList([])
    expect(w.find('.timer-saved').exists()).toBe(false)
  })

  it('com itens: contagem, valores formatados e clear', async () => {
    const w = mountList()
    expect(w.find('.timer-saved__count').text()).toBe('2')
    const values = w.findAll('.timer-saved__value')
    expect(values).toHaveLength(2)
    expect(values[0]!.text()).not.toBe('')
    await w.find('.timer-saved__clear').trigger('click')
    expect(w.emitted('clear')).toHaveLength(1)
  })

  it('remove emite o índice do item', async () => {
    const w = mountList()
    const removes = w.findAll('.timer-saved__remove')
    await removes[1]!.trigger('click')
    expect(w.emitted('remove')).toEqual([[1]])
  })

  it('timeFormat clock formata diferente de mmss', () => {
    const mmss = mountList([61_000], 'mmss')
    const clock = mountList([61_000], 'clock')
    const v1 = mmss.find('.timer-saved__value').text()
    const v2 = clock.find('.timer-saved__value').text()
    expect(v1).not.toBe(v2)
  })
})
