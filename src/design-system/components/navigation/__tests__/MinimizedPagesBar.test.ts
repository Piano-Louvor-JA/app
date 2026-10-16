// @vitest-environment jsdom

import type { MinimizedBarItem } from '@design-system/types/navigation'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
/**
 * MinimizedPagesBar — barra de páginas minimizadas acima do dock. Só
 * apresentação: recebe os itens e emite open/close.
 */
import MinimizedPagesBar from '../MinimizedPagesBar.vue'

const items: MinimizedBarItem[] = [
  {
    key: '/albums/5',
    title: 'Hinário Adventista',
    icon: 'ti-book',
    summary: 'Busca: santo · 610 faixas',
    preview: 'data:image/jpeg;base64,AA',
    closeLabel: 'Fechar Hinário Adventista',
  },
  {
    key: '/albums/9',
    title: 'CD Vocacional',
    icon: 'ti-disc',
    summary: '',
    preview: null,
    closeLabel: 'Fechar CD Vocacional',
  },
]

let wrapper: ReturnType<typeof mountBar> | null = null

function mountBar(list = items) {
  return mount(MinimizedPagesBar, {
    props: { items: list, navLabel: 'Páginas minimizadas' },
    attachTo: document.body,
  })
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

const slots = () => wrapper!.findAll('.ds-minimized-bar__slot')

describe('MinimizedPagesBar', () => {
  it('é um <nav> com aria-label e um item por página (ícone + título)', () => {
    wrapper = mountBar()
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Páginas minimizadas')
    const buttons = wrapper.findAll('.ds-minimized-bar__item')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('Hinário Adventista')
    expect(buttons[0].attributes('aria-label')).toBe('Hinário Adventista')
    expect(buttons[0].find('i').classes()).toContain('ti-book')
    expect(buttons[1].find('i').classes()).toContain('ti-disc')
  })

  it('cada item leva a chave da página (destino do efeito ao minimizar)', () => {
    wrapper = mountBar()
    const buttons = wrapper.findAll('.ds-minimized-bar__item')
    expect(buttons.map((b) => b.attributes('data-minimized-key'))).toEqual(['/albums/5', '/albums/9'])
  })

  it('sem o mouse em cima: nem prévia nem x', () => {
    wrapper = mountBar()
    expect(wrapper.find('.ds-minimized-bar__preview').exists()).toBe(false)
    expect(wrapper.find('.ds-minimized-bar__close').exists()).toBe(false)
  })

  it('passar o mouse mostra a prévia com miniatura, título, resumo e o x', async () => {
    wrapper = mountBar()
    await slots()[0].trigger('mouseenter')
    const preview = wrapper.find('.ds-minimized-bar__preview')
    expect(preview.attributes('role')).toBe('tooltip')
    expect(preview.find('img').attributes('src')).toBe('data:image/jpeg;base64,AA')
    expect(preview.text()).toContain('Hinário Adventista')
    expect(preview.text()).toContain('Busca: santo · 610 faixas')
    const close = slots()[0].find('.ds-minimized-bar__close')
    expect(close.attributes('aria-label')).toBe('Fechar Hinário Adventista')
    expect(close.attributes('title')).toBe('Fechar Hinário Adventista')
  })

  it('sem miniatura: prévia em cartão com o ícone grande e sem resumo vazio', async () => {
    wrapper = mountBar()
    await slots()[1].trigger('mouseenter')
    const preview = wrapper.find('.ds-minimized-bar__preview')
    expect(preview.find('img').exists()).toBe(false)
    expect(preview.find('.ds-minimized-bar__preview-icon i').classes()).toContain('ti-disc')
    expect(preview.find('.ds-minimized-bar__preview-summary').exists()).toBe(false)
  })

  it('tirar o mouse esconde a prévia', async () => {
    wrapper = mountBar()
    await slots()[0].trigger('mouseenter')
    await slots()[0].trigger('mouseleave')
    expect(wrapper.find('.ds-minimized-bar__preview').exists()).toBe(false)
  })

  it('clicar no item emite open; clicar no x emite close (e não open)', async () => {
    wrapper = mountBar()
    await wrapper.findAll('.ds-minimized-bar__item')[1].trigger('click')
    expect(wrapper.emitted('open')).toEqual([['/albums/9']])

    await slots()[0].trigger('mouseenter')
    await slots()[0].find('.ds-minimized-bar__close').trigger('click')
    expect(wrapper.emitted('close')).toEqual([['/albums/5']])
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('teclado: foco mostra prévia e x; Delete fecha', async () => {
    wrapper = mountBar()
    const item = wrapper.findAll('.ds-minimized-bar__item')[0]
    await item.trigger('focusin')
    expect(wrapper.find('.ds-minimized-bar__preview').exists()).toBe(true)
    expect(slots()[0].find('.ds-minimized-bar__close').exists()).toBe(true)
    await item.trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('close')).toEqual([['/albums/5']])
  })

  it('foco indo para o x mantém a prévia; foco saindo do item esconde', async () => {
    wrapper = mountBar()
    const slot = slots()[0]
    await slot.trigger('focusin')
    const close = slot.find('.ds-minimized-bar__close').element
    await slot.trigger('focusout', { relatedTarget: close })
    expect(wrapper.find('.ds-minimized-bar__preview').exists()).toBe(true)
    await slot.trigger('focusout', { relatedTarget: document.body })
    expect(wrapper.find('.ds-minimized-bar__preview').exists()).toBe(false)
  })

  it('mouse saindo de outro item não fecha a prévia aberta', async () => {
    wrapper = mountBar()
    await slots()[0].trigger('mouseenter')
    await slots()[1].trigger('mouseleave')
    expect(wrapper.find('.ds-minimized-bar__preview').text()).toContain('Hinário Adventista')
  })

  it('foco saindo para fora da janela (sem destino) esconde a prévia', async () => {
    wrapper = mountBar()
    await slots()[0].trigger('focusin')
    await slots()[0].trigger('focusout', { relatedTarget: null })
    expect(wrapper.find('.ds-minimized-bar__preview').exists()).toBe(false)
  })

  it('outras teclas no item não fecham', async () => {
    wrapper = mountBar()
    await wrapper.findAll('.ds-minimized-bar__item')[0].trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
