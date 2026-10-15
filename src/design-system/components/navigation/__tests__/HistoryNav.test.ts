// @vitest-environment jsdom

import type { HistoryNavDot } from '@design-system/types/navigation'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
/**
 * HistoryNav — setas voltar/avançar + pontos do histórico. Só apresentação:
 * recebe pontos/estado por props e emite back/forward/go.
 */
import HistoryNav from '../HistoryNav.vue'

const labels = {
  ariaLabel: 'Histórico de navegação',
  backLabel: 'Voltar',
  forwardLabel: 'Avançar',
}

function dots(count: number, current: number, edges: number[] = []): HistoryNavDot[] {
  return Array.from({ length: count }, (_, index) => ({
    index: index + 10,
    label: `Tela ${index}`,
    current: index === current,
    edge: edges.includes(index),
  }))
}

function mountNav(props: Partial<InstanceType<typeof HistoryNav>['$props']> = {}) {
  return mount(HistoryNav, {
    props: { dots: dots(3, 1), canGoBack: true, canGoForward: true, ...labels, ...props },
  })
}

describe('HistoryNav', () => {
  it('é um <nav> com aria-label', () => {
    const nav = mountNav().find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBe('Histórico de navegação')
  })

  it('renderiza um botão por ponto, com tooltip e aria-label do nome da tela', () => {
    const buttons = mountNav().findAll('.ds-history-nav__dot')
    expect(buttons).toHaveLength(3)
    expect(buttons[2].attributes('title')).toBe('Tela 2')
    expect(buttons[2].attributes('aria-label')).toBe('Tela 2')
  })

  it('marca só o ponto atual com aria-current e classe de destaque', () => {
    const buttons = mountNav().findAll('.ds-history-nav__dot')
    expect(buttons.map((b) => b.attributes('aria-current'))).toEqual([undefined, 'page', undefined])
    expect(buttons[1].classes()).toContain('ds-history-nav__dot--current')
    expect(buttons[0].classes()).not.toContain('ds-history-nav__dot--current')
  })

  it('pontos de borda recebem a classe edge', () => {
    const wrapper = mountNav({ dots: dots(5, 2, [0, 4]) })
    const edge = wrapper.findAll('.ds-history-nav__dot--edge')
    expect(edge.map((b) => b.attributes('title'))).toEqual(['Tela 0', 'Tela 4'])
  })

  it('clicar num ponto emite go com o índice do histórico', async () => {
    const wrapper = mountNav()
    await wrapper.findAll('.ds-history-nav__dot')[0].trigger('click')
    expect(wrapper.emitted('go')).toEqual([[10]])
  })

  it('clicar no ponto atual não emite nada', async () => {
    const wrapper = mountNav()
    await wrapper.findAll('.ds-history-nav__dot')[1].trigger('click')
    expect(wrapper.emitted('go')).toBeUndefined()
  })

  it('setas emitem back e forward', async () => {
    const wrapper = mountNav()
    await wrapper.find('.ds-history-nav__arrow--back').trigger('click')
    await wrapper.find('.ds-history-nav__arrow--forward').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('forward')).toHaveLength(1)
  })

  it('setas têm aria-label e ícones Tabler', () => {
    const wrapper = mountNav()
    const back = wrapper.find('.ds-history-nav__arrow--back')
    const forward = wrapper.find('.ds-history-nav__arrow--forward')
    expect(back.attributes('aria-label')).toBe('Voltar')
    expect(forward.attributes('aria-label')).toBe('Avançar')
    expect(back.find('i').classes()).toContain('ti-arrow-left')
    expect(forward.find('i').classes()).toContain('ti-arrow-right')
  })

  it('setas desabilitadas ficam disabled e não emitem (Q1: uma entrada só)', async () => {
    const wrapper = mountNav({ dots: dots(1, 0), canGoBack: false, canGoForward: false })
    const back = wrapper.find('.ds-history-nav__arrow--back')
    const forward = wrapper.find('.ds-history-nav__arrow--forward')
    expect(back.attributes('disabled')).toBeDefined()
    expect(forward.attributes('disabled')).toBeDefined()
    await back.trigger('click')
    await forward.trigger('click')
    expect(wrapper.emitted('back')).toBeUndefined()
    expect(wrapper.emitted('forward')).toBeUndefined()
    expect(wrapper.findAll('.ds-history-nav__dot')).toHaveLength(1)
  })

  it('sem pontos renderiza só as setas', () => {
    const wrapper = mountNav({ dots: [], canGoBack: false, canGoForward: false })
    expect(wrapper.findAll('.ds-history-nav__dot')).toHaveLength(0)
    expect(wrapper.findAll('.ds-history-nav__arrow')).toHaveLength(2)
  })
})
