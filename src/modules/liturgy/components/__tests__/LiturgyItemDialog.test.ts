// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import LiturgyItemDialog from '../LiturgyItemDialog.vue'
import liturgyLocale from '../../locales/pt-BR'

// Mocks dos serviços/dependencies
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
  isDesktopApp: vi.fn(() => false),
}))

vi.mock('../services/media-probe', () => ({
  probeMediaDurationMs: vi.fn(() => Promise.resolve(0)),
}))

vi.mock('../composables/useExternalPlayerChoices', () => ({
  useExternalPlayerChoices: () => ({ choices: [] }),
}))

vi.mock('../services/liturgy-item-helpers', () => ({
  formatMomentDuration: vi.fn((ms: number) => `${ms}ms`),
  isLiturgyItemDraftValid: vi.fn(() => true),
  isValidLiturgyUrl: vi.fn((url: string) => url.startsWith('http')),
}))

vi.mock('../services/liturgy-format', () => ({
  normalizeLiturgyTimeHHmm: vi.fn((time: string) => (time ? time.trim() : '')),
}))

// Mock dos types/consts — apenas valores runtime
vi.mock('../types/liturgy', () => ({
  DEFAULT_MOMENT_DURATION_MS: 300000,
  MOMENT_DURATION_MIN_MS: 60000,
  MOMENT_DURATION_MAX_MS: 7200000,
  MOMENT_DURATION_STEP_MS: 30000,
  INTERNAL_FILE_TYPES: ['images', 'audio', 'video', 'pdf', 'presentation'],
  LITURGY_TYPE_GROUPS: [
    { id: 'basics', labelKey: 'liturgy.dialog.groups.basics', toneClass: 'primary', types: [
      { value: 'category', dot: '#607d8b' },
      { value: 'music', dot: '#ff9800' },
      { value: 'verse', dot: '#9ecaff' },
    ]},
    { id: 'media', labelKey: 'liturgy.dialog.groups.media', toneClass: 'secondary', types: [
      { value: 'images', dot: '#4caf50' },
      { value: 'audio', dot: '#2196f3' },
      { value: 'video', dot: '#9c27b0' },
      { value: 'pdf', dot: '#f44336' },
      { value: 'presentation', dot: '#673ab7' },
    ]},
    { id: 'web', labelKey: 'liturgy.dialog.groups.web', toneClass: 'accent', types: [
      { value: 'site', dot: '#00bcd4' },
      { value: 'online_video', dot: '#009688' },
    ]},
  ],
  getTypeDotColor: vi.fn((t: string) => {
    const map: Record<string, string> = {
      category: '#607d8b', music: '#ff9800', verse: '#9ecaff',
      images: '#4caf50', audio: '#2196f3', video: '#9c27b0',
      pdf: '#f44336', presentation: '#673ab7', site: '#00bcd4', online_video: '#009688'
    }
    return map[t] || '#000'
  }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': liturgyLocale },
})

const defaultProps = {
  open: true,
  draft: {
    type: null,
    name: '',
    durationMs: 300000,
    categoryId: null,
    filePath: '',
    filePaths: [],
    musicId: null,
    url: '',
    accentColor: '#000',
  },
  isEditing: false,
  isValid: true,
  categoryOptions: [{ id: 'cat1', name: 'Categoria 1' }],
  complementaryTitleSuggestions: [],
  musicOptions: [{ id: 1, title: 'Música 1', album: 'Álbum 1' }],
  musicQuery: '',
  musicCatalogEmpty: false,
  selectedMusic: null,
}

function createWrapper(props = {}) {
  return mount(LiturgyItemDialog, {
    props: { ...defaultProps, ...props },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyItemDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza sem erros quando open=true', () => {
    const wrapper = createWrapper({ open: true })
    expect(wrapper.exists()).toBe(true)
  })

  it('watcher open=false reseta validação (via reabertura limpa)', async () => {
    const wrapper = createWrapper({ open: true })
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    // watcher de open reseta filePickerError na abertura — componente segue montado sem erros
    expect(wrapper.exists()).toBe(true)
  })

  describe('selectedFilePaths computed', () => {
    it('retorna filePaths do draft quando existe', () => {
      const wrapper = createWrapper({
        draft: {
          ...defaultProps.draft,
          filePaths: ['/file1.mp3', '/file2.mp3'],
        },
      })
      expect(wrapper.vm.selectedFilePaths).toEqual(['/file1.mp3', '/file2.mp3'])
    })

    it('retorna single trimmed filePath se filePaths estiver vazio', () => {
      const wrapper = createWrapper({
        draft: {
          ...defaultProps.draft,
          filePaths: [],
          filePath: '  /single.mp3  ',
        },
      })
      expect(wrapper.vm.selectedFilePaths).toEqual(['/single.mp3'])
    })

    it('retorna array vazio quando ambos filePaths e filePath vazios', () => {
      const wrapper = createWrapper({
        draft: {
          ...defaultProps.draft,
          filePaths: [],
          filePath: '',
        },
      })
      expect(wrapper.vm.selectedFilePaths).toEqual([])
    })
  })

  describe('validações computadas', () => {
    it('musicRequiredMissing: true quando type=music e musicId=null', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'music', musicId: null },
      })
      expect(wrapper.vm.musicRequiredMissing).toBe(true)
    })

    it('musicRequiredMissing: false quando type=music e musicId setado', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'music', musicId: 1 },
      })
      expect(wrapper.vm.musicRequiredMissing).toBe(false)
    })

    it('musicRequiredMissing: false quando type não é music', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'images', musicId: null },
      })
      expect(wrapper.vm.musicRequiredMissing).toBe(false)
    })

    it('nameRequiredMissing: true quando name vazio', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, name: '' },
      })
      expect(wrapper.vm.nameRequiredMissing).toBe(true)
    })

    it('nameRequiredMissing: false quando name preenchido', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, name: 'Nome' },
      })
      expect(wrapper.vm.nameRequiredMissing).toBe(false)
    })

    it('startTimeRequiredMissing: true para category com startTime inválido', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'category', startTime: 'invalid' },
      })
      expect(wrapper.vm.startTimeRequiredMissing).toBe(true)
    })

    it('startTimeRequiredMissing: false para category com startTime válido', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'category', startTime: '10:00' },
      })
      expect(wrapper.vm.startTimeRequiredMissing).toBe(false)
    })

    it('categoryRequiredMissing: true quando tem tipo mas sem categoryId', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'music', categoryId: null },
      })
      expect(wrapper.vm.categoryRequiredMissing).toBe(true)
    })

    it('categoryRequiredMissing: false quando categoryId setado', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'music', categoryId: 'cat1' },
      })
      expect(wrapper.vm.categoryRequiredMissing).toBe(false)
    })

    it('categoryRequiredMissing: false quando tipo é category', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'category', categoryId: null },
      })
      expect(wrapper.vm.categoryRequiredMissing).toBe(false)
    })

    it('urlRequiredMissing: true para site com url inválida', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'site', url: 'not-a-url' },
      })
      expect(wrapper.vm.urlRequiredMissing).toBe(true)
    })

    it('urlRequiredMissing: false para site com url válida', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'site', url: 'https://exemplo.com' },
      })
      expect(wrapper.vm.urlRequiredMissing).toBe(false)
    })

    it('urlRequiredMissing: false quando tipo não usa url', () => {
      const wrapper = createWrapper({
        draft: { ...defaultProps.draft, type: 'music', url: '' },
      })
      expect(wrapper.vm.urlRequiredMissing).toBe(false)
    })
  })

  describe('computed de UI', () => {
    it('fileButtonLabel varia por tipo e presença de arquivo', () => {
      const types = ['images', 'audio', 'video', 'pdf', 'presentation'] as const
      for (const type of types) {
        const wEmpty = createWrapper({ draft: { ...defaultProps.draft, type, filePaths: [] } })
        expect(wEmpty.vm.fileButtonLabel).toContain('Selecione')
        const wFull = createWrapper({ draft: { ...defaultProps.draft, type, filePaths: ['/a.pdf'] } })
        expect(wFull.vm.fileButtonLabel).toContain('Trocar')
      }
    })

    it('showFilePath true para tipos internos', () => {
      for (const type of ['images', 'audio', 'video', 'pdf', 'presentation'] as const) {
        const wrapper = createWrapper({ draft: { ...defaultProps.draft, type } })
        expect(wrapper.vm.showFilePath).toBe(true)
      }
    })

    it('showFilePath false para tipos sem arquivo', () => {
      for (const type of ['music', 'verse', 'site', 'online_video', 'category'] as const) {
        const wrapper = createWrapper({ draft: { ...defaultProps.draft, type } })
        expect(wrapper.vm.showFilePath).toBe(false)
      }
    })

    it('showUrl true para site e online_video', () => {
      for (const type of ['site', 'online_video'] as const) {
        const wrapper = createWrapper({ draft: { ...defaultProps.draft, type } })
        expect(wrapper.vm.showUrl).toBe(true)
      }
    })

    it('showUrl false para outros tipos', () => {
      for (const type of ['music', 'images', 'category'] as const) {
        const wrapper = createWrapper({ draft: { ...defaultProps.draft, type } })
        expect(wrapper.vm.showUrl).toBe(false)
      }
    })

    it('momentNameLabel varia por tipo', () => {
      const cat = createWrapper({ draft: { ...defaultProps.draft, type: 'category' } })
      expect(cat.vm.momentNameLabel).toBe(cat.vm.t('liturgy.dialog.categoryMomentName'))

      const mus = createWrapper({ draft: { ...defaultProps.draft, type: 'music' } })
      expect(mus.vm.momentNameLabel).toBe(mus.vm.t('liturgy.dialog.complementaryTitle'))

      const other = createWrapper({ draft: { ...defaultProps.draft, type: 'images' } })
      expect(other.vm.momentNameLabel).toBe(other.vm.t('liturgy.dialog.momentName'))
    })

    it('dialogTitle varia por props', () => {
      expect(createWrapper({ isEditing: true, draft: { ...defaultProps.draft, type: 'category' } }).vm.dialogTitle)
        .toBe(i18n.global.t('liturgy.dialog.editCategoryTitle'))
      expect(createWrapper({ isEditing: true }).vm.dialogTitle).toBe(i18n.global.t('liturgy.dialog.editTitle'))
      expect(createWrapper({ lockCategory: true }).vm.dialogTitle).toBe(i18n.global.t('liturgy.dialog.addSubItemTitle'))
      expect(createWrapper({ hideTypePicker: true }).vm.dialogTitle).toBe(i18n.global.t('liturgy.dialog.addCategoryTitle'))
      expect(createWrapper({}).vm.dialogTitle).toBe(i18n.global.t('liturgy.dialog.title'))
    })
  })

  describe('typeGroups', () => {
    it('filtra category quando lockCategory=true', () => {
      const wrapper = createWrapper({ lockCategory: true, draft: { ...defaultProps.draft } })
      const groups = wrapper.vm.typeGroups
      for (const g of groups) {
        for (const t of g.types) {
          expect(t.value).not.toBe('category')
        }
      }
    })

    it('inclui grupo legacy verse quando draft.type === verse', () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'verse' } })
      const groups = wrapper.vm.typeGroups
      const legacy = groups.find(g => g.id === 'legacy')
      expect(legacy).toBeDefined()
      expect(legacy!.types[0].value).toBe('verse')
    })

    it('não inclui legacy quando type != verse', () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'music' } })
      const legacy = wrapper.vm.typeGroups.find(g => g.id === 'legacy')
      expect(legacy).toBeUndefined()
    })
  })

  describe('métodos', () => {
    it('patch emite update:draft com merge', () => {
      const wrapper = createWrapper()
      wrapper.vm.patch({ name: 'Novo', durationMs: 123 })
      expect(wrapper.emitted('update:draft')?.[0]).toEqual([{ ...defaultProps.draft, name: 'Novo', durationMs: 123 }])
    })

    it('selectType ignora category quando lockCategory', () => {
      const wrapper = createWrapper({ lockCategory: true, draft: { ...defaultProps.draft, type: null } })
      wrapper.vm.selectType('category')
      expect(wrapper.emitted('update:draft')).toBeUndefined()
    })

    it('selectType emite update:draft com type, accentColor, reseta duration/category se category', () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'music', durationMs: 1000, categoryId: 'cat1' } })
      wrapper.vm.selectType('category')
      const emitted = wrapper.emitted('update:draft')?.[0][0] as typeof defaultProps.draft
      expect(emitted.type).toBe('category')
      expect(emitted.durationMs).toBe(0)
      expect(emitted.categoryId).toBeNull()
    })

    it('selectType emite duration default se vindo de category', () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'category', durationMs: 123 } })
      wrapper.vm.selectType('music')
      const emitted = wrapper.emitted('update:draft')?.[0][0] as typeof defaultProps.draft
      expect(emitted.type).toBe('music')
      expect(emitted.durationMs).toBeGreaterThan(0)
    })
  })

  describe('watchers', () => {
    it('watcher type change reseta showValidation', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'music' } })
      wrapper.vm.showValidation = true
      await wrapper.setProps({ draft: { ...defaultProps.draft, type: 'images' } })
      expect(wrapper.vm.showValidation).toBe(false)
    })
  })
})