// @vitest-environment jsdom

import type { MinimizedBarItem } from '@design-system/types/navigation'
import { flushPromises, mount } from '@vue/test-utils'
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

  it('página aberta agora: item em destaque (aria-current); sem página aberta na barra, nenhum', async () => {
    wrapper = mount(MinimizedPagesBar, {
      props: { items, navLabel: 'Páginas minimizadas', currentKey: '/albums/9' },
      attachTo: document.body,
    })
    const buttons = wrapper.findAll('.ds-minimized-bar__item')
    expect(buttons[1].classes()).toContain('ds-minimized-bar__item--current')
    expect(buttons[1].attributes('aria-current')).toBe('page')
    expect(buttons[0].classes()).not.toContain('ds-minimized-bar__item--current')
    expect(buttons[0].attributes('aria-current')).toBeUndefined()
    await wrapper.setProps({ currentKey: '/outra' })
    expect(wrapper.findAll('.ds-minimized-bar__item--current')).toHaveLength(0)
  })

  it('outras teclas no item não fecham', async () => {
    wrapper = mountBar()
    await wrapper.findAll('.ds-minimized-bar__item')[0].trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})

/** jsdom não tem DragEvent — monta Event e anexa dataTransfer/clientX. */
function fireDrag(el: Element, type: 'dragstart' | 'dragover' | 'drop' | 'dragend', extra: Record<string, unknown> = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, extra)
  el.dispatchEvent(event)
  return event
}

function fakeTransfer() {
  return { effectAllowed: '', dropEffect: '', data: {} as Record<string, string>, setData(type: string, value: string) { this.data[type] = value } }
}

describe('MinimizedPagesBar — reordenar', () => {
  /** 4 itens de 100px lado a lado: centro de cada um em 50, 150, 250, 350. */
  function mountRow() {
    wrapper = mountBar(many(4))
    slots().forEach((slot, i) => {
      slot.element.getBoundingClientRect = () => ({ left: i * 100, width: 100, top: 500 }) as DOMRect
    })
  }

  async function drag(from: number, to: number, clientX: number) {
    const dataTransfer = fakeTransfer()
    fireDrag(slots()[from].element, 'dragstart', { dataTransfer })
    await wrapper!.vm.$nextTick()
    const over = fireDrag(slots()[to].element, 'dragover', { dataTransfer, clientX })
    await wrapper!.vm.$nextTick()
    return { dataTransfer, over }
  }

  it('os itens podem ser arrastados', () => {
    mountRow()
    expect(slots().every((slot) => slot.attributes('draggable') === 'true')).toBe(true)
  })

  it('arrastar marca o item, esconde a prévia e mostra onde ele vai cair', async () => {
    mountRow()
    await slots()[0].trigger('mouseenter')
    const { dataTransfer, over } = await drag(0, 2, 280)
    expect(dataTransfer.effectAllowed).toBe('move')
    expect(dataTransfer.data['text/plain']).toBe('/albums/0')
    expect(over.defaultPrevented).toBe(true)
    expect(dataTransfer.dropEffect).toBe('move')
    expect(wrapper!.find('.ds-minimized-bar__preview').exists()).toBe(false)
    expect(slots()[0].classes()).toContain('ds-minimized-bar__slot--dragging')
    expect(slots()[2].classes()).toContain('ds-minimized-bar__slot--drop-after')
    fireDrag(slots()[2].element, 'dragover', { dataTransfer, clientX: 210 })
    await wrapper!.vm.$nextTick()
    expect(slots()[2].classes()).toContain('ds-minimized-bar__slot--drop-before')
    expect(slots()[2].classes()).not.toContain('ds-minimized-bar__slot--drop-after')
  })

  it('soltar depois de um item mais à frente leva para lá', async () => {
    mountRow()
    await drag(0, 2, 280)
    fireDrag(slots()[2].element, 'drop')
    await wrapper!.vm.$nextTick()
    expect(wrapper!.emitted('reorder')).toEqual([['/albums/0', 2]])
    expect(wrapper!.findAll('.ds-minimized-bar__slot--dragging')).toHaveLength(0)
    expect(wrapper!.findAll('.ds-minimized-bar__slot--drop-after')).toHaveLength(0)
  })

  it('soltar antes de um item mais atrás leva para lá', async () => {
    mountRow()
    await drag(3, 1, 120)
    fireDrag(slots()[1].element, 'drop')
    expect(wrapper!.emitted('reorder')).toEqual([['/albums/3', 1]])
  })

  it('soltar no mesmo lugar (ou sobre ele mesmo) não reordena', async () => {
    mountRow()
    await drag(1, 0, 80)
    fireDrag(slots()[0].element, 'drop')
    const { over } = await drag(2, 2, 250)
    expect(slots()[2].classes()).not.toContain('ds-minimized-bar__slot--drop-before')
    expect(slots()[2].classes()).not.toContain('ds-minimized-bar__slot--drop-after')
    expect(over.defaultPrevented).toBe(true)
    fireDrag(slots()[2].element, 'drop')
    expect(wrapper!.emitted('reorder')).toBeUndefined()
  })

  it('soltar sem ter arrastado um item da barra (ex.: arquivo) não faz nada', () => {
    mountRow()
    const over = fireDrag(slots()[1].element, 'dragover', { clientX: 120 })
    expect(over.defaultPrevented).toBe(false)
    fireDrag(slots()[1].element, 'drop')
    expect(wrapper!.emitted('reorder')).toBeUndefined()
  })

  it('arrasto sem dataTransfer (evento sintético) também reordena', async () => {
    mountRow()
    fireDrag(slots()[0].element, 'dragstart')
    fireDrag(slots()[1].element, 'dragover', { clientX: 180 })
    fireDrag(slots()[1].element, 'drop')
    expect(wrapper!.emitted('reorder')).toEqual([['/albums/0', 1]])
  })

  it('cancelar o arrasto limpa as marcas', async () => {
    mountRow()
    await drag(0, 2, 280)
    fireDrag(slots()[0].element, 'dragend')
    await wrapper!.vm.$nextTick()
    expect(wrapper!.findAll('.ds-minimized-bar__slot--dragging')).toHaveLength(0)
    expect(wrapper!.findAll('.ds-minimized-bar__slot--drop-after')).toHaveLength(0)
  })

  it('teclado: Alt+setas move o item; nas pontas não faz nada', async () => {
    mountRow()
    const buttons = wrapper!.findAll('.ds-minimized-bar__item')
    await buttons[1].trigger('keydown', { key: 'ArrowRight', altKey: true })
    await buttons[1].trigger('keydown', { key: 'ArrowLeft', altKey: true })
    await buttons[0].trigger('keydown', { key: 'ArrowLeft', altKey: true })
    await buttons[3].trigger('keydown', { key: 'ArrowRight', altKey: true })
    await buttons[1].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper!.emitted('reorder')).toEqual([
      ['/albums/1', 2],
      ['/albums/1', 0],
    ])
  })
})

function many(count: number): MinimizedBarItem[] {
  return Array.from({ length: count }, (_, i) => ({ ...items[1], key: `/albums/${i}`, title: `CD ${i}` }))
}

function setBox(el: Element, box: Partial<Record<'scrollWidth' | 'clientWidth', number>>) {
  for (const [key, value] of Object.entries(box)) Object.defineProperty(el, key, { configurable: true, value })
  if (!Object.prototype.hasOwnProperty.call(el, 'scrollLeft')) {
    Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: 0 })
  }
}

const list = () => wrapper!.get('.ds-minimized-bar__list').element as HTMLElement

describe('MinimizedPagesBar — muitos itens', () => {
  it('a prévia fica acima do item, presa à janela (não é cortada pela rolagem)', async () => {
    wrapper = mountBar()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    const slot = slots()[0]
    slot.element.getBoundingClientRect = () => ({ left: 400, width: 100, top: 500 }) as DOMRect
    await slot.trigger('mouseenter')
    const style = wrapper.get('.ds-minimized-bar__preview').attributes('style')
    expect(style).toContain('left: 450px')
    expect(style).toContain('top: 490px')
  })

  it('a prévia não sai pelas bordas da janela', async () => {
    wrapper = mountBar()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    slots()[0].element.getBoundingClientRect = () => ({ left: 0, width: 40, top: 500 }) as DOMRect
    await slots()[0].trigger('mouseenter')
    expect(wrapper.get('.ds-minimized-bar__preview').attributes('style')).toContain('left: 128px')
    await slots()[0].trigger('mouseleave')
    slots()[1].element.getBoundingClientRect = () => ({ left: 980, width: 40, top: 500 }) as DOMRect
    await slots()[1].trigger('mouseenter')
    expect(wrapper.get('.ds-minimized-bar__preview').attributes('style')).toContain('left: 872px')
  })

  it('rodinha do mouse rola para os lados quando não cabe; cabendo, não mexe', async () => {
    wrapper = mountBar(many(20))
    setBox(list(), { scrollWidth: 2000, clientWidth: 800 })
    list().scrollLeft = 0
    const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true })
    list().dispatchEvent(event)
    expect(list().scrollLeft).toBe(120)
    expect(event.defaultPrevented).toBe(true)

    const sideways = new WheelEvent('wheel', { deltaX: 30, deltaY: 5, cancelable: true })
    list().dispatchEvent(sideways)
    expect(list().scrollLeft).toBe(120)
    expect(sideways.defaultPrevented).toBe(false)

    setBox(list(), { scrollWidth: 800, clientWidth: 800 })
    const fits = new WheelEvent('wheel', { deltaY: 120, cancelable: true })
    list().dispatchEvent(fits)
    expect(fits.defaultPrevented).toBe(false)
  })

  it('rolar a barra esconde a prévia aberta', async () => {
    wrapper = mountBar(many(3))
    await slots()[0].trigger('mouseenter')
    await wrapper.get('.ds-minimized-bar__list').trigger('scroll')
    expect(wrapper.find('.ds-minimized-bar__preview').exists()).toBe(false)
  })

  it('página nova minimizada: a barra rola até o fim para mostrá-la', async () => {
    wrapper = mountBar(many(3))
    setBox(list(), { scrollWidth: 2000, clientWidth: 800 })
    list().scrollLeft = 0
    await wrapper.setProps({ items: many(4) })
    await flushPromises()
    expect(list().scrollLeft).toBe(2000)
    list().scrollLeft = 10
    await wrapper.setProps({ items: many(2) })
    await flushPromises()
    expect(list().scrollLeft).toBe(10)
  })
})
