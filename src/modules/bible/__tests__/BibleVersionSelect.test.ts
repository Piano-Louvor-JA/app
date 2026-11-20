// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@design-system/composables', () => ({
  useBlurSystem: () => ({ backdropFilter: { value: 'blur(4px)' } }),
}))

import BibleVersionSelect from '../components/BibleVersionSelect.vue'

// jsdom não tem PointerEvent
if (typeof window.PointerEvent === 'undefined') {
  // @ts-expect-error polyfill de teste
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
    }
  }
}
import type { BibleVersion } from '../types/bible'

const versions: BibleVersion[] = [
  { id: 1, abbreviation: 'ARA', name: 'Almeida', languageId: 'pt' },
  { id: 2, abbreviation: '', name: 'Sem Abbr', languageId: 'pt' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(BibleVersionSelect, {
    props: {
      versions,
      selectedVersionId: 1,
      ...props,
    },
    attachTo: document.body,
  })
}

describe('BibleVersionSelect', () => {
  let getBoundingClientRect: () => DOMRect

  beforeEach(() => {
    vi.clearAllMocks()
    getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      return new DOMRect(40, 30, 220, 36)
    }
  })
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect
    document.body.innerHTML = ''
  })

  it('labels: selecionado com abbr, fallback quando sem seleção', () => {
    const w1 = mountSelect()
    expect(w1.text()).toContain('bible.version')
    expect(w1.text()).toContain('Almeida (ARA)')
    w1.unmount()

    const w2 = mountSelect({ selectedVersionId: null })
    expect(w2.text()).toContain('bible.selectVersion')
    w2.unmount()

    // versão selecionada sem abbr: label só com nome (lado false do cond-expr)
    const w3 = mountSelect({ selectedVersionId: 2 })
    expect(w3.text()).toContain('Sem Abbr')
    w3.unmount()
  })

  it('toggle abre o menu via Teleport; escolher versão emite select e fecha', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.find('.bible-version-select__trigger')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')

    const menu = document.querySelector('.bible-version-select__menu')
    expect(menu).toBeTruthy()
    // posição calculada a partir do rect mockado
    const style = (menu as HTMLElement).getAttribute('style') ?? ''
    expect(style).toContain('min-width: 272px')

    // opções com abbr e sem abbr (trim vazio)
    const options = document.querySelectorAll('.bible-version-select__option')
    expect(options).toHaveLength(2)
    expect(options[0].querySelector('.bible-version-select__option-abbr')).toBeTruthy()
    // abbreviation '' é falsy: span omitido
    expect(options[1].querySelector('.bible-version-select__option-abbr')).toBeNull()
    // ativa marcada
    expect(options[0].getAttribute('aria-selected')).toBe('true')

    // escolher a mesma versão: fecha sem emitir
    ;(options[0] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('false')

    // reabrir e escolher outra: emite select
    await wrapper.find('.bible-version-select__trigger').trigger('click')
    const opts2 = document.querySelectorAll('.bible-version-select__option')
    ;(opts2[1] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('select')?.[0]).toEqual([2])
    wrapper.unmount()
  })

  it('disabled ou sem versões: toggle não abre', async () => {
    const w1 = mountSelect({ disabled: true })
    await w1.find('.bible-version-select__trigger').trigger('click')
    expect(w1.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('false')
    expect(document.querySelector('.bible-version-select__menu')).toBeNull()
    w1.unmount()

    const w2 = mountSelect({ versions: [] })
    await w2.find('.bible-version-select__trigger').trigger('click')
    expect(document.querySelector('.bible-version-select__menu')).toBeNull()
    w2.unmount()
  })

  it('pointerdown fora fecha o menu; dentro não fecha', async () => {
    const wrapper = mountSelect()
    await wrapper.find('.bible-version-select__trigger').trigger('click')
    expect(document.querySelector('.bible-version-select__menu')).toBeTruthy()

    // clique fora (no body)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('false')

    // reabrir e clicar dentro do trigger
    await wrapper.find('.bible-version-select__trigger').trigger('click')
    wrapper.find('.bible-version-select__trigger').element.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('Escape fecha; pointerdown com menu fechado é no-op', async () => {
    const wrapper = mountSelect()
    await wrapper.find('.bible-version-select__trigger').trigger('click')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('false')

    // pointerdown com fechado: nada quebra, continua fechado
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(wrapper.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('resize e scroll reposicionam o menu aberto; unmount remove listeners', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const removeWinSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mountSelect()
    await wrapper.find('.bible-version-select__trigger').trigger('click')
    expect(document.querySelector('.bible-version-select__menu')).toBeTruthy()

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.bible-version-select__menu')).toBeTruthy()

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(removeWinSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeWinSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
  })

  it('toggle duplo: abrir e fechar pelo próprio trigger', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.find('.bible-version-select__trigger')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.querySelector('.bible-version-select__menu')).toBeNull()
    wrapper.unmount()
  })

  it('Escape com menu fechado: no-op', async () => {
    const wrapper = mountSelect()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('resize/scroll com menu fechado: onViewportChange sem ação', async () => {
    const wrapper = mountSelect()
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    expect(wrapper.find('.bible-version-select__trigger').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
})
