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
})
