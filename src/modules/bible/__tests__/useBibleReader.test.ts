// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/bible-catalog', () => ({
  loadBibleBooks: vi.fn().mockResolvedValue([
    { id: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 2, bookNumber: 1, languageId: 'pt' },
  ]),
  loadBibleVersions: vi.fn().mockResolvedValue([
    { id: 1, abbreviation: 'ARA', name: 'ARA', languageId: 'pt' },
  ]),
  loadChapterVerses: vi.fn().mockResolvedValue({ '1': 'v1', '2': 'v2' }),
  pickDefaultVersionId: vi.fn((v: { id: number }[]) => v[0].id),
  resolveTestament: vi.fn(() => 'ot'),
}))

vi.mock('../services/bible-runtime', () => ({
  publishBibleSelection: vi.fn(),
  publishBibleRuntimeOff: vi.fn(),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  openProjectionModule: vi.fn().mockResolvedValue(true),
  closeProjectionModule: vi.fn(),
  isProjectionModuleOpen: vi.fn(() => false),
  hasSelectedExtendedProjectionTargets: vi.fn().mockResolvedValue(true),
}))

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(() => null),
  setUserPreference: vi.fn(),
}))

vi.mock('../../settings/services/palco-routing', () => ({
  getPalcoRoute: vi.fn(() => 'mirror'),
}))

import { useBibleReader } from '../composables/useBibleReader'
import { useBibleStore } from '../stores/useBibleStore'

type Reader = ReturnType<typeof useBibleReader>

function mountWith(setup: () => unknown): VueWrapper<{ exposed: unknown }> {
  return mount(
    defineComponent({
      setup() {
        return { exposed: setup() }
      },
      render() {
        return h('div')
      },
    }),
  )
}

describe('useBibleReader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('expõe refs do store, hasProjection e previewSnippet', () => {
    const reader = useBibleReader()
    expect(reader.books.value).toEqual([])
    expect(reader.hasProjection.value).toBe(false)
    expect(reader.previewSnippet.value).toBe('')

    const store = useBibleStore()
    store.projection = {
      versionId: 1,
      bookId: 1,
      versionAbbreviation: 'ARA',
      bookName: 'Gênesis',
      chapter: 1,
      verses: [1],
      scripturalReference: 'Gn 1:1',
      text: 'v1',
    }
    expect(reader.hasProjection.value).toBe(true)
    expect(reader.previewSnippet.value).toBe('v1')

    const longo = 'a'.repeat(200)
    store.projection = { ...store.projection, text: longo }
    expect(reader.previewSnippet.value).toBe(`${'a'.repeat(117)}...`)

    store.projection = { ...store.projection, text: '   ' }
    expect(reader.previewSnippet.value).toBe('')
  })

  it('onKeydown navega, limpa seleção e ignora inputs (montado de verdade)', async () => {
    const store = useBibleStore()
    const spyNav = vi.spyOn(store, 'goToAdjacentVerse').mockResolvedValue()
    const spyClear = vi.spyOn(store, 'clearSelection')

    let reader!: Reader
    const wrapper = mountWith(() => {
      reader = useBibleReader()
      return reader
    })
    // onMounted rodou: listener registrado no window
    expect(reader.books.value).toBeDefined()

    const fire = (key: string, target: HTMLElement | null = document.body) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true })
      Object.defineProperty(e, 'target', { value: target })
      window.dispatchEvent(e)
    }

    fire('ArrowLeft')
    fire('ArrowRight')
    await Promise.resolve()
    expect(spyNav).toHaveBeenCalledWith(-1)
    expect(spyNav).toHaveBeenCalledWith(1)

    fire('Escape')
    expect(spyClear).toHaveBeenCalled()

    // Escape com inAppPreview ativo: fecha a janela em vez de limpar seleção
    store.inAppPreview = true
    const spyClose = vi.spyOn(store, 'clearProjectionWindow')
    fire('Escape')
    expect(spyClose).toHaveBeenCalled()
    store.inAppPreview = false

    // tecla irrelevante: sai pelo else implícito da cadeia (nenhuma ação)
    fire('KeyA')
    expect(spyNav).toHaveBeenCalledTimes(2)

    // input focado / textarea / contentEditable: sem navegação extra
    const calls = spyNav.mock.calls.length
    const input = document.createElement('input')
    fire('ArrowLeft', input)
    fire('ArrowRight', document.createElement('textarea'))
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    fire('ArrowLeft', editable)
    expect(spyNav.mock.calls.length).toBe(calls)

    wrapper.unmount()
  })

  it('Escape no preview in-app fecha a projeção', async () => {
    const store = useBibleStore()
    store.inAppPreview = true
    const spyClose = vi.spyOn(store, 'clearProjectionWindow')

    const wrapper = mountWith(() => useBibleReader())
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(e, 'target', { value: document.body })
    window.dispatchEvent(e)
    expect(spyClose).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ciclo de vida: bootstrap no mount, listener removido no unmount', async () => {
    const store = useBibleStore()
    const bootstrapSpy = vi.spyOn(store, 'bootstrap')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const wrapper = mountWith(() => useBibleReader())
    await Promise.resolve()
    expect(bootstrapSpy).toHaveBeenCalled()

    const reader = wrapper.vm.exposed as Reader
    await reader.refresh()
    expect(reader.books.value.length).toBe(1)
    expect(reader.projectingTvsOnly.value).toBe(false)
    expect(reader.inAppPreview.value).toBe(false)
    expect(typeof reader.toggleProjection).toBe('function')
    expect(typeof reader.clearProjectionWindow).toBe('function')

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
