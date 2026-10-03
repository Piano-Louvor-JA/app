// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import LiturgyTimelineItem from '../LiturgyTimelineItem.vue'
import liturgyLocale from '../../locales/pt-BR'

vi.mock('@shared/services/desktop-bridge', () => ({
  isElectronShell: vi.fn(() => false),
  isDesktopApp: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}))

vi.mock('../composables/useExternalPlayerChoices', () => ({
  useExternalPlayerChoices: () => ({ choices: [] }),
}))

vi.mock('../services/liturgy-item-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/liturgy-item-helpers')>()
  return {
    ...actual,
    getItemTypeIcon: vi.fn((type: string) => `icon-${type}`),
  }
})

// Stub do MusicTrackActions (usa Pinia)
vi.mock('@shared/components/MusicTrackActions.vue', () => ({
  default: {
    name: 'MusicTrackActions',
    props: ['musicId', 'itemId', 'hasInstrumental', 'busy'],
    template: '<div data-testid="music-track-actions" />',
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
    name: 'Item Teste',
    durationMs: 300000,
    categoryId: null,
    filePath: '',
    filePaths: [],
    musicId: 1,
    url: '',
    accentColor: '#ff9800',
    startTime: '10:00',
    endTime: '10:05',
    ...overrides,
  }
}

function createCategory(overrides = {}) {
  return createItem({ type: 'category', durationMs: 0, categoryId: null, name: 'Categoria', ...overrides })
}

const defaultProps = {
  item: createItem(),
  index: 0,
  selected: false,
  startLabel: '10:00',
  durationLabel: '5:00',
  linked: false,
  indeterminate: false,
  sectionInProgress: false,
  sectionWaiting: false,
  collapsible: false,
  collapsed: false,
  childCount: 0,
  reorderActive: false,
  isDragSource: false,
  deletionLocked: false,
  hasInstrumental: false,
  musicBusy: false,
}

function createWrapper(props = {}) {
  return mount(LiturgyTimelineItem, {
    props: { ...defaultProps, ...props },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyTimelineItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza item music básico', () => {
    const wrapper = createWrapper({ item: createItem({ type: 'music' }) })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).toContain('Item Teste')
  })

  it('renderiza categoria', () => {
    const wrapper = createWrapper({ item: createCategory(), collapsible: true, childCount: 3 })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).toContain('Categoria')
  })

  describe('computeds', () => {
    it('isCategory true para type=category', () => {
      const wrapper = createWrapper({ item: createCategory() })
      expect(wrapper.vm.isCategory).toBe(true)
    })

    it('isCategory false para type=music', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music' }) })
      expect(wrapper.vm.isCategory).toBe(false)
    })

    it('isLinked true quando linked=true', () => {
      const wrapper = createWrapper({ linked: true })
      expect(wrapper.vm.isLinked).toBe(true)
    })

    it('executable true para tipos executáveis', () => {
      for (const type of ['music', 'verse', 'audio', 'video', 'images', 'pdf', 'presentation', 'online_video', 'site'] as const) {
        const wrapper = createWrapper({ item: createItem({ type }) })
        expect(wrapper.vm.executable).toBe(true)
      }
    })

    it('executable false para category e outros_files fora da lista', () => {
      const wrapper = createWrapper({ item: createCategory() })
      expect(wrapper.vm.executable).toBe(false)
    })

    it('isMusicItem true para music com musicId', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music', musicId: 1 }) })
      expect(wrapper.vm.isMusicItem).toBe(true)
    })

    it('isMusicItem false para music sem musicId', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music', musicId: null }) })
      expect(wrapper.vm.isMusicItem).toBe(false)
    })

    it('isMusicItem false para não-music', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'images' }) })
      expect(wrapper.vm.isMusicItem).toBe(false)
    })

    it('categoryTimeRange formata start-end', () => {
      const wrapper = createWrapper({ item: createItem({ startTime: '10:00', endTime: '10:05' }) })
      expect(wrapper.vm.categoryTimeRange).toBe('10:00 - 10:05')
    })

    it('categoryTimeRange só start', () => {
      const wrapper = createWrapper({ item: createItem({ startTime: '10:00', endTime: '' }) })
      expect(wrapper.vm.categoryTimeRange).toBe('10:00')
    })

    it('categoryTimeRange só end', () => {
      const wrapper = createWrapper({ item: createItem({ startTime: '', endTime: '10:05' }) })
      expect(wrapper.vm.categoryTimeRange).toBe('10:05')
    })

    it('categoryTimeRange fallback —', () => {
      const wrapper = createWrapper({ item: createItem({ startTime: '', endTime: '' }) })
      expect(wrapper.vm.categoryTimeRange).toBe('—')
    })

    it('isStreamVideo true para online_video', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'online_video' }) })
      expect(wrapper.vm.isStreamVideo).toBe(true)
    })

    it('isStreamVideo false para video local', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'video' }) })
      expect(wrapper.vm.isStreamVideo).toBe(false)
    })

    it('isLocalMediaUpload true para video/audio com filePath', () => {
      for (const type of ['video', 'audio'] as const) {
        const wrapper = createWrapper({ item: createItem({ type, filePath: '/a.mp4' }) })
        expect(wrapper.vm.isLocalMediaUpload).toBe(true)
      }
    })

    it('isLocalMediaUpload true para video/audio com id em browser', () => {
      for (const type of ['video', 'audio'] as const) {
        const wrapper = createWrapper({ item: createItem({ type, id: '1', filePath: '', filePaths: [] }) })
        expect(wrapper.vm.isLocalMediaUpload).toBe(true)
      }
    })
  })

  describe('emits', () => {
    it('emite toggleDone ao mudar o checkbox', async () => {
      const wrapper = createWrapper()
      await wrapper.find('input[type="checkbox"]').trigger('change')
      expect(wrapper.emitted('toggleDone')).toBeTruthy()
    })

    it('emite playScreens', async () => {
      const wrapper = createWrapper()
      await wrapper.vm.$emit('playScreens')
      expect(wrapper.emitted('playScreens')).toBeTruthy()
    })

    it('emite edit', async () => {
      const wrapper = createWrapper()
      await wrapper.vm.$emit('edit')
      expect(wrapper.emitted('edit')).toBeTruthy()
    })

    it('emite remove', async () => {
      const wrapper = createWrapper()
      await wrapper.vm.$emit('remove')
      expect(wrapper.emitted('remove')).toBeTruthy()
    })

    it('emite toggleDone', async () => {
      const wrapper = createWrapper()
      await wrapper.vm.$emit('toggleDone')
      expect(wrapper.emitted('toggleDone')).toBeTruthy()
    })

    it('emite toggleCollapse', async () => {
      const wrapper = createWrapper({ collapsible: true })
      await wrapper.vm.$emit('toggleCollapse')
      expect(wrapper.emitted('toggleCollapse')).toBeTruthy()
    })

    it('emite addSubItem', async () => {
      const wrapper = createWrapper({ item: createCategory() })
      await wrapper.vm.$emit('addSubItem')
      expect(wrapper.emitted('addSubItem')).toBeTruthy()
    })

    it('emite musicSung', async () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music' }) })
      await wrapper.vm.$emit('musicSung')
      expect(wrapper.emitted('musicSung')).toBeTruthy()
    })

    it('emite musicInstrumental', async () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music', hasInstrumental: true }) })
      await wrapper.vm.$emit('musicInstrumental')
      expect(wrapper.emitted('musicInstrumental')).toBeTruthy()
    })

    it('emite musicSlides', async () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music' }) })
      await wrapper.vm.$emit('musicSlides')
      expect(wrapper.emitted('musicSlides')).toBeTruthy()
    })

    it('emite musicLyric', async () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music' }) })
      await wrapper.vm.$emit('musicLyric')
      expect(wrapper.emitted('musicLyric')).toBeTruthy()
    })

    it('emite setPlayer com playerId', async () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music' }) })
      await wrapper.vm.$emit('setPlayer', 'player-1')
      expect(wrapper.emitted('setPlayer')?.[0]).toEqual(['player-1'])
    })

    it('emite videoFileSelected com durationSec', async () => {
      const wrapper = createWrapper({ item: createItem({ type: 'video' }) })
      await wrapper.vm.$emit('videoFileSelected', 30)
      expect(wrapper.emitted('videoFileSelected')?.[0]).toEqual([30])
    })

    it('emite dragStart', async () => {
      const wrapper = createWrapper()
      await wrapper.vm.$emit('dragStart', 0)
      expect(wrapper.emitted('dragStart')?.[0]).toEqual([0])
    })

    it('emite dragEnd', async () => {
      const wrapper = createWrapper()
      await wrapper.vm.$emit('dragEnd')
      expect(wrapper.emitted('dragEnd')).toBeTruthy()
    })

    it('emite drop', async () => {
      const wrapper = createWrapper()
      await wrapper.vm.$emit('drop', 1)
      expect(wrapper.emitted('drop')?.[0]).toEqual([1])
    })
  })

  describe('renderização condicional', () => {
    it('mostra MusicTrackActions para music', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'music', musicId: 1 }) })
      expect(wrapper.find('[data-testid="music-track-actions"]').exists()).toBe(true)
    })

    it('não mostra MusicTrackActions para não-music', () => {
      const wrapper = createWrapper({ item: createItem({ type: 'images' }) })
      expect(wrapper.find('[data-testid="music-track-actions"]').exists()).toBe(false)
    })

    it('classe selected quando selected=true (showInProgress)', () => {
      const wrapper = createWrapper({ selected: true })
      expect(wrapper.classes()).toContain('liturgy-item--selected')
    })

    it('classe done quando item.done', () => {
      const wrapper = createWrapper({ item: createItem({ done: true }) })
      expect(wrapper.classes()).toContain('liturgy-item--done')
    })

    it('classe drag-source quando isDragSource', () => {
      const wrapper = createWrapper({ isDragSource: true })
      expect(wrapper.classes()).toContain('liturgy-item--drag-source')
    })

    it('classe dimmed quando reorderActive sem ser drag source', () => {
      const wrapper = createWrapper({ reorderActive: true, isDragSource: false })
      expect(wrapper.classes()).toContain('liturgy-item--dimmed')
    })

    it('classe waiting para categoria com sectionWaiting', () => {
      const wrapper = createWrapper({ item: createCategory(), sectionWaiting: true })
      expect(wrapper.classes()).toContain('liturgy-item--waiting')
    })

    it('status "Em andamento" para categoria sectionInProgress', () => {
      const wrapper = createWrapper({ item: createCategory(), sectionInProgress: true })
      expect(wrapper.text()).toContain('Em andamento')
    })

    it('status "Aguardando" para categoria sectionWaiting', () => {
      const wrapper = createWrapper({ item: createCategory(), sectionWaiting: true })
      expect(wrapper.text()).toContain('Aguardando')
    })

    it('status "Concluído" quando done', () => {
      const wrapper = createWrapper({ item: createItem({ done: true }) })
      expect(wrapper.text()).toContain('Concluído')
    })

    it('sem status quando nem done/inProgress/waiting', () => {
      const wrapper = createWrapper({ item: createItem({ done: false }) })
      expect(wrapper.text()).not.toContain('Concluído')
    })

    it('drop no root emite drop com index', async () => {
      const wrapper = createWrapper({ index: 2 })
      await wrapper.find('.liturgy-item').trigger('drop')
      expect(wrapper.emitted('drop')?.[0]).toEqual([2])
    })
  })
})