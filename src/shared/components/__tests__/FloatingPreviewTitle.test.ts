// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FloatingPreviewTitle from '../FloatingPreviewTitle.vue'

describe('FloatingPreviewTitle', () => {
  it('mostra o nome do recurso acima da prévia flutuante', () => {
    const wrapper = mount(FloatingPreviewTitle, { props: { label: 'Relógio' } })
    expect(wrapper.classes()).toContain('floating-preview-title')
    expect(wrapper.text()).toBe('Relógio')
  })

  it('sem detalhe: só o nome, sem separador', () => {
    const wrapper = mount(FloatingPreviewTitle, { props: { label: 'Relógio' } })
    expect(wrapper.find('.floating-preview-title__detail').exists()).toBe(false)
    expect(wrapper.find('.floating-preview-title__separator').exists()).toBe(false)
  })

  it('com detalhe: nome, separador e o detalhe em destaque à parte (branco)', () => {
    const wrapper = mount(FloatingPreviewTitle, {
      props: { label: 'Player', detail: 'Hinário Adventista' },
    })
    expect(wrapper.text()).toBe('Player · Hinário Adventista')
    expect(wrapper.find('.floating-preview-title__detail').text()).toBe('Hinário Adventista')
  })
})

