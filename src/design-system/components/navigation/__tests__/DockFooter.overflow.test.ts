import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import DockFooter from '../DockFooter.vue'
import navigation from '../../../../locales/navigation'

const items = ['home', 'liturgy', 'bible', 'albums', 'community', 'utilities', 'settings'].map(key => ({ key, label: key, icon: 'ti-home' }))
const global = { plugins: [createI18n({ legacy: false, locale: 'pt-BR', messages: navigation })] }
describe('compact navigation', () => {
  it('limits the dock to four destinations plus a named overflow control', () => {
    const wrapper = mount(DockFooter, { props: { items }, global })
    expect(wrapper.findAll('.ds-dock > button')).toHaveLength(5)
    expect(wrapper.find('[aria-expanded]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.ds-dock__overflow').exists()).toBe(false)
    wrapper.unmount()
  })
  it('opens the remaining destinations and closes after navigation', async () => {
    const wrapper = mount(DockFooter, { props: { items, activeKey: 'settings' }, global })
    await wrapper.get('[aria-expanded]').trigger('click')
    expect(wrapper.get('.ds-dock__overflow [aria-current="page"]').text()).toBe('settings')
    const options = wrapper.findAll('.ds-dock__overflow button')
    expect(options).toHaveLength(3)
    await options[0]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['community'])
    expect(wrapper.find('.ds-dock__overflow').exists()).toBe(false)
    wrapper.unmount()
  })
  it('returns keyboard focus to the opener on Escape', async () => {
    const wrapper = mount(DockFooter, { props: { items }, global, attachTo: document.body })
    await wrapper.get('[aria-expanded]').trigger('click')
    expect(wrapper.get('.ds-dock__overflow').element.contains(document.activeElement)).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-expanded]').attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(wrapper.get('[aria-expanded]').element)
    wrapper.unmount()
  })
})
