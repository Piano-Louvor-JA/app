// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import liturgyLocale from '../../locales/pt-BR'
import LiturgyTitleColorPicker from '../LiturgyTitleColorPicker.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

function mountPicker(modelValue = '') {
  return mount(LiturgyTitleColorPicker, {
    props: { modelValue },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('LiturgyTitleColorPicker', () => {
  it('sem cor escolhida mostra o padrão e abre a paleta', async () => {
    const wrapper = mountPicker()
    const trigger = wrapper.get('[data-testid="title-color-trigger"]')
    expect(trigger.attributes('title')).toBe('Cor do título')
    expect(wrapper.find('.title-color__current--default').exists()).toBe(true)
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.title-color__swatch')).toHaveLength(11)
    expect(wrapper.get('[data-color=""]').attributes('aria-checked')).toBe('true')
    await trigger.trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('escolher uma cor emite e fecha; cor padrão emite vazio', async () => {
    const wrapper = mountPicker('#42a5f5')
    expect(wrapper.get('.title-color__current').attributes('style')).toContain('background: rgb(66, 165, 245)')
    await wrapper.get('[data-testid="title-color-trigger"]').trigger('click')
    expect(wrapper.get('[data-color="#42a5f5"]').classes()).toContain('title-color__swatch--active')
    await wrapper.get('[data-color="#ffee58"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['#ffee58']])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await wrapper.get('[data-testid="title-color-trigger"]').trigger('click')
    await wrapper.get('[data-color=""]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([''])
    wrapper.unmount()
  })

  it('clique fora ou ESC fecha a paleta; clique dentro não', async () => {
    const wrapper = mountPicker()
    const trigger = wrapper.get('[data-testid="title-color-trigger"]')
    await trigger.trigger('click')
    wrapper.get('[role="menu"]').element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await trigger.trigger('keydown', { key: 'Escape' })
    await trigger.trigger('click')
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
