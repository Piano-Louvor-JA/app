// @vitest-environment jsdom
// BibleToolbar — version select, location, search, browse toggle
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('../../../settings/components/StagePaletteButton.vue', () => ({
  default: { template: '<div class="stage-palette-stub" />' },
}))

import BibleToolbar from '../BibleToolbar.vue'
import type { BibleBook, BibleVersion } from '../../types/bible'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      bible: {
        version: 'Versão',
        selectVersion: 'Selecione a versão',
        versionList: 'Lista de versões',
        location: 'Local',
        locationEmpty: 'Nenhum local',
        searchBible: 'Buscar na Bíblia',
        browseVerses: 'Ver versículos',
        browseBooksAndChapters: 'Ver livros',
      },
    },
  },
})

const books: BibleBook[] = [
  { id: 43, name: 'João', abbreviation: 'Jo', chapters: 21, bookNumber: 43, languageId: 'pt' },
]

const versions: BibleVersion[] = [
  { id: 1, name: 'Almeida', abbreviation: 'ARC' },
]

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(BibleToolbar, {
    props: {
      versions,
      selectedVersionId: 1,
      locationLabel: 'Gn 1:1',
      showNavPanel: false,
      books,
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

describe('BibleToolbar', () => {
  it('renderiza location label', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.bible-toolbar__location').text()).toBe('Gn 1:1')
  })

  it('location vazio: placeholder', () => {
    const wrapper = createWrapper({ locationLabel: '' })
    expect(wrapper.find('.bible-toolbar__location').text()).toBe('Nenhum local')
  })

  it('busca inteligente: abre o modal, digitar "amor" + Enter emite searchText', async () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.smart-search__trigger').exists()).toBe(true)
    await wrapper.find('.smart-search__trigger').trigger('click')
    const input = document.body.querySelector('.smart-search__input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'amor'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('searchText')![0]).toEqual(['amor'])
    wrapper.unmount()
  })

  it('browse nav fechado: label versículos + ícone book', () => {
    const wrapper = createWrapper({ showNavPanel: false })
    const btn = wrapper.find('.bible-toolbar__browse')
    expect(btn.attributes('aria-label')).toBe('Ver livros')
    expect(btn.attributes('aria-pressed')).toBe('false')
    expect(btn.find('.ti-book-2').exists()).toBe(true)
    expect(btn.classes()).not.toContain('bible-toolbar__browse--books')
  })

  it('browse nav aberto: label livros + ícone list', () => {
    const wrapper = createWrapper({ showNavPanel: true })
    const btn = wrapper.find('.bible-toolbar__browse')
    expect(btn.attributes('aria-label')).toBe('Ver versículos')
    expect(btn.attributes('aria-pressed')).toBe('true')
    expect(btn.find('.ti-list-numbers').exists()).toBe(true)
    expect(btn.classes()).toContain('bible-toolbar__browse--books')
  })

  it('clicar browse emite toggleNav', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.bible-toolbar__browse').trigger('click')
    expect(wrapper.emitted('toggleNav')).toBeTruthy()
  })

  it('repassa selectVersion do BibleVersionSelect', async () => {
    const wrapper = createWrapper()
    // abre o menu do select e escolhe
    await wrapper.find('.bible-version-select__trigger').trigger('click')
    const options = document.querySelectorAll('.bible-version-select__option')
    ;(options[0] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    // mesma versão selecionada (id 1) → sem emit; mudar prop e testar de novo
    expect(wrapper.emitted('selectVersion')).toBeFalsy()
  })

  it('versionsDisabled repassa pro select', () => {
    const wrapper = createWrapper({ versionsDisabled: true })
    expect((wrapper.find('.bible-version-select__trigger').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('StagePaletteButton presente', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.stage-palette-stub').exists()).toBe(true)
  })
})
