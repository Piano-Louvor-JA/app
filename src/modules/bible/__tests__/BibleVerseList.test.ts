// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-stub"><slot /></div>' },
}))

const readSettings = vi.hoisted(() =>
  vi.fn(() => ({
    backgroundColor: '#101010',
    backgroundImage: 'stage:gradients/sunrise',
  })),
)
const resolveBg = vi.hoisted(() => vi.fn(() => 'http://localhost/img/bg.png'))

vi.mock('../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: readSettings,
}))
vi.mock('../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: resolveBg,
}))

import BibleVerseList from '../components/BibleVerseList.vue'
import type { BibleSelection } from '../types/bible'

const projection: BibleSelection = {
  versionId: 1,
  bookId: 1,
  versionAbbreviation: 'ARA',
  bookName: 'Gênesis',
  chapter: 1,
  verses: [1],
  scripturalReference: 'Gn 1:1',
  text: 'No princípio',
}

function mountList(props: Record<string, unknown> = {}) {
  return mount(BibleVerseList, {
    props: {
      chapterTitle: 'Gênesis 1',
      verses: [
        { number: 1, text: 'No princípio' },
        { number: 2, text: 'E a terra' },
      ],
      selectedVerses: [],
      verseSearchQuery: '',
      isLoading: false,
      projection,
      previewSnippet: 'No princípio',
      hasProjection: true,
      ...props,
    },
  })
}

describe('BibleVerseList', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('título custom; fallback quando vazio', () => {
    expect(mountList().text()).toContain('Gênesis 1')
    const fallback = mountList({ chapterTitle: '' })
    expect(fallback.text()).toContain('bible.title')
  })

  it('estados: loading, vazio e lista de versículos', () => {
    expect(mountList({ isLoading: true }).text()).toContain('bible.loading')
    expect(mountList({ verses: [] }).text()).toContain('bible.emptyChapter')

    const wrapper = mountList({ selectedVerses: [2] })
    const verses = wrapper.findAll('.bible-reader__verse')
    expect(verses).toHaveLength(2)
    expect(verses[1].classes()).toContain('bible-reader__verse--active')
    expect(verses[0].classes()).not.toContain('bible-reader__verse--active')
  })

  it('selecionar versículo emite selectVerse com número e evento', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.bible-reader__verse')[1].trigger('click')
    const evt = wrapper.emitted('selectVerse')
    expect(evt?.[0]?.[0]).toBe(2)
    expect(evt?.[0]?.[1]).toBeTruthy()
  })

  it('busca de versículo emite update:verseSearchQuery', async () => {
    const wrapper = mountList()
    await wrapper.find('input[type="search"]').setValue('terra')
    expect(wrapper.emitted('update:verseSearchQuery')?.[0]).toEqual(['terra'])
  })

  it('navegação: desabilitada sem seleção; previous/next/clear habilitados com seleção e projeção', async () => {
    const nav = mountList({ selectedVerses: [] })
    const btns = nav.findAll('.bible-reader__circle-btn')
    expect(btns[0].attributes('disabled')).toBeDefined()
    expect(btns[1].attributes('disabled')).toBeDefined()
    // clear habilitado pois hasProjection=true
    expect(btns[2].attributes('disabled')).toBeUndefined()
    await btns[2].trigger('click')
    expect(nav.emitted('clearProjection')).toHaveLength(1)

    const active = mountList({ selectedVerses: [1] })
    const abtns = active.findAll('.bible-reader__circle-btn')
    expect(abtns[0].attributes('disabled')).toBeUndefined()
    await abtns[0].trigger('click')
    await abtns[1].trigger('click')
    expect(active.emitted('previousVerse')).toHaveLength(1)
    expect(active.emitted('nextVerse')).toHaveLength(1)
  })

  it('copiar com projeção: texto+referência, feedback e limpeza após timeout', async () => {
    const wrapper = mountList()
    await wrapper.find('.bible-reader__icon-btn').trigger('click')
    expect(writeText).toHaveBeenCalledWith('No princípio\nGn 1:1')
    expect(wrapper.text()).toContain('bible.copied')
    expect(wrapper.emitted('copy')).toHaveLength(1)

    vi.advanceTimersByTime(1900)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('bible.copied')
  })

  it('copiar sem projeção: junta todos os versículos', async () => {
    const wrapper = mountList({ hasProjection: false })
    await wrapper.find('.bible-reader__icon-btn').trigger('click')
    expect(writeText).toHaveBeenCalledWith('1. No princípio\n2. E a terra')
  })

  it('copiar com falha do clipboard: feedback de erro', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const wrapper = mountList()
    await wrapper.find('.bible-reader__icon-btn').trigger('click')
    expect(wrapper.text()).toContain('bible.copyFailed')
  })

  it('preview usa o estilo efetivo do escopo bible', () => {
    const wrapper = mountList()
    const preview = wrapper.find('.bible-reader__preview')
    expect(preview.exists()).toBe(true)
    const style = preview.attributes('style') ?? ''
    expect(style).toContain('background-color')
    expect(style).toContain('bg.png')
    expect(wrapper.text()).toContain('Gn 1:1')
  })

  it('preview sem imagem de fundo: backgroundImage undefined', () => {
    resolveBg.mockReturnValueOnce(null)
    const wrapper = mountList()
    const style = wrapper.find('.bible-reader__preview').attributes('style') ?? ''
    expect(style).not.toContain('url(')
  })

  it('sem projeção: preview some', () => {
    const wrapper = mountList({ hasProjection: false })
    expect(wrapper.find('.bible-reader__preview').exists()).toBe(false)
  })
})
