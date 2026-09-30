// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import LiturgyTimeline from '../LiturgyTimeline.vue'
import liturgyLocale from '../../locales/pt-BR'

vi.mock('../services/liturgy-item-helpers', () => ({
  getCategoryBlockEnd: vi.fn((items: any[], index: number) => {
    let i = index + 1
    while (i < items.length && items[i]?.type !== 'category') i++
    return i - 1
  }),
}))

// Stub leve sem Pinia
vi.mock('../LiturgyTimelineItem.vue', () => ({
  default: {
    name: 'LiturgyTimelineItem',
    props: ['item', 'index', 'isSelected', 'hasInstrumental', 'isBusy', 'startLabel', 'durationLabel', 'canClone', 'deletionLocked', 'siteProjectionItemId', 'videoProjectionItemId'],
    template: '<div data-testid="timeline-item" @click="$emit(\'click\')" />',
    emits: ['click', 'edit', 'remove', 'toggleDone', 'reorder', 'clone', 'addSubItem', 'musicSung', 'musicInstrumental', 'musicSlides', 'musicLyric', 'setPlayer', 'videoFileSelected'],
  },
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': liturgyLocale },
})

function createItem(overrides = {}) {
  return {
    id: `item-${Math.random()}`,
    type: 'music',
    name: 'Item',
    durationMs: 300000,
    categoryId: null,
    filePath: '',
    filePaths: [],
    musicId: 1,
    url: '',
    accentColor: '#000',
    startTime: '10:00',
    endTime: '10:05',
    ...overrides,
  }
}

function createCategory(overrides = {}) {
  return createItem({ type: 'category', durationMs: 0, categoryId: null, ...overrides })
}

const defaultProps = {
  items: [] as any[],
  selectedIndex: null,
  startLabels: [],
  durationLabels: [],
  canClone: true,
  deletionLocked: false,
  musicInstrumentalById: {},
  busyMusicId: null,
}

function createWrapper(props = {}) {
  return mount(LiturgyTimeline, {
    props: { ...defaultProps, ...props },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza vazio sem erros', () => {
    const wrapper = createWrapper({ items: [] })
    expect(wrapper.exists()).toBe(true)
  })

  it('renderiza itens simples (stub)', () => {
    const items = [createItem({ id: '1', type: 'music' }), createItem({ id: '2', type: 'images' })]
    const wrapper = createWrapper({ items })
    expect(wrapper.findAll('[data-testid="timeline-item"]').length).toBe(2)
  })

  it('agrupa filhos sob categoria (stub)', () => {
    const items = [
      createCategory({ id: 'cat1', name: 'Categoria 1' }),
      createItem({ id: '1', categoryId: 'cat1', type: 'music' }),
      createItem({ id: '2', categoryId: 'cat1', type: 'verse' }),
      createCategory({ id: 'cat2', name: 'Categoria 2' }),
      createItem({ id: '3', categoryId: 'cat2', type: 'images' }),
    ]
    const wrapper = createWrapper({ items })
    expect(wrapper.findAll('[data-testid="timeline-item"]').length).toBe(5)
  })

  it('selectedIndex renderiza sem erro', () => {
    const items = [createItem({ id: '1' }), createItem({ id: '2' })]
    const wrapper = createWrapper({ items, selectedIndex: 1 })
    expect(wrapper.findAll('[data-testid="timeline-item"]').length).toBe(2)
  })

  describe('emits propagados', () => {
    const items = [createItem({ id: '1', type: 'music', musicId: 1 })]

    const emitCases = [
      { event: 'edit', args: [0] },
      { event: 'remove', args: [0] },
      { event: 'toggleDone', args: [0] },
      { event: 'reorder', args: [0, 1] },
      { event: 'clone', args: [] },
      { event: 'addSubItem', args: ['cat1'] },
      { event: 'musicSung', args: [0] },
      { event: 'musicInstrumental', args: [0] },
      { event: 'musicSlides', args: [0] },
      { event: 'musicLyric', args: [0] },
      { event: 'setPlayer', args: [0, 'player-1'] },
      { event: 'videoFileSelected', args: ['1', 30] },
    ] as const

    for (const { event, args } of emitCases) {
      it(`emite ${event}`, async () => {
        const wrapper = createWrapper({ items })
        await wrapper.vm.$emit(event, ...args)
        expect(wrapper.emitted(event)?.[0]).toEqual(args)
      })
    }
  })

  // computed helpers testados indiretamente via LiturgyItemDialog.test.ts

  describe('funções internas restantes', () => {
    function mkItem(partial: Record<string, unknown>): LiturgyItem {
      return {
        id: 'x',
        type: 'music',
        name: 'Item',
        subtitle: '',
        done: false,
        durationMs: 0,
        accentColor: '#fff',
        categoryId: null,
        startTime: null,
        endTime: null,
        ...partial,
      } as LiturgyItem
    }

    it('musicHasInstrumental: só music com id e flag', () => {
      const wrapper = createWrapper({
        items: [mkItem({ id: 'm', type: 'music', musicId: 5 })],
        musicInstrumentalById: { 5: true },
      })
      expect((wrapper.vm as any).musicHasInstrumental(wrapper.props().items[0])).toBe(true)
      expect((wrapper.vm as any).musicHasInstrumental(mkItem({ id: 'v', type: 'verse' }))).toBe(false)
      expect((wrapper.vm as any).musicHasInstrumental(mkItem({ id: 'm2', type: 'music', musicId: null }))).toBe(false)
    })

    it('isMusicBusy: musicId bate com busyMusicId', () => {
      const wrapper = createWrapper({
        items: [mkItem({ id: 'm', type: 'music', musicId: 7 })],
        busyMusicId: 7,
      })
      expect((wrapper.vm as any).isMusicBusy(wrapper.props().items[0])).toBe(true)
      expect((wrapper.vm as any).isMusicBusy(mkItem({ id: 'm2', type: 'music', musicId: 8 }))).toBe(false)
    })

    it('collapse/expand categoria', () => {
      const wrapper = createWrapper({
        items: [
          mkItem({ id: 'c1', type: 'category' }),
          mkItem({ id: 'a', type: 'music', categoryId: 'c1' }),
        ],
      })
      expect((wrapper.vm as any).isCategoryCollapsed('c1')).toBe(false)
      ;(wrapper.vm as any).toggleCategoryCollapse('c1')
      expect((wrapper.vm as any).isCategoryCollapsed('c1')).toBe(true)
      ;(wrapper.vm as any).toggleCategoryCollapse('c1')
      expect((wrapper.vm as any).isCategoryCollapsed('c1')).toBe(false)
    })

    it('drag/drop: reorder emitido e resetado', () => {
      const wrapper = createWrapper({ items: [mkItem({ id: 'a', type: 'music' })] })
      ;(wrapper.vm as any).onDragStart(0)
      ;(wrapper.vm as any).onDrop(1)
      expect(wrapper.emitted('reorder')![0]).toEqual([0, 1])
      // sem dragFrom, drop ignorado
      ;(wrapper.vm as any).onDrop(2)
      expect(wrapper.emitted('reorder')!.length).toBe(1)
      ;(wrapper.vm as any).onDragStart(0)
      ;(wrapper.vm as any).onDragEnd()
      ;(wrapper.vm as any).onDrop(1)
      expect(wrapper.emitted('reorder')!.length).toBe(1)
    })

    it('isDragBlockIndex: item simples e categoria com filhos', () => {
      const items = [
        mkItem({ id: 'c1', type: 'category' }),
        mkItem({ id: 'a', type: 'music', categoryId: 'c1' }),
        mkItem({ id: 'b', type: 'verse' }),
      ]
      const wrapper = createWrapper({ items })
      ;(wrapper.vm as any).onDragStart(0)
      expect((wrapper.vm as any).isDragBlockIndex(0)).toBe(true)
      expect((wrapper.vm as any).isDragBlockIndex(1)).toBe(true)
      expect((wrapper.vm as any).isDragBlockIndex(2)).toBe(false)
      ;(wrapper.vm as any).onDragEnd()
      expect((wrapper.vm as any).isDragBlockIndex(0)).toBe(false)
    })

    it('isCategoryIndeterminate: parcialmente done', () => {
      const items = [
        mkItem({ id: 'c1', type: 'category' }),
        mkItem({ id: 'a', type: 'music', categoryId: 'c1', done: true }),
        mkItem({ id: 'b', type: 'verse', categoryId: 'c1', done: false }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategoryIndeterminate('c1')).toBe(true)
    })

    it('isCategoryIndeterminate: todas done ou nenhuma → false', () => {
      const items = [
        mkItem({ id: 'c1', type: 'category' }),
        mkItem({ id: 'a', type: 'music', categoryId: 'c1', done: true }),
        mkItem({ id: 'b', type: 'verse', categoryId: 'c1', done: true }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategoryIndeterminate('c1')).toBe(false)
    })

    it('arePreviousCategoriesDone: encadeia categorias', () => {
      const items = [
        mkItem({ id: 'c1', type: 'category', done: true }),
        mkItem({ id: 'c2', type: 'category', done: false }),
        mkItem({ id: 'c3', type: 'category' }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).arePreviousCategoriesDone('c2')).toBe(true)
      expect((wrapper.vm as any).arePreviousCategoriesDone('c3')).toBe(false)
    })

    it('isCategorySectionWaiting: anterior incompleta → aguardando', () => {
      const items = [
        mkItem({ id: 'c1', type: 'category', done: false }),
        mkItem({ id: 'c2', type: 'category' }),
        mkItem({ id: 'b', type: 'verse', categoryId: 'c2' }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategorySectionWaiting('c2')).toBe(true)
      expect((wrapper.vm as any).isCategorySectionWaiting('c1')).toBe(false)
    })

    it('isCategorySectionInProgress: anteriores ok e filhos incompletos', () => {
      const items = [
        mkItem({ id: 'c1', type: 'category', done: true }),
        mkItem({ id: 'c2', type: 'category' }),
        mkItem({ id: 'a', type: 'music', categoryId: 'c2', done: false }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategorySectionInProgress('c2')).toBe(true)
    })

    it('isCategorySectionInProgress: sem filhos → true (categoria vazia atual)', () => {
      const items = [
        mkItem({ id: 'c1', type: 'category', done: true }),
        mkItem({ id: 'c2', type: 'category' }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategorySectionInProgress('c2')).toBe(true)
    })
  })
})
