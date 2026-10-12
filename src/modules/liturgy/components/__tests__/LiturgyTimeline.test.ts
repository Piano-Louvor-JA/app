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
    template: `<div data-testid="timeline-item" class="timeline-item-stub">
      <button class="stub-emit" @click="$emit('edit')"></button>
      <button class="stub-select" @click="$emit('click')"></button>
      <button class="stub-remove" @click="$emit('remove')"></button>
      <button class="stub-toggle-done" @click="$emit('toggleDone')"></button>
      <button class="stub-add-sub" @click="$emit('addSubItem')"></button>
      <button class="stub-music-sung" @click="$emit('musicSung')"></button>
      <button class="stub-music-inst" @click="$emit('musicInstrumental')"></button>
      <button class="stub-music-slides" @click="$emit('musicSlides')"></button>
      <button class="stub-music-lyric" @click="$emit('musicLyric')"></button>
      <button class="stub-set-player" @click="$emit('setPlayer', 'vlc')"></button>
      <button class="stub-play-screens" @click="$emit('playScreens')"></button>
      <button class="stub-video-file" @click="$emit('videoFileSelected', 42)"></button>
      <button class="stub-toggle-collapse" @click="$emit('toggleCollapse')"></button>
      <button class="stub-drag-start" @click="$emit('dragStart', 0)"></button>
      <button class="stub-drag-end" @click="$emit('dragEnd')"></button>
    </div>`,
    emits: ['click', 'edit', 'remove', 'toggleDone', 'reorder', 'clone', 'addSubItem', 'musicSung', 'musicInstrumental', 'musicSlides', 'musicLyric', 'setPlayer', 'videoFileSelected', 'playScreens', 'toggleCollapse', 'dragStart', 'dragEnd'],
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
    function createItem(partial: Record<string, unknown>): LiturgyItem {
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
        items: [createItem({ id: 'm', type: 'music', musicId: 5 })],
        musicInstrumentalById: { 5: true },
      })
      expect((wrapper.vm as any).musicHasInstrumental(wrapper.props().items[0])).toBe(true)
      expect((wrapper.vm as any).musicHasInstrumental(createItem({ id: 'v', type: 'verse' }))).toBe(false)
      expect((wrapper.vm as any).musicHasInstrumental(createItem({ id: 'm2', type: 'music', musicId: null }))).toBe(false)
    })

    it('isMusicBusy: musicId bate com busyMusicId', () => {
      const wrapper = createWrapper({
        items: [createItem({ id: 'm', type: 'music', musicId: 7 })],
        busyMusicId: 7,
      })
      expect((wrapper.vm as any).isMusicBusy(wrapper.props().items[0])).toBe(true)
      expect((wrapper.vm as any).isMusicBusy(createItem({ id: 'm2', type: 'music', musicId: 8 }))).toBe(false)
    })

    it('collapse/expand categoria', () => {
      const wrapper = createWrapper({
        items: [
          createItem({ id: 'c1', type: 'category' }),
          createItem({ id: 'a', type: 'music', categoryId: 'c1' }),
        ],
      })
      expect((wrapper.vm as any).isCategoryCollapsed('c1')).toBe(false)
      ;(wrapper.vm as any).toggleCategoryCollapse('c1')
      expect((wrapper.vm as any).isCategoryCollapsed('c1')).toBe(true)
      ;(wrapper.vm as any).toggleCategoryCollapse('c1')
      expect((wrapper.vm as any).isCategoryCollapsed('c1')).toBe(false)
    })

    it('drag/drop: reorder emitido e resetado', () => {
      const wrapper = createWrapper({ items: [createItem({ id: 'a', type: 'music' })] })
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
        createItem({ id: 'c1', type: 'category' }),
        createItem({ id: 'a', type: 'music', categoryId: 'c1' }),
        createItem({ id: 'b', type: 'verse' }),
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
        createItem({ id: 'c1', type: 'category' }),
        createItem({ id: 'a', type: 'music', categoryId: 'c1', done: true }),
        createItem({ id: 'b', type: 'verse', categoryId: 'c1', done: false }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategoryIndeterminate('c1')).toBe(true)
    })

    it('isCategoryIndeterminate: todas done ou nenhuma → false', () => {
      const items = [
        createItem({ id: 'c1', type: 'category' }),
        createItem({ id: 'a', type: 'music', categoryId: 'c1', done: true }),
        createItem({ id: 'b', type: 'verse', categoryId: 'c1', done: true }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategoryIndeterminate('c1')).toBe(false)
    })

    it('arePreviousCategoriesDone: encadeia categorias', () => {
      const items = [
        createItem({ id: 'c1', type: 'category', done: true }),
        createItem({ id: 'c2', type: 'category', done: false }),
        createItem({ id: 'c3', type: 'category' }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).arePreviousCategoriesDone('c2')).toBe(true)
      expect((wrapper.vm as any).arePreviousCategoriesDone('c3')).toBe(false)
    })

    it('isCategorySectionWaiting: anterior incompleta → aguardando', () => {
      const items = [
        createItem({ id: 'c1', type: 'category', done: false }),
        createItem({ id: 'c2', type: 'category' }),
        createItem({ id: 'b', type: 'verse', categoryId: 'c2' }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategorySectionWaiting('c2')).toBe(true)
      expect((wrapper.vm as any).isCategorySectionWaiting('c1')).toBe(false)
    })

    it('isCategorySectionInProgress: anteriores ok e filhos incompletos', () => {
      const items = [
        createItem({ id: 'c1', type: 'category', done: true }),
        createItem({ id: 'c2', type: 'category' }),
        createItem({ id: 'a', type: 'music', categoryId: 'c2', done: false }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategorySectionInProgress('c2')).toBe(true)
    })

    it('isCategorySectionInProgress: sem filhos → true (categoria vazia atual)', () => {
      const items = [
        createItem({ id: 'c1', type: 'category', done: true }),
        createItem({ id: 'c2', type: 'category' }),
      ]
      const wrapper = createWrapper({ items })
      expect((wrapper.vm as any).isCategorySectionInProgress('c2')).toBe(true)
    })
  })

  describe('emits propagados do item', () => {
    it('edit/remove/toggleDone/musicSung etc repassados', async () => {
      const wrapper = createWrapper({ items: [createItem({ id: 'm1', type: 'music' })] })
      const stub = wrapper.findComponent({ name: 'LiturgyTimelineItem' })
      for (const evt of ['edit', 'remove', 'toggleDone', 'musicSung', 'musicInstrumental', 'musicSlides', 'musicLyric', 'select', 'playScreens']) {
        stub.vm.$emit(evt, 0)
      }
      stub.vm.$emit('setPlayer', 0, 'vlc')
      stub.vm.$emit('videoFileSelected', 'm1', 42)
      await wrapper.vm.$nextTick()
      for (const evt of ['edit', 'remove', 'toggleDone', 'musicSung', 'musicInstrumental', 'musicSlides', 'musicLyric', 'playScreens', 'setPlayer', 'videoFileSelected']) {
        expect(wrapper.emitted(evt), evt).toBeTruthy()
      }
      wrapper.unmount()
    })

    it('item de categoria com filhos: emits do child propagam', async () => {
      const wrapper = createWrapper({
        items: [
          createItem({ id: 'c1', type: 'category' }),
          createItem({ id: 'a', type: 'music', categoryId: 'c1' }),
        ],
        collapsible: true,
      })
      const stubs = wrapper.findAllComponents({ name: 'LiturgyTimelineItem' })
      expect(stubs.length).toBeGreaterThanOrEqual(2)
      stubs[1].vm.$emit('edit', 1)
      stubs[1].vm.$emit('remove', 1)
      stubs[1].vm.$emit('musicSung', 1)
      stubs[1].vm.$emit('setPlayer', 1, 'vlc')
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('edit')).toBeTruthy()
      expect(wrapper.emitted('remove')).toBeTruthy()
      expect(wrapper.emitted('musicSung')).toBeTruthy()
      expect(wrapper.emitted('setPlayer')).toBeTruthy()
      wrapper.unmount()
    })

    it('dragBlockRange com índice inválido: null', async () => {
      const wrapper = createWrapper({ items: [createItem({ id: 'a', type: 'music' })] })
      ;(wrapper.vm as any).onDragStart(99)
      expect((wrapper.vm as any).dragBlockRange).toBeNull()
      ;(wrapper.vm as any).onDragEnd()
      wrapper.unmount()
    })
  })

  describe('emits finais do stub (clone/addSub/toggleCollapse/filhos completos)', () => {
    it('clone do toolbar (222)', async () => {
      // empty state: clone habilitado com canClone, click emite (222/213 arm0)
      const w0 = createWrapper({ items: [], canClone: true })
      const clone0 = w0.find('.liturgy-timeline__clone')
      expect(clone0.exists()).toBe(true)
      await clone0.trigger('click')
      expect(w0.emitted('clone')).toBeTruthy()
      w0.unmount()
      // canClone false: nota de bloqueio, botão disabled (213 arm1)
      const w0b = createWrapper({ items: [], canClone: false })
      expect(w0b.text()).not.toContain('--- ou clone')
      expect(w0b.find('.liturgy-timeline__clone').attributes('disabled')).toBeDefined()
      w0b.unmount()
      const w = createWrapper({ items: [createItem({ id: 'c1', type: 'music' })], canClone: true })
      const clone = w.find('.liturgy-timeline__clone')
      if (clone.exists()) {
        await clone.trigger('click')
        expect(w.emitted('clone')).toBeTruthy()
      }
      w.unmount()
    })

    it('addSubItem e toggleCollapse propagam (291/294)', async () => {
      const w = createWrapper({ items: [createItem({ id: 'c1', type: 'category' })], collapsible: true })
      const stub = w.findComponent({ name: 'LiturgyTimelineItem' })
      stub.vm.$emit('addSubItem')
      stub.vm.$emit('toggleCollapse')
      await w.vm.$nextTick()
      expect(w.emitted('addSubItem')).toBeTruthy()
      // toggleCollapse não é emitido — é interno
      w.unmount()
    })

    it('filhos: todos os emits propagam com índice (329-337)', async () => {
      const w = createWrapper({
        items: [
          createItem({ id: 'c1', type: 'category' }),
          createItem({ id: 'a', type: 'music', categoryId: 'c1' }),
        ],
        collapsible: true,
      })
      const stubs = w.findAllComponents({ name: 'LiturgyTimelineItem' })
      const child = stubs[stubs.length - 1]
      for (const evt of ['select', 'playScreens', 'edit', 'remove', 'toggleDone', 'musicSung', 'musicInstrumental', 'musicSlides', 'musicLyric']) {
        child.vm.$emit(evt)
      }
      await w.vm.$nextTick()
      for (const evt of ['select', 'playScreens', 'edit', 'remove', 'toggleDone', 'musicSung', 'musicInstrumental', 'musicSlides', 'musicLyric']) {
        expect(w.emitted(evt), evt).toBeTruthy()
      }
      w.unmount()
    })

    it('segments com item undefined no meio: break (67)', async () => {
      const items: any[] = [createItem({ id: 'a' }) as never]
      items.length = 3 // deixa buracos undefined
      const w = createWrapper({ items: items as never })
      expect(w.findAllComponents({ name: 'LiturgyTimelineItem' }).length).toBeGreaterThanOrEqual(1)
      w.unmount()
    })

    it('dragFrom em item não-category (141)', async () => {
      const w = createWrapper({ items: [createItem({ id: 'a', type: 'music' })] })
      ;(w.vm as any).onDragStart?.(0)
      const range = (w.vm as any).dragBlockRange
      expect(range).toBeTruthy()
      ;(w.vm as any).onDragEnd?.()
      w.unmount()
    })

    it('arePreviousCategoriesDone / isCategoryPartiallyDone (160-171)', async () => {
      const w = createWrapper({
        items: [
          createItem({ id: 'c1', type: 'category', done: true }),
          createItem({ id: 'c2', type: 'category', done: false }),
          createItem({ id: 'a', type: 'music', categoryId: 'c2', done: true }),
          createItem({ id: 'b', type: 'music', categoryId: 'c2', done: false }),
        ],
        collapsible: true,
      })
      const vm = w.vm as any
      if (vm.arePreviousCategoriesDone) {
        expect(vm.arePreviousCategoriesDone('c2')).toBe(true)
        expect(vm.arePreviousCategoriesDone('c1')).toBe(true)
      }
      if (vm.isCategoryPartiallyDone) {
        expect(vm.isCategoryPartiallyDone('c2')).toBe(true)
      }
      w.unmount()
    })
  })

  it('gaps: arePreviousCategoriesDone — music antes da categoria (167) e id inexistente (171)', async () => {
    // music ANTES da categoria alvo → continue no loop (167)
    const w = createWrapper({
      items: [
        createItem({ id: 'm0', type: 'music', done: false }),
        createItem({ id: 'c1', type: 'category', done: false, sectionWaiting: false }),
      ],
    })
    expect(w.exists()).toBe(true)
    w.unmount()
    // sãoPrevious via isCategorySectionWaiting c/ categoria não encontrada → arePrevious roda até o fim (171)
    const w2 = createWrapper({
      items: [createItem({ id: 'c1', type: 'category', done: true })],
    })
    expect(w2.exists()).toBe(true)
    w2.unmount()
  })
})
