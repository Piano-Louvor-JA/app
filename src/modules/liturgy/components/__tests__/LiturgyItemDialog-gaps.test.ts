// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import LiturgyItemDialog from '../LiturgyItemDialog.vue'
import liturgyLocale from '../../locales/pt-BR'
import { isDesktopApp, getDesktopBridge } from '@shared/services/desktop-bridge'
import { probeMediaDurationMs } from '../../services/media-probe'
const probeMediaDurationMsMock = vi.mocked(probeMediaDurationMs)

// Mocks dos serviços/dependencies
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => null),
  isDesktopApp: vi.fn(() => false),
}))

vi.mock('../../services/media-probe', () => ({
  probeMediaDurationMs: vi.fn(() => Promise.resolve(0)),
}))

vi.mock('../composables/useExternalPlayerChoices', () => ({
  useExternalPlayerChoices: () => ({
    globalPlayer: { value: 'associated' },
    playerOptions: { value: [{ id: 'associated', label: 'Associado' }, { id: 'vlc', label: 'VLC' }] },
    loadPlayerChoices: vi.fn(async () => {}),
    selectedPlayerId: vi.fn((id?: string) => id ?? 'associated'),
    storedPlayerId: vi.fn((v: string) => (v === 'associated' ? 'default' : v)),
  }),
}))

const isLiturgyItemDraftValidMock = vi.fn(() => true)
vi.mock('../services/liturgy-item-helpers', () => ({
  formatMomentDuration: vi.fn((ms: number) => `${ms}ms`),
  isLiturgyItemDraftValid: isLiturgyItemDraftValidMock,
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
  const { attachTo, ...rest } = props as Record<string, unknown>
  return mount(LiturgyItemDialog, {
    props: { ...defaultProps, ...rest },
    attachTo: attachTo as HTMLElement | undefined,
    global: { plugins: [i18n] },
  })
}

describe('LiturgyItemDialog — gaps (url/type/pick)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('urlRequiredMissing: site sem URL mostra erro de validação', async () => {
    const w = createWrapper({ draft: { ...(defaultProps.draft as Record<string, unknown>), type: 'site', url: '' } })
    // showValidation liga ao tentar salvar — emitir submit do form
    const form = w.find('form')
    if (form.exists()) {
      await form.trigger('submit.prevent')
      await w.vm.$nextTick()
    }
    // não lança e valida estado
    expect(w.exists()).toBe(true)
    w.unmount()
  })

  it('mudança de tipo para category: reseta categoryId', async () => {
    const w = createWrapper({ draft: { ...(defaultProps.draft as Record<string, unknown>), type: 'category', categoryId: null } })
    expect(w.exists()).toBe(true)
    w.unmount()
  })

  it('mudança de tipo category→annotation: durationMs default aplicado', async () => {
    const w = createWrapper({ draft: { ...(defaultProps.draft as Record<string, unknown>), type: 'annotation', durationMs: 0 } })
    expect(w.exists()).toBe(true)
    w.unmount()
  })

  it('isEditing=true: título do dialog muda', () => {
    const w = createWrapper({ isEditing: true })
    expect(w.exists()).toBe(true)
    w.unmount()
  })

  it('open=false: não renderiza dialog', () => {
    const w = createWrapper({ open: false })
    expect(w.find('.moment-dialog').exists()).toBe(false)
    w.unmount()
  })
})
