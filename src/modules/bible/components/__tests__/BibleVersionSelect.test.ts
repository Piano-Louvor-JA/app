// @vitest-environment jsdom
// BibleVersionSelect — toggle, choose, outside click, Escape, labels
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@design-system/composables', () => ({
  useBlurSystem: () => ({ backdropFilter: { value: 'blur(8px)' } }),
}))

import BibleVersionSelect from '../BibleVersionSelect.vue'
import type { BibleVersion } from '../types/bible'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      bible: {
        version: 'Versão',
        selectVersion: 'Selecione a versão',
        versionList: 'Lista de versões',
      },
    },
  },
})

const versions: BibleVersion[] = [
  { id: 1, name: 'Almeida', abbreviation: 'ARC' },
  { id: 2, name: 'Nova Versão', abbreviation: 'NVI' },
  { id: 3, name: 'Sem Abreviação', abbreviation: '' },
]

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(BibleVersionSelect, {
    props: { versions, selectedVersionId: 1, ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('BibleVersionSelect', () => {
  let wrapper: ReturnType<typeof createWrapper> | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  function track<T extends ReturnType<typeof createWrapper>>(w: T): T {
    wrapper = w
    return w
  }

  it('renderiza label e trigger com versão selecionada', () => {
    track(createWrapper())
    expect(wrapper!.find('.bible-version-select__label').text()).toBe('Versão')
    expect(wrapper!.find('.bible-version-select__value').text()).toBe('Almeida (ARC)')
  })

  it('sem versão selecionada: placeholder', () => {
    track(createWrapper({ selectedVersionId: null }))
    expect(wrapper!.find('.bible-version-select__value').text()).toBe('Selecione a versão')
  })

  it('abreviação vazia: label só com nome', () => {
    track(createWrapper({ selectedVersionId: 3 }))
    expect(wrapper!.find('.bible-version-select__value').text()).toBe('Sem Abreviação')
  })

  it('disabled: trigger desabilitado', () => {
    track(createWrapper({ disabled: true }))
    expect((wrapper!.find('.bible-version-select__trigger').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('sem versões: trigger desabilitado', () => {
    track(createWrapper({ versions: [] }))
    expect((wrapper!.find('.bible-version-select__trigger').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('toggle: abre menu com opções', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    expect(wrapper!.find('.bible-version-select__trigger').classes()).toContain('bible-version-select__trigger--open')
    const menu = document.querySelector('.bible-version-select__menu')
    expect(menu).toBeTruthy()
    expect(document.querySelectorAll('.bible-version-select__option').length).toBe(3)
  })

  it('choose: emite select e fecha menu', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    const options = document.querySelectorAll('.bible-version-select__option')
    ;(options[1] as HTMLElement).click()
    await wrapper!.vm.$nextTick()
    expect(wrapper!.emitted('select')).toBeTruthy()
    expect(wrapper!.emitted('select')![0]).toEqual([2])
    expect(document.querySelector('.bible-version-select__menu')).toBeNull()
  })

  it('choose: mesma versão não emite', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    const options = document.querySelectorAll('.bible-version-select__option')
    ;(options[0] as HTMLElement).click()
    await wrapper!.vm.$nextTick()
    expect(wrapper!.emitted('select')).toBeFalsy()
  })

  it('option ativa: classe --active na selecionada', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    const options = document.querySelectorAll('.bible-version-select__option')
    expect(options[0].classList.contains('bible-version-select__option--active')).toBe(true)
    expect(options[1].classList.contains('bible-version-select__option--active')).toBe(false)
  })

  it('Escape fecha menu', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    expect(document.querySelector('.bible-version-select__menu')).toBeTruthy()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper!.vm.$nextTick()
    expect(document.querySelector('.bible-version-select__menu')).toBeNull()
  })

  it('pointerdown fora fecha menu', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    expect(document.querySelector('.bible-version-select__menu')).toBeTruthy()
    // jsdom não tem PointerEvent — MouseEvent com type pointerdown funciona
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper!.vm.$nextTick()
    expect(document.querySelector('.bible-version-select__menu')).toBeNull()
  })

  it('pointerdown dentro do root não fecha', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    const trigger = wrapper!.find('.bible-version-select__trigger').element
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper!.vm.$nextTick()
    expect(document.querySelector('.bible-version-select__menu')).toBeTruthy()
  })

  it('toggle duas vezes: abre e fecha', async () => {
    track(createWrapper())
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    expect(document.querySelector('.bible-version-select__menu')).toBeTruthy()
    await wrapper!.find('.bible-version-select__trigger').trigger('click')
    expect(document.querySelector('.bible-version-select__menu')).toBeNull()
  })
})
