// @vitest-environment jsdom
// CodenameLogo — SVG estático: estrutura, role, currentColor
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import CodenameLogo from '../CodenameLogo.vue'

describe('CodenameLogo', () => {
  it('renderiza SVG com viewBox correto', () => {
    const wrapper = mount(CodenameLogo)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('viewBox')).toBe('0 0 584 144')
  })

  it('role img e aria-label', () => {
    const wrapper = mount(CodenameLogo)
    const svg = wrapper.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('codename PIANO')
  })

  it('grupo codenome usa currentColor', () => {
    const wrapper = mount(CodenameLogo)
    const g = wrapper.find('#codenome')
    expect(g.exists()).toBe(true)
    expect(g.attributes('fill')).toBe('currentColor')
  })

  it('grupo piano com barras coloridas fixas', () => {
    const wrapper = mount(CodenameLogo)
    expect(wrapper.find('#piano').exists()).toBe(true)
    expect(wrapper.find('#piano path[fill="#04549B"]').exists()).toBe(true) // azul
    expect(wrapper.find('#piano path[fill="#00C1E6"]').exists()).toBe(true) // ciano
    expect(wrapper.find('#piano path[fill="#FCCE02"]').exists()).toBe(true) // amarelo
  })

  it('classe codename-logo para estilos globais', () => {
    const wrapper = mount(CodenameLogo)
    expect(wrapper.find('svg.codename-logo').exists()).toBe(true)
  })
})
