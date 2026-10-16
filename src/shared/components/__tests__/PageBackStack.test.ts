// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import PageBackStack from '../PageBackStack.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': { minimize: { page: 'Minimizar página' } } },
})

function mountStack() {
  return mount(PageBackStack, {
    global: { plugins: [i18n] },
    slots: { default: '<button class="minha-tela__back">←</button>' },
  })
}

describe('PageBackStack', () => {
  it('mantém a seta de voltar da tela e põe o botão – logo abaixo', () => {
    const w = mountStack()
    const buttons = w.findAll('button')
    expect(buttons.map((b) => b.classes()[0])).toEqual(['minha-tela__back', 'page-back-stack__minimize'])
  })

  it('botão – tem rótulo acessível e ícone de menos', () => {
    const w = mountStack()
    const minimize = w.find('.page-back-stack__minimize')
    expect(minimize.attributes('aria-label')).toBe('Minimizar página')
    expect(minimize.attributes('title')).toBe('Minimizar página')
    expect(minimize.attributes('type')).toBe('button')
    expect(minimize.find('i').classes()).toContain('ti-minus')
  })

  it('clicar no – emite minimize', async () => {
    const w = mountStack()
    await w.find('.page-back-stack__minimize').trigger('click')
    expect(w.emitted('minimize')).toHaveLength(1)
  })
})
