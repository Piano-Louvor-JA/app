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
  })
})