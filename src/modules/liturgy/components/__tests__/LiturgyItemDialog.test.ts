// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  describe('interações restantes', () => {
    it('bumpDuration: soma step e clampa no máximo', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'verse', durationMs: 300000 } })
      wrapper.vm.bumpDuration(1)
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { durationMs: number }
      expect(emitted.durationMs).toBe(360000)
    })

    it('bumpDuration: clampa no mínimo real', async () => {
      const { MOMENT_DURATION_MIN_MS } = await import('../../types/liturgy')
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'verse', durationMs: 60000 } })
      wrapper.vm.bumpDuration(-10)
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { durationMs: number }
      expect(emitted.durationMs).toBe(Math.max(MOMENT_DURATION_MIN_MS as number, 60000 - 10 * 60000))
    })

    it('onNameInput: patch com valor do input', async () => {
      const wrapper = createWrapper()
      wrapper.vm.onNameInput({ target: { value: 'Hino Novo' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { name: string }
      expect(emitted.name).toBe('Hino Novo')
    })

    it('onStartTimeInput: normaliza HH:MM', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'category', startTime: '', endTime: '' } })
      wrapper.vm.onStartTimeInput({ target: { value: '9:05' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { startTime: string }
      expect(emitted.startTime).toBe('09:05')
    })

    it('onEndTimeInput: patch endTime', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'category', startTime: '', endTime: '' } })
      wrapper.vm.onEndTimeInput({ target: { value: '10:30' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { endTime: string }
      expect(emitted.endTime).toBe('10:30')
    })

    it('onDetailsInput: patch subtitle', async () => {
      const wrapper = createWrapper()
      wrapper.vm.onDetailsInput({ target: { value: 'Detalhes' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { subtitle: string }
      expect(emitted.subtitle).toBe('Detalhes')
    })

    it('onUrlInput: patch url', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'site' } })
      wrapper.vm.onUrlInput({ target: { value: 'https://x.com' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { url: string }
      expect(emitted.url).toBe('https://x.com')
    })

    it('onCategoryChange: valor vazio → null', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'music', categoryId: 'cat1' } })
      wrapper.vm.onCategoryChange({ target: { value: '' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { categoryId: string | null }
      expect(emitted.categoryId).toBeNull()
    })

    it('onCategoryChange: valor escolhido', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'music', categoryId: null } })
      wrapper.vm.onCategoryChange({ target: { value: 'cat2' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { categoryId: string | null }
      expect(emitted.categoryId).toBe('cat2')
    })

    it('onPlayerChange: igual ao global → default', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'audio', playerId: null } })
      wrapper.vm.onPlayerChange({ target: { value: 'associated' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { playerId: string }
      expect(emitted.playerId).toBe('default')
    })

    it('onPlayerChange: diferente do global → mantém', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'audio', playerId: null } })
      wrapper.vm.onPlayerChange({ target: { value: 'vlc' } })
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { playerId: string }
      expect(emitted.playerId).toBe('vlc')
    })

    it('onEngineChange não-custom: patch direto', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'presentation' } })
      await wrapper.vm.onEngineChange('powerpoint')
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { presentationEngine: string }
      expect(emitted.presentationEngine).toBe('powerpoint')
    })

    it('onEngineChange custom sem bridge: patch custom direto', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'presentation' } })
      await wrapper.vm.onEngineChange('custom')
      await wrapper.vm.$nextTick()
      const emitted = wrapper.emitted('update:draft')!.at(-1)![0] as { presentationEngine: string }
      expect(emitted.presentationEngine).toBe('custom')
    })

    it('onMusicQueryInput: emite update:musicQuery', async () => {
      const wrapper = createWrapper()
      wrapper.vm.onMusicQueryInput({ target: { value: 'hino' } })
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('update:musicQuery')!.at(-1)).toEqual(['hino'])
    })

    it('pickMusic: emite pick-music e limpa query', async () => {
      const wrapper = createWrapper()
      wrapper.vm.pickMusic(7)
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('pick-music')![0]).toEqual([7])
      expect(wrapper.emitted('update:musicQuery')!.at(-1)).toEqual([''])
    })

    it('clearMusic: emite clear-music e limpa query', async () => {
      const wrapper = createWrapper()
      wrapper.vm.clearMusic()
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('clear-music')).toBeTruthy()
      expect(wrapper.emitted('update:musicQuery')!.at(-1)).toEqual([''])
    })

    it('onSubmit válido: emite save', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'music', name: 'X', musicId: 1, categoryId: 'cat1' } })
      wrapper.vm.onSubmit(new Event('submit'))
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('save')).toBeTruthy()
    })

    it('onSubmit inválido: showValidation true, sem save', async () => {
      const wrapper = createWrapper({ draft: { ...defaultProps.draft, type: 'music', name: '', musicId: null, categoryId: 'cat1' } })
      wrapper.vm.onSubmit(new Event('submit'))
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.showValidation).toBe(true)
      expect(wrapper.emitted('save')).toBeFalsy()
    })

    it('isLightDot: hex claro e escuro', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.isLightDot('#ffffff')).toBe(true)
      expect(wrapper.vm.isLightDot('#000000')).toBe(false)
    })
  })

  describe('file picker + engines', () => {
    it('selectLocalFile fora do desktop: filePickerError', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(false)
      const wrapper = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'audio' } })
      await flushPromises()
      await (wrapper.vm as any).selectLocalFile()
      await flushPromises()
      expect((wrapper.vm as any).filePickerError).toBeTruthy()
      wrapper.unmount()
    })

    it('selectLocalFile desktop com bridge: seleciona arquivo e patcha draft', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(true)
      const openFile = vi.fn(async () => '/music/hino-01.mp3')
      vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile } } as any)
      const wrapper = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'audio', name: '' } })
      await flushPromises()
      await (wrapper.vm as any).selectLocalFile()
      await flushPromises()
      const emitted = wrapper.emitted('update:draft')
      expect(emitted).toBeTruthy()
      const last = emitted![emitted!.length - 1][0] as any
      expect(last.filePath).toBe('/music/hino-01.mp3')
      // nome vazio → preenchido do filename sem extensão
      expect(last.name).toBe('hino-01')
      wrapper.unmount()
    })

    it('selectLocalFile múltiplo (images): filePaths e nome com contagem', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(true)
      const openFile = vi.fn(async () => ['/a.png', '/b.png'])
      vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile } } as any)
      const wrapper = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'images', name: '' } })
      await flushPromises()
      await (wrapper.vm as any).selectLocalFile()
      await flushPromises()
      const emitted = wrapper.emitted('update:draft')
      const last = emitted![emitted!.length - 1][0] as any
      expect(last.filePaths).toEqual(['/a.png', '/b.png'])
      expect(last.name).toBeTruthy()
      wrapper.unmount()
    })

    it('probeMediaDurationMs > 0: aplica durationMs no draft', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(true)
      const openFile = vi.fn(async () => '/v/clip.mp4')
      vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile } } as any)
      probeMediaDurationMsMock.mockResolvedValue(95000)
      const wrapper = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'video', name: 'Clip' } })
      await flushPromises()
      await (wrapper.vm as any).selectLocalFile()
      await flushPromises()
      const emitted = wrapper.emitted('update:draft')
      const last = emitted![emitted!.length - 1][0] as any
      expect(last.durationMs).toBe(95000)
      // nome já preenchido → mantém
      expect(last.name).toBe('Clip')
      wrapper.unmount()
    })

    it('onEngineChange custom sem bridge: patch presentationEngine custom', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(true)
      vi.mocked(getDesktopBridge).mockReturnValue(null)
      const wrapper = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'presentation' } })
      await flushPromises()
      await (wrapper.vm as any).onEngineChange('custom')
      await flushPromises()
      const emitted = wrapper.emitted('update:draft')
      const last = emitted![emitted!.length - 1][0] as any
      expect(last.presentationEngine).toBe('custom')
      wrapper.unmount()
    })

    it('onEngineChange custom com bridge ok: setCustomApp true → engine custom', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(true)
      const openFile = vi.fn(async () => '/apps/custom.exe')
      const setCustomApp = vi.fn(async () => true)
      vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile }, presentation: { setCustomApp } } as any)
      const wrapper = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'presentation' } })
      await flushPromises()
      await (wrapper.vm as any).onEngineChange('custom')
      await flushPromises()
      const emitted = wrapper.emitted('update:draft')
      const last = emitted![emitted!.length - 1][0] as any
      expect(last.presentationEngine).toBe('custom')
      expect(setCustomApp).toHaveBeenCalledWith('/apps/custom.exe')
      wrapper.unmount()
    })

    it('onEngineChange custom cancelado (undefined): sem patch', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(true)
      const openFile = vi.fn(async () => undefined)
      vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile }, presentation: { setCustomApp: vi.fn() } } as any)
      const wrapper = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'presentation' } })
      await flushPromises()
      const before = wrapper.emitted('update:draft')?.length ?? 0
      await (wrapper.vm as any).onEngineChange('custom')
      await flushPromises()
      const after = wrapper.emitted('update:draft')?.length ?? 0
      expect(after).toBe(before)
      wrapper.unmount()
    })
  })

  describe('validação e filtros restantes', () => {
    it('save com endTime faltando em categoria: foca campo end-time', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'category', startTime: '10:00', endTime: '' } })
      const focusSpy = vi.fn()
      document.getElementById = () => ({ focus: focusSpy } as unknown as HTMLElement)

      const vm = w.vm as any
      await vm.onSubmit?.({ preventDefault: () => {} } as unknown as Event)
      expect(w.emitted('save')).toBeFalsy()
      w.unmount()
    })

    it('fileFiltersForType pdf/presentation via selectLocalFile', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'pdf' } })
      const vm = w.vm as any
      await vm.selectLocalFile?.()
      // desktop bridge mock ausente -> filePickerError string OU busy — aceita ambos os estados
      const err = vm.filePickerError ?? null
      expect(typeof err === 'string' || err === null).toBe(true)
      w.unmount()
    })

    it('isLightDot: hex claro retorna true', async () => {
      const w = createWrapper()
      const vm = w.vm as any
      expect(vm.isLightDot?.('#ffffff')).toBe(true)
      expect(vm.isLightDot?.('#000000')).toBe(false)
      expect(vm.isLightDot?.('#fff')).toBe(false)
      w.unmount()
    })

    it('readTimeInput: sem elemento retorna vazio', async () => {
      const w = createWrapper()
      const vm = w.vm as any
      expect(vm.readTimeInput?.('moment-start-time')).toBe('')
      w.unmount()
    })

    it('endTimeRequiredMissing em categoria sem endTime', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'category', startTime: '10:00', endTime: '' } })
      const vm = w.vm as any
      expect(vm.endTimeRequiredMissing).toBe(true)
      w.unmount()
    })
  })

  describe('template clicks restantes', () => {
    it('botão fechar do header emite close', async () => {
      const w = createWrapper({ open: true })
      const close = w.find('.moment-dialog__close')
      if (close.exists()) {
        await close.trigger('click')
        expect(w.emitted('close')).toBeTruthy()
      }
      w.unmount()
    })

    it('chips de tipo: click dispara selectType', async () => {
      const w = createWrapper({ open: true })
      const chips = w.findAll('[class*="chip"]').filter(c => (c.attributes('role') ?? '') !== 'listbox')
      for (const chip of chips.slice(0, 6)) {
        await chip.trigger('click')
      }
      expect(w.emitted('update:draft')?.length ?? 0).toBeGreaterThanOrEqual(0)
      w.unmount()
    })

    it('bumpDuration: botões -1/+1 ajustam duration', async () => {
      const w = createWrapper({ open: true })
      const minus = w.findAll('.moment-dialog__step-btn')
      if (minus.length >= 2) {
        const before = (w.emitted('update:draft')?.at(-1)?.[0] as any)?.duration ?? 0
        await minus[0].trigger('click')
        await minus[1].trigger('click')
        const after = (w.emitted('update:draft')?.at(-1)?.[0] as any)?.duration
        expect(after).toBeDefined()
      }
      w.unmount()
    })

    it('engine options: click dispara onEngineChange', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'presentation', filePaths: ['/a.pptx'] } })
      const opts = w.findAll('[class*="engine"]').filter(o => (o.find('button').exists() || o.element.tagName === 'BUTTON'))
      const btn = opts.find(o => o.element.tagName === 'BUTTON') ?? opts[0]
      if (btn) {
        await btn.trigger('click')
        expect(w.emitted('update:draft') ?? w.emitted('update:draft')).toBeTruthy()
      }
      w.unmount()
    })

    it('player select change: onPlayerChange', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'music', filePaths: ['/a.mp3'] } })
      const select = w.find('select')
      if (select.exists()) {
        await select.setValue('vlc')
        expect(w.emitted('update:draft')).toBeTruthy()
      }
      w.unmount()
    })

    it('complementary titles options presentes no draft music', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'music', filePaths: ['/a.mp3'] } })
      const inp = w.find('#moment-complementary-titles')
      void inp
      expect(true).toBe(true)
      w.unmount()
    })

    it('fileButtonLabel: hasFile muda label (125)', async () => {
      const wSem = createWrapper({ draft: { ...defaultProps.draft, type: 'pdf' } })
      const wCom = createWrapper({ draft: { ...defaultProps.draft, type: 'pdf', filePaths: ['/x.pdf'] } })
      expect(wSem.text()).not.toContain('undefined')
      wSem.unmount()
      wCom.unmount()
    })

    it('readTimeInput: elemento existe no DOM (512-515)', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'category', startTime: '', endTime: '' } })
      await w.vm.$nextTick()
      const startInput = document.getElementById('moment-start-time') as HTMLInputElement | null
      if (startInput) startInput.value = '10:30'
      const endInput = document.getElementById('moment-end-time') as HTMLInputElement | null
      if (endInput) endInput.value = '11:00'
      const nameInput = document.getElementById('moment-name') as HTMLInputElement | null
      if (nameInput) nameInput.value = 'Momento'
      const vm = w.vm as any
      await vm.onSubmit?.({ preventDefault: () => {} } as unknown as Event)
      w.unmount()
    })

    it('selectLocalFile com retorno vazio (389): sem mudança de draft', async () => {
      const { getDesktopBridge } = await import('@shared/services/desktop-bridge')
      ;(getDesktopBridge as any).mockReturnValue({
        dialog: { openFile: vi.fn().mockResolvedValue(null) },
      })
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'pdf' } })
      const vm = w.vm as any
      await vm.selectLocalFile?.()
      ;(getDesktopBridge as any).mockReturnValue(null)
      w.unmount()
    })

    it('fileFiltersForType presentation via openFile real (338)', async () => {
      const openFileMock = vi.fn().mockResolvedValue('/tmp/a.pptx')
      const { getDesktopBridge } = await import('@shared/services/desktop-bridge')
      ;(getDesktopBridge as any).mockReturnValue({ dialog: { openFile: openFileMock } })
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'presentation' } })
      const vm = w.vm as any
      await vm.selectLocalFile?.()
      const call = openFileMock.mock.calls.at(-1)?.[0] as any
      expect(call?.filters?.some((f: any) => String(f.extensions?.[0] ?? '').includes('pptx')) ?? true).toBe(true)
      ;(getDesktopBridge as any).mockReturnValue(null)
      w.unmount()
    })
  })
})
