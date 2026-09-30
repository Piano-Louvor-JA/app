// @vitest-environment jsdom
// LiturgyDayTabs — chips de dias + custom, ativo, select, wheel horizontal
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import LiturgyDayTabs from '../LiturgyDayTabs.vue'
import { LITURGY_DAY_TAB_ORDER } from '../../types/liturgy'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      liturgy: {
        daysShort: {
          sunday: 'Dom',
          monday: 'Seg',
          tuesday: 'Ter',
          wednesday: 'Qua',
          thursday: 'Qui',
          friday: 'Sex',
          saturday: 'Sáb',
          custom: 'Livre',
        },
      },
    },
  },
})

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(LiturgyDayTabs, {
    props: { selectedDay: 'sunday', ...props },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyDayTabs', () => {
  it('renderiza uma chip por dia da ordem litúrgica + custom', () => {
    const wrapper = createWrapper()
    const chips = wrapper.findAll('.liturgy-day-tabs__chip')
    expect(chips.length).toBe(LITURGY_DAY_TAB_ORDER.length + 1)
    expect(chips[0].text()).toBe('Dom')
    expect(chips.at(-1)!.text()).toBe('Livre')
  })

  it('chip ativa conforme selectedDay', () => {
    const wrapper = createWrapper({ selectedDay: 'wednesday' })
    const chips = wrapper.findAll('.liturgy-day-tabs__chip')
    expect(chips[3].classes()).toContain('liturgy-day-tabs__chip--active')
    expect(chips[0].classes()).not.toContain('liturgy-day-tabs__chip--active')
  })

  it('custom ativa quando selectedDay=custom', () => {
    const wrapper = createWrapper({ selectedDay: 'custom' })
    const chips = wrapper.findAll('.liturgy-day-tabs__chip')
    expect(chips.at(-1)!.classes()).toContain('liturgy-day-tabs__chip--active')
  })

  it('clicar dia emite select com a chave', async () => {
    const wrapper = createWrapper()
    const chips = wrapper.findAll('.liturgy-day-tabs__chip')
    await chips[2].trigger('click')
    expect(wrapper.emitted('select')![0]).toEqual(['tuesday'])
  })

  it('clicar custom emite select custom', async () => {
    const wrapper = createWrapper()
    const chips = wrapper.findAll('.liturgy-day-tabs__chip')
    await chips.at(-1)!.trigger('click')
    expect(wrapper.emitted('select')![0]).toEqual(['custom'])
  })

  it('wheel com deltaY converte em scrollLeft', async () => {
    const wrapper = createWrapper()
    const root = wrapper.find('.liturgy-day-tabs')
    // mock currentTarget com scrollLeft mutável
    Object.defineProperty(root.element, 'scrollLeft', {
      value: 0,
      writable: true,
    })
    await root.trigger('wheel', { deltaY: 120, preventDefault: () => {} })
    expect((root.element as HTMLElement).scrollLeft).toBe(120)
  })

  it('divider presente entre dias e custom', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.liturgy-day-tabs__divider').exists()).toBe(true)
  })
})
