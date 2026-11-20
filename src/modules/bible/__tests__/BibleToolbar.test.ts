// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-stub"><slot /></div>' },
}))

vi.mock('../../settings/components/StagePaletteButton.vue', () => ({
  default: { name: 'StagePaletteButton', props: ['scope'], template: '<div class="palette-stub" />' },
}))

vi.mock('../components/BibleVersionSelect.vue', () => ({
  default: {
    name: 'BibleVersionSelect',
    emits: ['select'],
    props: ['versions', 'selectedVersionId', 'disabled'],
    template: '<div class="version-select-stub" />',
  },
}))

import BibleToolbar from '../components/BibleToolbar.vue'
import type { BibleBook, BibleVersion } from '../types/bible'

const versions: BibleVersion[] = [
  { id: 1, abbreviation: 'ARA', name: 'ARA', languageId: 'pt' },
]

const books: BibleBook[] = [
  { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 50, bookNumber: 1, languageId: 'pt' },
  { id: 43, name: 'João', abbreviation: 'Jo', chapters: 21, bookNumber: 43, languageId: 'pt' },
]

function mountToolbar(props: Record<string, unknown> = {}) {
  return mount(BibleToolbar, {
    props: {
      versions,
      selectedVersionId: 1,
      locationLabel: 'Gn 1',
      showNavPanel: false,
      books,
      ...props,
    },
  })
}

describe('BibleToolbar', () => {
  it('renderiza versão, localização e busca', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('.version-select-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('bible.location')
    expect(wrapper.text()).toContain('Gn 1')
    expect(wrapper.find('.smart-search__trigger').exists()).toBe(true)
    expect(wrapper.find('.palette-stub').exists()).toBe(true)
  })

  it('localização vazia: mostra fallback', () => {
    const wrapper = mountToolbar({ locationLabel: '' })
    expect(wrapper.text()).toContain('bible.locationEmpty')
  })

  it('busca inteligente: referência + Enter emite openPassage', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('.smart-search__trigger').trigger('click')
    const input = document.body.querySelector('.smart-search__input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'jo 3:16'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('openPassage')?.[0]).toEqual([43, 3, [16]])
    expect(document.body.querySelector('.smart-search__overlay')).toBeNull()
    wrapper.unmount()
  })

  it('busca inteligente: texto + Enter emite searchText', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('.smart-search__trigger').trigger('click')
    const input = document.body.querySelector('.smart-search__input') as HTMLInputElement
    input.value = 'salv'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('searchText')?.[0]).toEqual(['salv'])
    wrapper.unmount()
  })

  it('repassa select do VersionSelect', async () => {
    const wrapper = mountToolbar()
    const sel = wrapper.findComponent({ name: 'BibleVersionSelect' })
    sel.vm.$emit('select', 9)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('selectVersion')?.[0]).toEqual([9])
  })

  it('browse: rótulo/ícone conforme showNavPanel e clique emite toggleNav', async () => {
    // fechado: destino = livros e capítulos
    const closed = mountToolbar({ showNavPanel: false })
    const btnClosed = closed.find('.bible-toolbar__browse')
    expect(btnClosed.text()).toContain('bible.browseBooksAndChapters')
    expect(btnClosed.find('i').classes()).toContain('ti-book-2')
    expect(btnClosed.attributes('aria-pressed')).toBe('false')
    await btnClosed.trigger('click')
    expect(closed.emitted('toggleNav')).toHaveLength(1)

    // aberto: destino = versículos
    const open = mountToolbar({ showNavPanel: true })
    const btnOpen = open.find('.bible-toolbar__browse')
    expect(btnOpen.text()).toContain('bible.browseVerses')
    expect(btnOpen.find('i').classes()).toContain('ti-list-numbers')
    expect(btnOpen.attributes('aria-pressed')).toBe('true')
    expect(btnOpen.classes()).toContain('bible-toolbar__browse--books')
    await btnOpen.trigger('click')
    expect(open.emitted('toggleNav')).toHaveLength(1)
  })
})
