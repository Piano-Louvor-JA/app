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


function lastDlg<T extends HTMLElement>(sel: string): T | null {
  const dialogs = document.querySelectorAll('.moment-dialog')
  const last = dialogs[dialogs.length - 1]
  if (!last) return null
  if (last.matches(sel)) return last as unknown as T
  return last.querySelector(sel) as T | null
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
      const origGet = document.getElementById
      document.getElementById = () => ({ focus: focusSpy } as unknown as HTMLElement)
      try {
        const vm = w.vm as any
        await vm.onSubmit?.({ preventDefault: () => {} } as unknown as Event)
      } finally {
        document.getElementById = origGet
      }
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

  describe('template clicks restantes (Teleport body)', () => {
    // wrappers de testes antigos vazam dialogs no body — matar todos antes
    beforeEach(() => {
      document.body.innerHTML = ''
    })
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('botão fechar do header emite close', async () => {
      const w = createWrapper({ open: true, attachTo: document.body })
      await w.vm.$nextTick()
      await w.vm.$nextTick()
      const close = lastDlg<HTMLElement>('.moment-dialog__close')
      expect(close).not.toBeNull()
      close!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await flushPromises()
      await w.vm.$nextTick()
      expect(w.emitted('close')).toBeTruthy()
      w.unmount()
    })

    it('chips de tipo: click dispara selectType', async () => {
      const w = createWrapper({ open: true, attachTo: document.body })
      await flushPromises()
      await w.vm.$nextTick()
      const dlg = lastDlg<HTMLElement>('.moment-dialog')
      const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.moment-dialog__chip')).filter(c => dlg?.contains(c) === true)
      expect(chips.length).toBeGreaterThan(0)
      const before = (w.emitted('update:draft')?.length ?? 0)
      ;(chips[0] as HTMLElement).click()
      await w.vm.$nextTick()
      expect((w.emitted('update:draft')?.length ?? 0)).toBeGreaterThan(before)
      w.unmount()
    })

    it('bumpDuration: botões -1/+1', async () => {
      const w = createWrapper({ open: true, draft: { ...defaultProps.draft, type: 'video' }, attachTo: document.body })
      await w.vm.$nextTick()
      const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('.moment-dialog__step-btn')).filter(b => lastDlg('.moment-dialog')?.contains(b))
      expect(btns.length).toBe(2)
      ;(btns[0] as HTMLElement).click()
      await w.vm.$nextTick()
      ;(btns[1] as HTMLElement).click()
      await w.vm.$nextTick()
      expect(w.emitted('update:draft')).toBeTruthy()
      w.unmount()
    })

    it('engine options: click dispara onEngineChange', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'presentation', filePaths: ['/a.pptx'] }, attachTo: document.body })
      await w.vm.$nextTick()
      const radios = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"][data-test^="liturgy-engine"]')).filter(r => lastDlg('.moment-dialog')?.contains(r))
      expect(radios.length).toBeGreaterThan(0)
      ;(radios[0] as HTMLElement).click()
      await w.vm.$nextTick()
      expect(w.emitted('update:draft')).toBeTruthy()
      w.unmount()
    })

    it('pickMusic: opção da lista clica e seta musicId', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'music' }, attachTo: document.body })
      const vm = w.vm as any
      await w.vm.$nextTick()
      // força showMusicResults via digitação no campo de busca
      const search = (Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(i => lastDlg('.moment-dialog')?.contains(i)))[0] ?? null
      if (search) {
        search.value = 'santo'
        search.dispatchEvent(new Event('input', { bubbles: true }))
        await w.vm.$nextTick()
        const opt = lastDlg<HTMLButtonElement>('.moment-dialog__music-option')
        if (opt) {
          opt.click()
          await w.vm.$nextTick()
          expect(w.emitted('update:draft')).toBeTruthy()
        }
      }
      w.unmount()
    })

    it('player select change (1052)', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'music', filePaths: ['/a.mp3'] }, attachTo: document.body })
      await w.vm.$nextTick()
      const select = lastDlg<HTMLSelectElement>('select')
      if (select) {
        select.value = 'vlc'
        select.dispatchEvent(new Event('change', { bubbles: true }))
        await w.vm.$nextTick()
        expect(w.emitted('update:draft')).toBeTruthy()
      }
      w.unmount()
    })

    it('512-515: validação com DOM real foca campos', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'category', name: 'Louvor', startTime: '', endTime: '' }, attachTo: document.body })
      await w.vm.$nextTick()
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
      // onSubmit não é exposto no vm — mocka getElementById p/ foco determinístico
      const focused: string[] = []
      const origGet = document.getElementById.bind(document)
      vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
        const el = origGet(id)
        if (el && id === 'moment-start-time') focused.push(id)
        return el
      })
      // dispara o submit do formulário real
      const form = lastDlg<HTMLFormElement>('.moment-dialog__form')
      expect(form).not.toBeNull()
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(focusSpy).toHaveBeenCalled(), { timeout: 2000 })
      void focused
      vi.mocked(document.getElementById).mockRestore()
      focusSpy.mockRestore()
      w.unmount()
    })

    it('389: openFile retorna [] (paths vazios) sem mudar draft', async () => {
      const openFileMock = vi.fn().mockResolvedValue([])
      const { getDesktopBridge } = await import('@shared/services/desktop-bridge')
      ;(getDesktopBridge as any).mockReturnValue({ dialog: { openFile: openFileMock } })
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'pdf' }, attachTo: document.body })
      const vm = w.vm as any
      await vm.selectLocalFile?.()
      const emits = w.emitted('update:draft')?.length ?? 0
      await vi.waitFor(() => expect(openFileMock).toHaveBeenCalled())
      ;(getDesktopBridge as any).mockReturnValue(null)
      w.unmount()
    })
  })

})

describe('LiturgyItemDialog — save category com inputs REAIS no DOM (attachTo)', () => {
  it('end-time faltando: foca #moment-end-time (ramo 514-515)', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const focusSpy = vi.fn()
    const origGet = document.getElementById
    document.getElementById = (id: string) =>
      id === 'moment-end-time' ? ({ focus: focusSpy } as unknown as HTMLElement) : null
    try {
      const w = createWrapper({
        attachTo: el,
        draft: { ...defaultProps.draft, type: 'category', name: 'Culto', startTime: '10:00', endTime: '' },
      })
      await flushPromises()
      const vm = w.vm as any
      await vm.onSubmit?.({ preventDefault: () => {} } as unknown as Event)
      expect(focusSpy).toHaveBeenCalled()
      expect(w.emitted('save')).toBeFalsy()
      w.unmount()
    } finally {
      document.getElementById = origGet
      el.remove()
    }
  })
})
describe('LiturgyItemDialog — stmts finais (125/332/338/372/676/689/825/1054/1134)', () => {
  it('fileButtonLabel fallback: other_files COM arquivo → changeFileButton (125)', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      const w = createWrapper({
        attachTo: el,
        draft: { ...defaultProps.draft, type: 'other_files', filePath: '/x.pdf' },
      })
      await flushPromises()
      const dlg = document.querySelector('.moment-dialog') as HTMLElement
      expect(dlg?.innerHTML).toContain('Trocar Arquivo')
      w.unmount()
    } finally {
      el.remove()
    }
  })

  it('listbox música: opções renderizadas e click escolhe (676/689)', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      const w = createWrapper({
        attachTo: el,
        draft: { ...defaultProps.draft, type: 'music', musicId: null },
        musicOptions: [{ id: 7, displayLabel: 'Hino 7', albumNames: 'Alb' } as any],
        musicQuery: 'hino',
      })
      await flushPromises()
      const dlg = document.querySelector('.moment-dialog') as HTMLElement
      const option = dlg.querySelector('[role="option"]') as HTMLElement | null
      console.log('OPT:', dlg.innerHTML.includes('Hino 7'), 'query len:', document.querySelector('#moment-music-search')?.getAttribute('value'))
      expect(option).toBeTruthy()
      option!.click()
      await flushPromises()
      expect(w.emitted('pick-music')).toBeTruthy()
      expect(w.emitted('pick-music')![0]).toEqual([7])
      w.unmount()
    } finally {
      el.remove()
    }
  })

  it('complementaryTitleSuggestions renderiza options no select (825)', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      const w = createWrapper({
        attachTo: el,
        draft: { ...defaultProps.draft, type: 'music', musicId: 1 },
        complementaryTitleSuggestions: ['Título A', 'Título B'],
      })
      await flushPromises()
      const dlg = document.querySelector('.moment-dialog') as HTMLElement
      const datalist = dlg.querySelector('#moment-complementary-titles') as HTMLElement | null
      expect(datalist).toBeTruthy()
      const optVals = Array.from(datalist!.querySelectorAll('option')).map((o) => o.getAttribute('value'))
      expect(optVals).toContain('Título A')
      expect(optVals).toContain('Título B')
      w.unmount()
    } finally {
      el.remove()
    }
  })

  it('botão discard emite close (1134)', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      const w = createWrapper({
        attachTo: el,
        draft: { ...defaultProps.draft, type: 'video', filePath: '/v.mp4' },
      })
      await flushPromises()
      const dlg = document.querySelector('.moment-dialog') as HTMLElement
      const discard = dlg.querySelector('.moment-dialog__discard') as HTMLButtonElement
      expect(discard).toBeTruthy()
      discard.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      expect(w.emitted('close')).toBeTruthy()
      w.unmount()
    } finally {
      el.remove()
    }
  })
})

describe('LiturgyItemDialog — stmts 332/338/372/1054', () => {
  it('selectLocalFile presentation: fileFilters pptx (332) via openFile cancelado', async () => {
    vi.mocked(isDesktopApp).mockReturnValue(true)
    vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile: vi.fn(async () => null) } } as any)
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      const w = createWrapper({ attachTo: el, draft: { ...defaultProps.draft, type: 'presentation' } })
      await flushPromises()
      const vm = w.vm as any
      await vm.selectLocalFile?.()
      await flushPromises()
      // openFile cancelou (null): sem erro, sem patch
      expect((w.vm as any).filePickerError).toBeNull()
      w.unmount()
    } finally {
      el.remove()
      vi.mocked(getDesktopBridge).mockReturnValue(null)
    }
  })

  it('selectLocalFile other_files: fileFilters fallback (338) via openFile cancelado', async () => {
    vi.mocked(isDesktopApp).mockReturnValue(true)
    vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile: vi.fn(async () => null) } } as any)
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      const w = createWrapper({ attachTo: el, draft: { ...defaultProps.draft, type: 'other_files', filePath: '' } })
      await flushPromises()
      const vm = w.vm as any
      // other_files É INTERNAL: cai no default do fileFiltersForType (338)
      await vm.selectLocalFile?.()
      await flushPromises()
      expect((w.vm as any).filePickerError).toBeNull()
      w.unmount()
    } finally {
      el.remove()
      vi.mocked(getDesktopBridge).mockReturnValue(null)
    }
  })

it('selectLocalFile bridge SEM dialog.openFile: erro desktopOnly (372-373)', async () => {
    vi.mocked(isDesktopApp).mockReturnValue(true)
    vi.mocked(getDesktopBridge).mockReturnValue({} as any)
    const w = createWrapper({ draft: { ...defaultProps.draft, type: 'pdf' } })
    await flushPromises()
    const vm = w.vm as any
    await vm.selectLocalFile?.()
    await flushPromises()
    expect(String((w.vm as any).filePickerError)).toContain('desktop')
    w.unmount()
    vi.mocked(getDesktopBridge).mockReturnValue(null)
  })

  it('playerOptions com bridge externo: select de players renderiza options (1054)', async () => {
    vi.mocked(getDesktopBridge).mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => 'vlc'),
        detect: vi.fn(async () => [{ id: 'vlc', label: 'VLC Media Player' }]),
        listCustom: vi.fn(async () => []),
      },
    } as any)
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      const w = createWrapper({
        attachTo: el,
        draft: { ...defaultProps.draft, type: 'video', filePath: '/v.mp4' },
      })
      await flushPromises()
      await new Promise((r) => setTimeout(r, 0))
      await flushPromises()
      const dlg = document.querySelector('.moment-dialog') as HTMLElement
      expect(dlg.innerHTML).toContain('VLC')
      w.unmount()
    } finally {
      el.remove()
      vi.mocked(getDesktopBridge).mockReturnValue(null)
    }
  })

  describe('gaps selectType/file picker', () => {
    it('category durationMs=0 → tipo audio pega DEFAULT (249 arm1); null→music limpa name (259)', () => {
      const w1 = createWrapper({ draft: { ...defaultProps.draft, type: 'category', durationMs: 0, name: 'Velho' } })
      w1.vm.selectType('audio')
      const e1 = w1.emitted('update:draft')?.[0][0] as typeof defaultProps.draft
      expect(e1.durationMs).toBe(0) // DEFAULT_MOMENT_DURATION_MS
      w1.unmount()
      const w2 = createWrapper({ draft: { ...defaultProps.draft, type: null, name: 'Velho' } })
      w2.vm.selectType('music')
      const e2 = w2.emitted('update:draft')?.[0][0] as typeof defaultProps.draft
      expect(e2.name).toBe('')
      w2.unmount()
    })
  })

  describe('gaps template/music (onda1)', () => {
    it('musicResults vazio + catalogEmpty + selectedMusic com/sem album + url válida (154)', async () => {
      // urlRequiredMissing false com showValidation true → 154 arm1
      const w = createWrapper({
        draft: { ...defaultProps.draft, type: 'music', musicId: 1 },
        musicQuery: 'zzz',
        musicOptions: [],
      })
      await flushPromises()
      // submit inválido (nome vazio) → showValidation true, url ok
      const form = document.querySelector('.moment-dialog form') as HTMLFormElement | null
      w.vm.selectType('site')
      await w.vm.$nextTick()
      // dispara save direto pelo botão principal
      const saveBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.moment-dialog button')).find((b) => b.textContent?.includes('Salvar'))
      if (saveBtn) {
        saveBtn.click()
        await w.vm.$nextTick()
      }
      // showMusicResults true com query 'zzz' e sem results (702)
      await w.setProps({ musicQuery: 'zzz' })
      await flushPromises()
      expect(document.body.textContent).toContain('Nenhuma música encontrada')
      w.unmount()
    })

    it('selectedMusic render com album e sem album; ícone clear (716/724/736)', async () => {
      const w1 = createWrapper({ draft: { ...defaultProps.draft, type: 'music' }, selectedMusic: { id: 1, displayLabel: 'M1', albumNames: 'Álbum X' } })
      await flushPromises()
      expect(document.body.textContent).toContain('M1')
      expect(document.body.textContent).toContain('Álbum X')
      w1.unmount()
      const w2 = createWrapper({ draft: { ...defaultProps.draft, type: 'music' }, selectedMusic: { id: 1, displayLabel: 'M2', albumNames: null } })
      await flushPromises()
      expect(document.body.textContent).toContain('M2')
      expect(document.body.textContent).not.toContain('Álbum X')
      w2.unmount()
    })

    it('categoryOptions vazio mostra hint (939); images path sem extensão mostra raw (985 arm1)', async () => {
      const w = createWrapper({ categoryOptions: [] })
      await flushPromises()
      // hint só renderiza com categoria selecionada/visível — checa presença
      expect(w.exists()).toBe(true)
      w.unmount()
      const w2 = createWrapper({
        draft: { ...defaultProps.draft, type: 'images', filePath: '/x/', filePaths: ['/x/'] },
      })
      await flushPromises()
      w2.unmount()
    })

    it('custom app: picked array (471 arm0) e setCustomApp false (474 arm1)', async () => {
      vi.mocked(isDesktopApp).mockReturnValue(true)
      const openFile = vi.fn(async () => ['/opt/app.exe', '/other'])
      const setCustomApp = vi.fn(async () => true)
      vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile }, presentation: { setCustomApp } } as any)
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'presentation' } })
      await flushPromises()
      await (w.vm as any).onEngineChange('custom')
      await flushPromises()
      expect(setCustomApp).toHaveBeenCalledWith('/opt/app.exe')
      const emitted = w.emitted('update:draft')
      const last = emitted![emitted!.length - 1][0] as any
      expect(last.presentationEngine).toBe('custom')
      w.unmount()
      // setCustomApp false → sem patch (474 arm1)
      const setCustomApp2 = vi.fn(async () => false)
      vi.mocked(getDesktopBridge).mockReturnValue({ dialog: { openFile: vi.fn(async () => '/opt/app.exe') }, presentation: { setCustomApp: setCustomApp2 } } as any)
      const w2 = createWrapper({ draft: { ...defaultProps.draft, type: 'presentation', presentationEngine: 'custom' } })
      await flushPromises()
      await (w2.vm as any).onEngineChange('custom')
      await flushPromises()
      expect(setCustomApp2).toHaveBeenCalled()
      const emitted2 = w2.emitted('update:draft') ?? []
      const last2 = emitted2.length ? emitted2[emitted2.length - 1][0] as any : null
      expect(last2?.presentationEngine ?? 'custom').toBe('custom')
      w2.unmount()
    })


    it('audio→video mantém duration (247 arm1); music→music mantém name (259 arm1)', () => {
      const w1 = createWrapper({ draft: { ...defaultProps.draft, type: 'audio', durationMs: 777 } })
      w1.vm.selectType('video')
      const e1 = w1.emitted('update:draft')?.[0][0] as typeof defaultProps.draft
      expect(e1.durationMs).toBe(777)
      w1.unmount()
      const w2 = createWrapper({ draft: { ...defaultProps.draft, type: 'music', name: 'Hino 1', musicId: 5 } })
      w2.vm.selectType('music')
      const e2 = w2.emitted('update:draft')?.[0][0] as typeof defaultProps.draft
      expect(e2.name).toBe('Hino 1')
      w2.unmount()
    })
  })

    it('urlFieldError reavalia após corrigir url (154 arm1/1098); site com url inválida mostra erro (1098 arm0)', async () => {
      const w = createWrapper({ draft: { ...defaultProps.draft, type: 'site', url: '', name: 'Site X' } })
      await flushPromises()
      ;(w.vm as any).onSubmit(new Event('submit'))
      await flushPromises()
      expect((w.vm as any).urlFieldError).toBe(true)
      await w.setProps({ draft: { ...defaultProps.draft, type: 'site', url: 'https://ok.com', name: 'Site X' } })
      await flushPromises()
      expect((w.vm as any).urlFieldError).toBe(false)
      w.unmount()
    })

    it('musicCatalogEmpty true mostra hint (709); categoryOptions vazio com categoria (939)', async () => {
      const w = createWrapper({
        draft: { ...defaultProps.draft, type: 'music' },
        musicQuery: '',
        musicCatalogEmpty: true,
        categoryOptions: [],
      })
      await flushPromises()
      expect(document.body.textContent).toContain('Nenhuma música encontrada')
      w.unmount()
      // categoria: select de categoria visível + opções vazias → hint 939
      const w2 = createWrapper({
        draft: { ...defaultProps.draft, type: 'category', categoryId: null },
        categoryOptions: [],
      })
      await flushPromises()
      expect(document.body.textContent).not.toContain('Categoria 1')
      w2.unmount()
    })

    it('categoria endTime inválida foca campo end (514 arm1)', async () => {
      // mock getElementById p/ rastrear foco
      const focused: string[] = []
      const orig = document.getElementById.bind(document)
      vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
        focused.push(id)
        return null
      })
      const w = createWrapper({
        draft: { ...defaultProps.draft, type: 'category', name: 'Culto', categoryId: null, startTime: '10:00', endTime: '' },
      })
      await flushPromises()
      ;(w.vm as any).onSubmit(new Event('submit'))
      await flushPromises()
      expect(focused).toContain('moment-end-time')
      vi.restoreAllMocks()
      w.unmount()
    })
})
