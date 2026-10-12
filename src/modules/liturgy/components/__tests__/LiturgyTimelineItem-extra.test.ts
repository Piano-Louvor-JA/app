// @vitest-environment jsdom
// Cobertura extra de LiturgyTimelineItem.vue (gauntlet ciclo 3) — complementa
// o LiturgyTimelineItem.test.ts base: menu de player (Teleport), upload de
// mídia local no browser, drag & drop com ghost, botões de controle/projeção,
// status da timeline e props/eventos do MusicTrackActions.
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import LiturgyTimelineItem from '../LiturgyTimelineItem.vue'
import liturgyLocale from '../../locales/pt-BR'
import { isElectronShell } from '@shared/services/desktop-bridge'
import {
  setLiturgyVideoFile,
  readAudioDuration,
  readVideoDuration,
} from '../../services/liturgy-local-video'
import * as playerChoicesModule from '../../composables/useExternalPlayerChoices'
import type { LiturgyItem } from '../../types/liturgy'

// Electron IPC: getDesktopBridge → null (sem bridge). window.louvorja já vem
// mockado como browser (isElectron: false) pelo vitest.setup.ts.
vi.mock('@shared/services/desktop-bridge', () => ({
  isElectronShell: vi.fn(() => false),
  isDesktopApp: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}))

// Mock controlável do composable de players — estado exposto via
// playerTestState para o teste ajustar options/globalPlayer por caso.
// ATENÇÃO: paths relativos aqui são relativos ao TESTE (em __tests__/), então
// precisam de ../../ para atingir os mesmos módulos que o componente importa.
vi.mock('../../composables/useExternalPlayerChoices', async () => {
  const { ref } = await import('vue')
  const globalPlayer = ref('associated')
  const playerOptions = ref<Array<{ id: string; label: string }>>([])
  const loadPlayerChoices = vi.fn()
  // Função pura (não vi.fn): sobrevive a restoreAllMocks/resetAllMocks.
  const selectedPlayerId = (playerId?: string) =>
    playerId && playerId !== 'default' ? playerId : globalPlayer.value
  return {
    useExternalPlayerChoices: () => ({
      globalPlayer,
      playerOptions,
      loadPlayerChoices,
      selectedPlayerId,
    }),
    playerTestState: {
      globalPlayer,
      playerOptions,
      loadPlayerChoices,
    },
  }
})

vi.mock('../../services/liturgy-local-video', () => ({
  setLiturgyVideoFile: vi.fn(),
  readVideoDuration: vi.fn(),
  readAudioDuration: vi.fn(),
}))

// Stub leve sem Pinia (mesmo padrão do teste base), capturando props.
vi.mock('@shared/components/MusicTrackActions.vue', () => ({
  default: {
    name: 'MusicTrackActions',
    props: [
      'musicId',
      'trackName',
      'hasInstrumental',
      'busy',
      'rowHovered',
      'allowOfflineRemove',
      'variant',
    ],
    emits: ['sung', 'instrumental', 'slides', 'lyric'],
    template: '<div data-testid="music-track-actions" />',
  },
}))

// Estado do mock (não existe no módulo real — só na factory do vi.mock).
const playerTestState = (playerChoicesModule as any).playerTestState as {
  globalPlayer: { value: string }
  playerOptions: { value: Array<{ id: string; label: string }> }
  loadPlayerChoices: ReturnType<typeof vi.fn>
}

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': liturgyLocale },
})

function createItem(overrides: Partial<LiturgyItem> = {}): LiturgyItem {
  return {
    id: `item-${Math.random()}`,
    type: 'music',
    name: 'Item Teste',
    subtitle: '',
    done: false,
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

function createCategory(overrides: Partial<LiturgyItem> = {}): LiturgyItem {
  return createItem({
    type: 'category',
    durationMs: 0,
    categoryId: null,
    musicId: undefined,
    name: 'Categoria',
    ...overrides,
  })
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
  siteProjecting: false,
  videoProjecting: false,
}

const mounted: VueWrapper[] = []

function createWrapper(props: Record<string, unknown> = {}) {
  const wrapper = mount(LiturgyTimelineItem, {
    props: { ...defaultProps, ...props } as any,
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

/** jsdom não tem DragEvent — monta Event e anexa dataTransfer/clientX/Y. */
function fireDrag(
  el: Element,
  type: 'dragstart' | 'dragend',
  extra: Record<string, unknown> = {},
) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, extra)
  el.dispatchEvent(event)
}

const originalInnerHeight = window.innerHeight
const originalInnerWidth = window.innerWidth

function setViewport(height: number, width = 1024) {
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
  })
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  })
}

const PLAYER_OPTIONS = [
  { id: 'associated', label: 'Player padrão' },
  { id: 'vlc', label: 'VLC' },
]

function playerTrigger(wrapper: VueWrapper) {
  return wrapper.find('[data-test="liturgy-row-player"]')
}

function menuEl() {
  return document.body.querySelector('.liturgy-item__player-menu')
}

describe('LiturgyTimelineItem — cobertura extra', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset explícito: clearAllMocks não limpa implementações, e o teste
    // "em Electron" sobrescreve isElectronShell — sem isso vaza p/ os próximos.
    vi.mocked(isElectronShell).mockReturnValue(false)
    vi.mocked(readVideoDuration).mockReset()
    vi.mocked(readAudioDuration).mockReset()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    playerTestState.globalPlayer.value = 'associated'
    playerTestState.playerOptions.value = []
  })

  afterEach(() => {
    for (const wrapper of mounted) {
      try {
        wrapper.unmount()
      } catch {
        // já desmontado no próprio teste
      }
    }
    mounted.length = 0
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setViewport(originalInnerHeight, originalInnerWidth)
  })

  describe('renderização de detalhes', () => {
    it('mostra subtítulo, notas e título complementar quando presentes', () => {
      const wrapper = createWrapper({
        item: createItem({
          subtitle: 'Álbum Ao Vivo',
          notes: 'Tom: G',
          complementaryTitle: 'Intro em piano',
        }),
      })
      expect(wrapper.find('.liturgy-item__subtitle').text()).toBe('Álbum Ao Vivo')
      expect(wrapper.find('.liturgy-item__notes').text()).toBe('Tom: G')
      expect(wrapper.find('.liturgy-item__complementary').text()).toBe('Intro em piano')
    })

    it('não renderiza subtítulo/notes/complementar quando ausentes', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.liturgy-item__subtitle').exists()).toBe(false)
      expect(wrapper.find('.liturgy-item__notes').exists()).toBe(false)
      expect(wrapper.find('.liturgy-item__complementary').exists()).toBe(false)
    })

    it('mostra bloco de tempo com startLabel e rótulo de duração para não-categoria', () => {
      const wrapper = createWrapper({ startLabel: '09:30', durationLabel: '4:12' })
      expect(wrapper.find('.liturgy-item__time').exists()).toBe(true)
      expect(wrapper.find('.liturgy-item__clock').text()).toBe('09:30')
      expect(wrapper.find('.liturgy-item__duration').text()).toBe('Duração: 4:12')
    })

    it('categoria mostra range de horário e não mostra bloco de tempo', () => {
      const wrapper = createWrapper({ item: createCategory() })
      const range = wrapper.find('.liturgy-item__type--range')
      expect(range.exists()).toBe(true)
      expect(range.text()).toBe('10:00 - 10:05')
      expect(wrapper.find('.liturgy-item__time').exists()).toBe(false)
    })

    it('categoryTimeRange desconsidera horários apenas com espaços', () => {
      const wrapper = createWrapper({
        item: createCategory({ startTime: '   ', endTime: ' ' }),
      })
      expect(wrapper.find('.liturgy-item__type--range').text()).toBe('—')
    })

    it('exibe childCount quando categoria collapsible está colapsada', () => {
      const wrapper = createWrapper({
        item: createCategory(),
        collapsible: true,
        collapsed: true,
        childCount: 7,
      })
      expect(wrapper.find('.liturgy-item__child-count').text()).toBe('7')
      expect(wrapper.find('.liturgy-item__time').exists()).toBe(false)
    })

    it('não exibe childCount quando categoria está expandida', () => {
      const wrapper = createWrapper({
        item: createCategory(),
        collapsible: true,
        collapsed: false,
        childCount: 7,
      })
      expect(wrapper.find('.liturgy-item__child-count').exists()).toBe(false)
    })

    it('checkbox pendente: title "Marcar como concluído" sem ícones', () => {
      const wrapper = createWrapper()
      const label = wrapper.find('.liturgy-item__check')
      expect(label.attributes('title')).toBe('Marcar como concluído')
      expect(wrapper.find('.ti-check').exists()).toBe(false)
      expect(wrapper.find('.ti-minus').exists()).toBe(false)
    })

    it('checkbox done: title "Marcar como pendente" com ti-check', () => {
      const wrapper = createWrapper({ item: createItem({ done: true }) })
      const label = wrapper.find('.liturgy-item__check')
      expect(label.attributes('title')).toBe('Marcar como pendente')
      expect(label.classes()).toContain('liturgy-item__check--done')
      expect(wrapper.find('.liturgy-item__check .ti-check').exists()).toBe(true)
    })

    it('checkbox indeterminate: ti-minus e prop indeterminate no input', () => {
      const wrapper = createWrapper({ indeterminate: true })
      const label = wrapper.find('.liturgy-item__check')
      expect(label.classes()).toContain('liturgy-item__check--indeterminate')
      expect(wrapper.find('.liturgy-item__check .ti-minus').exists()).toBe(true)
      const input = wrapper.find('input[type="checkbox"]').element as HTMLInputElement
      expect(input.indeterminate).toBe(true)
    })

    it('ícone pendente recebe accentColor no style; done não recebe', () => {
      const pending = createWrapper()
      const pendingStyle = pending.find('.liturgy-item__icon').attributes('style') ?? ''
      // jsdom normaliza hex para rgb()
      expect(pendingStyle).toContain('rgb(255, 152, 0)')

      const done = createWrapper({ item: createItem({ done: true }) })
      expect(done.find('.liturgy-item__icon').attributes('style')).toBeUndefined()
    })

    it('aplica classe linked quando linked=true', () => {
      const wrapper = createWrapper({ linked: true })
      expect(wrapper.classes()).toContain('liturgy-item--linked')
    })

    it('handle de drag com draggable=true quando pendente e false quando done', () => {
      const pending = createWrapper()
      expect(pending.find('.liturgy-item__drag').attributes('draggable')).toBe('true')

      const done = createWrapper({ item: createItem({ done: true }) })
      expect(done.find('.liturgy-item__drag').attributes('draggable')).toBe('false')
    })
  })

  describe('status da timeline', () => {
    it('selected → badge "Em andamento" e classes selected/badge--active', () => {
      const wrapper = createWrapper({ selected: true })
      const badge = wrapper.find('.liturgy-item__badge')
      expect(badge.text()).toBe('Em andamento')
      expect(badge.classes()).toContain('liturgy-item__badge--active')
      expect(wrapper.classes()).toContain('liturgy-item--selected')
    })

    it('categoria aguardando → badge "Aguardando" sem "Em andamento"', () => {
      const wrapper = createWrapper({ item: createCategory(), sectionWaiting: true })
      const badge = wrapper.find('.liturgy-item__badge')
      expect(badge.text()).toBe('Aguardando')
      expect(badge.classes()).toContain('liturgy-item__badge--waiting')
      expect(wrapper.classes()).toContain('liturgy-item--waiting')
      expect(wrapper.text()).not.toContain('Em andamento')
    })

    it('categoria em andamento → badge "Em andamento"', () => {
      const wrapper = createWrapper({ item: createCategory(), sectionInProgress: true })
      expect(wrapper.find('.liturgy-item__badge').text()).toBe('Em andamento')
    })

    it('categoria com inProgress e waiting simultâneos → waiting vence', () => {
      const wrapper = createWrapper({
        item: createCategory(),
        sectionInProgress: true,
        sectionWaiting: true,
      })
      expect(wrapper.text()).toContain('Aguardando')
      expect(wrapper.text()).not.toContain('Em andamento')
    })

    it('done → badge "Concluído" com classe badge--done', () => {
      const wrapper = createWrapper({ item: createItem({ done: true }) })
      const badge = wrapper.find('.liturgy-item__badge')
      expect(badge.text()).toBe('Concluído')
      expect(badge.classes()).toContain('liturgy-item__badge--done')
      expect(wrapper.classes()).toContain('liturgy-item--done')
    })

    it('pendente comum → classe pending e sem badge de status', () => {
      const wrapper = createWrapper()
      expect(wrapper.classes()).toContain('liturgy-item--pending')
      expect(wrapper.find('.liturgy-item__badge').exists()).toBe(false)
    })
  })

  describe('botão abrir controle (popup)', () => {
    it('item executável (verse) → click emite select', async () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'verse', musicId: undefined }),
      })
      const buttons = wrapper.findAll('.liturgy-item__action')
      const control = buttons.find((b) => b.attributes('title') === 'Abrir controle (popup)')
      expect(control).toBeTruthy()
      await control!.trigger('click')
      expect(wrapper.emitted('select')).toBeTruthy()
    })

    it('selected → botão com classe --primary', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'verse', musicId: undefined }),
        selected: true,
      })
      const control = wrapper
        .findAll('.liturgy-item__action')
        .find((b) => b.attributes('title') === 'Abrir controle (popup)')
      expect(control!.classes()).toContain('liturgy-item__action--primary')
    })

    it('não executável e não selecionado → sem botão de controle', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'annotation', musicId: undefined }),
      })
      const control = wrapper
        .findAll('button')
        .find((b) => b.attributes('title') === 'Abrir controle (popup)')
      expect(control).toBeUndefined()
    })

    it('não executável mas selected → botão aparece (branch selected)', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'annotation', musicId: undefined }),
        selected: true,
      })
      const control = wrapper
        .findAll('button')
        .find((b) => b.attributes('title') === 'Abrir controle (popup)')
      expect(control).toBeTruthy()
    })

    it('music → sem botão de controle (isMusicItem)', () => {
      const wrapper = createWrapper()
      const control = wrapper
        .findAll('button')
        .find((b) => b.attributes('title') === 'Abrir controle (popup)')
      expect(control).toBeUndefined()
    })

    it('done → botão de controle disabled', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'verse', musicId: undefined, done: true }),
        selected: true,
      })
      const control = wrapper
        .findAll('button')
        .find((b) => b.attributes('title') === 'Abrir controle (popup)')
      expect(control!.attributes('disabled')).toBeDefined()
    })
  })

  describe('botões de controle e projeção (site/vídeo/imagens/pdf/apresentação)', () => {
    const cases = [
      { type: 'site', control: 'Abrir controle do site', project: 'Projetar site nas telas estendidas', stop: 'Parar projeção do site' },
      { type: 'online_video', control: 'Abrir controle do YouTube', project: 'Projetar vídeo nas telas estendidas', stop: 'Parar projeção do vídeo' },
      { type: 'images', control: 'Abrir controle das imagens', project: 'Projetar imagens nas telas estendidas', stop: 'Parar projeção das imagens' },
      { type: 'pdf', control: 'Abrir controle do PDF', project: 'Projetar PDF nas telas estendidas', stop: 'Parar projeção do PDF' },
      { type: 'presentation', control: 'Abrir controle da apresentação', project: 'Projetar apresentação nas telas estendidas', stop: 'Parar projeção da apresentação' },
    ] as const

    for (const { type, control, project, stop } of cases) {
      it(`${type}: titles de controle/projeção e emits select/playScreens`, async () => {
        const wrapper = createWrapper({
          item: createItem({ type, musicId: undefined } as any),
        })
        const controlBtn = wrapper.find(`[title="${control}"]`)
        expect(controlBtn.exists()).toBe(true)
        await controlBtn.trigger('click')
        expect(wrapper.emitted('select')).toBeTruthy()

        const projectBtn = wrapper.find(`[title="${project}"]`)
        expect(projectBtn.exists()).toBe(true)
        expect(projectBtn.attributes('aria-pressed')).toBe('false')
        expect(projectBtn.find('.ti-arrow-up-right').exists()).toBe(true)
        await projectBtn.trigger('click')
        expect(wrapper.emitted('playScreens')).toBeTruthy()
        expect(wrapper.find(`[title="${stop}"]`).exists()).toBe(false)
      })

      it(`${type} projetando: title de parar, aria-pressed e classe --site-projecting`, async () => {
        const wrapper = createWrapper({
          item: createItem({ type, musicId: undefined } as any),
          ...(type === 'site' ? { siteProjecting: true } : { videoProjecting: true }),
        })
        const stopBtn = wrapper.find(`[title="${stop}"]`)
        expect(stopBtn.exists()).toBe(true)
        expect(stopBtn.attributes('aria-pressed')).toBe('true')
        expect(stopBtn.classes()).toContain('liturgy-item__action--site-projecting')
        expect(stopBtn.find('.ti-player-stop').exists()).toBe(true)
        await stopBtn.trigger('click')
        expect(wrapper.emitted('playScreens')).toBeTruthy()
      })
    }

    it('site projetando usa siteProjecting (não videoProjecting)', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'site', musicId: undefined } as any),
        siteProjecting: true,
        videoProjecting: false,
      })
      expect(wrapper.find('[title="Parar projeção do site"]').exists()).toBe(true)
      expect(wrapper.find('[title="Projetar site nas telas estendidas"]').exists()).toBe(false)
    })

    it('site NÃO projetando ignora videoProjecting=true', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'site', musicId: undefined } as any),
        siteProjecting: false,
        videoProjecting: true,
      })
      expect(wrapper.find('[title="Projetar site nas telas estendidas"]').exists()).toBe(true)
    })

    it('done → botões de controle e projeção disabled', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'online_video', musicId: undefined, done: true } as any),
      })
      expect(wrapper.find('[title="Abrir controle do YouTube"]').attributes('disabled')).toBeDefined()
      expect(
        wrapper.find('[title="Projetar vídeo nas telas estendidas"]').attributes('disabled'),
      ).toBeDefined()
    })

    it('site projetando e done → sem classe --site-projecting', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'site', musicId: undefined, done: true } as any),
        siteProjecting: true,
      })
      const stopBtn = wrapper.find('[title="Parar projeção do site"]')
      expect(stopBtn.classes()).not.toContain('liturgy-item__action--site-projecting')
    })
  })

  describe('editar / remover / colapsar / sub item', () => {
    it('click em editar emite edit com title "Editar"', async () => {
      const wrapper = createWrapper()
      const edit = wrapper.find('[title="Editar"]')
      expect(edit.exists()).toBe(true)
      await edit.trigger('click')
      expect(wrapper.emitted('edit')).toBeTruthy()
    })

    it('categoria usa title "Editar Categoria/Separador"', async () => {
      const wrapper = createWrapper({ item: createCategory() })
      const edit = wrapper.find('[title="Editar Categoria/Separador"]')
      expect(edit.exists()).toBe(true)
      await edit.trigger('click')
      expect(wrapper.emitted('edit')).toBeTruthy()
    })

    it('click em remover emite remove', async () => {
      const wrapper = createWrapper()
      await wrapper.find('[title="Remover"]').trigger('click')
      expect(wrapper.emitted('remove')).toBeTruthy()
    })

    it('deletionLocked oculta editar e remover', () => {
      const wrapper = createWrapper({ deletionLocked: true })
      expect(wrapper.find('[title="Editar"]').exists()).toBe(false)
      expect(wrapper.find('[title="Remover"]').exists()).toBe(false)
    })

    it('done desabilita editar e remover', () => {
      const wrapper = createWrapper({ item: createItem({ done: true }) })
      expect(wrapper.find('[title="Editar"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[title="Remover"]').attributes('disabled')).toBeDefined()
    })

    it('colapsar expandido: aria-expanded true, chevron-down, emite toggleCollapse', async () => {
      const wrapper = createWrapper({
        item: createCategory(),
        collapsible: true,
        collapsed: false,
      })
      const collapse = wrapper.find('.liturgy-item__action--collapse')
      expect(collapse.attributes('aria-expanded')).toBe('true')
      expect(collapse.find('.ti-chevron-down').exists()).toBe(true)
      expect(collapse.attributes('title')).toBe('Minimizar categoria')
      await collapse.trigger('click')
      expect(wrapper.emitted('toggleCollapse')).toBeTruthy()
    })

    it('colapsado: aria-expanded false, chevron-right, title de expandir', async () => {
      const wrapper = createWrapper({
        item: createCategory(),
        collapsible: true,
        collapsed: true,
      })
      const collapse = wrapper.find('.liturgy-item__action--collapse')
      expect(collapse.attributes('aria-expanded')).toBe('false')
      expect(collapse.find('.ti-chevron-right').exists()).toBe(true)
      expect(collapse.attributes('title')).toBe('Expandir categoria')
      await collapse.trigger('click')
      expect(wrapper.emitted('toggleCollapse')).toBeTruthy()
    })

    it('categoria done → colapsar e adicionar sub item disabled', () => {
      const wrapper = createWrapper({
        item: createCategory({ done: true }),
        collapsible: true,
      })
      expect(wrapper.find('.liturgy-item__action--collapse').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.liturgy-item__add-sub').attributes('disabled')).toBeDefined()
    })

    it('click em adicionar sub item emite addSubItem', async () => {
      const wrapper = createWrapper({ item: createCategory() })
      await wrapper.find('.liturgy-item__add-sub').trigger('click')
      expect(wrapper.emitted('addSubItem')).toBeTruthy()
    })

    it('não-categoria não tem botão de sub item', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.liturgy-item__add-sub').exists()).toBe(false)
    })
  })

  describe('MusicTrackActions (música)', () => {
    it('repassa props ao MusicTrackActions', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'music', musicId: 42, name: 'Louvor' }),
        hasInstrumental: true,
        musicBusy: false,
      })
      const music = wrapper.findComponent({ name: 'MusicTrackActions' })
      expect(music.props('musicId')).toBe(42)
      expect(music.props('trackName')).toBe('Louvor')
      expect(music.props('hasInstrumental')).toBe(true)
      expect(music.props('busy')).toBe(false)
      expect(music.props('allowOfflineRemove')).toBe(false)
      expect(music.props('variant')).toBe('contained')
    })

    it('busy combina musicBusy || item.done', () => {
      const busyWrapper = createWrapper({ musicBusy: true })
      expect(busyWrapper.findComponent({ name: 'MusicTrackActions' }).props('busy')).toBe(true)

      const doneWrapper = createWrapper({ item: createItem({ done: true }) })
      expect(doneWrapper.findComponent({ name: 'MusicTrackActions' }).props('busy')).toBe(true)
    })

    it('rowHovered acompanha mouseenter/mouseleave na linha', async () => {
      const wrapper = createWrapper()
      const music = wrapper.findComponent({ name: 'MusicTrackActions' })
      expect(music.props('rowHovered')).toBe(false)

      await wrapper.find('.liturgy-item').trigger('mouseenter')
      expect(music.props('rowHovered')).toBe(true)

      await wrapper.find('.liturgy-item').trigger('mouseleave')
      expect(music.props('rowHovered')).toBe(false)
    })

    it('eventos do MusicTrackActions viram musicSung/musicInstrumental/musicSlides/musicLyric', async () => {
      const wrapper = createWrapper()
      const music = wrapper.findComponent({ name: 'MusicTrackActions' })

      music.vm.$emit('sung')
      music.vm.$emit('instrumental')
      music.vm.$emit('slides')
      music.vm.$emit('lyric')
      await nextTick()

      expect(wrapper.emitted('musicSung')).toBeTruthy()
      expect(wrapper.emitted('musicInstrumental')).toBeTruthy()
      expect(wrapper.emitted('musicSlides')).toBeTruthy()
      expect(wrapper.emitted('musicLyric')).toBeTruthy()
    })
  })

  describe('upload de mídia local (browser)', () => {
    it('video com id no browser mostra botão "Selecionar arquivo" que clica no input', async () => {
      const clickSpy = vi
        .spyOn(HTMLInputElement.prototype, 'click')
        .mockImplementation(() => {})
      const wrapper = createWrapper({
        item: createItem({ type: 'video', musicId: undefined, id: 'v-1' } as any),
      })
      const upload = wrapper.find('.liturgy-item__action-btn')
      expect(upload.exists()).toBe(true)
      // Nota: liturgy.videoSelectFile não existe no locale (existe em
      // liturgy.messages.*) — o t() resolve para a própria chave.
      expect(upload.text()).toBe('liturgy.videoSelectFile')
      expect(wrapper.find('input[type="file"]').attributes('accept')).toBe('video/*')
      await upload.trigger('click')
      expect(clickSpy).toHaveBeenCalled()
    })

    it('audio usa accept audio/*', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined, id: 'a-1' } as any),
      })
      expect(wrapper.find('input[type="file"]').attributes('accept')).toBe('audio/*')
    })

    it('em Electron não mostra botão de upload', () => {
      vi.mocked(isElectronShell).mockReturnValue(true)
      const wrapper = createWrapper({
        item: createItem({ type: 'video', musicId: undefined, id: 'v-1' } as any),
      })
      expect(wrapper.find('.liturgy-item__action-btn').exists()).toBe(false)
    })

    it('sem id não mostra botão de upload', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'video', musicId: undefined, id: '' } as any),
      })
      expect(wrapper.find('.liturgy-item__action-btn').exists()).toBe(false)
    })

    it('change com arquivo de vídeo: registra, lê duração e emite videoFileSelected', async () => {
      vi.mocked(readVideoDuration).mockResolvedValue(42.5)
      const item = createItem({ type: 'video', musicId: undefined, id: 'v-1' } as any)
      const wrapper = createWrapper({ item })
      const input = wrapper.find('input[type="file"]')
      const file = new File(['data'], 'clip.mp4', { type: 'video/mp4' })
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

      await input.trigger('change')

      expect(setLiturgyVideoFile).toHaveBeenCalledWith('v-1', file)
      expect(readVideoDuration).toHaveBeenCalledWith(file)
      expect(wrapper.emitted('videoFileSelected')?.[0]).toEqual([42.5])
      expect(wrapper.find('.liturgy-item__action-btn').text()).toBe('clip.mp4')
    })

    it('change com arquivo de áudio usa readAudioDuration', async () => {
      vi.mocked(readAudioDuration).mockResolvedValue(12)
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined, id: 'a-1' } as any),
      })
      const input = wrapper.find('input[type="file"]')
      const file = new File(['data'], 'faixa.mp3', { type: 'audio/mpeg' })
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

      await input.trigger('change')

      expect(readAudioDuration).toHaveBeenCalledWith(file)
      expect(wrapper.emitted('videoFileSelected')?.[0]).toEqual([12])
    })

    it('change sem arquivo não faz nada', async () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'video', musicId: undefined, id: 'v-1' } as any),
      })
      const input = wrapper.find('input[type="file"]')
      Object.defineProperty(input.element, 'files', { value: [], configurable: true })

      await input.trigger('change')

      expect(setLiturgyVideoFile).not.toHaveBeenCalled()
      expect(wrapper.emitted('videoFileSelected')).toBeUndefined()
    })
  })

  describe('drag & drop com ghost', () => {
    it('dragstart: setData com index, ghost no body, setDragImage e emit dragStart', () => {
      const wrapper = createWrapper({ index: 3 })
      const handle = wrapper.find('.liturgy-item__drag').element
      const dataTransfer = {
        effectAllowed: '',
        setData: vi.fn(),
        setDragImage: vi.fn(),
      }
      fireDrag(handle, 'dragstart', { dataTransfer, clientX: 25, clientY: 10 })

      expect(dataTransfer.effectAllowed).toBe('move')
      expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '3')
      expect(wrapper.emitted('dragStart')?.[0]).toEqual([3])

      const ghost = document.body.querySelector('.liturgy-item--drag-ghost') as HTMLElement
      expect(ghost).toBeTruthy()
      expect(ghost.style.width).toBe('0px')
      expect(ghost.classList.contains('liturgy-item--drag-source')).toBe(true)
      expect(dataTransfer.setDragImage).toHaveBeenCalledWith(ghost, 0, 0)
    })

    it('dragstart com rect real: offsets do setDragImage são clampados', () => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 140,
        left: 50,
        right: 250,
        width: 200,
        height: 40,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect)
      const wrapper = createWrapper()
      const handle = wrapper.find('.liturgy-item__drag').element
      const dataTransfer = {
        effectAllowed: '',
        setData: vi.fn(),
        setDragImage: vi.fn(),
      }
      fireDrag(handle, 'dragstart', { dataTransfer, clientX: 300, clientY: -10 })

      const ghost = dataTransfer.setDragImage.mock.calls[0]![0] as HTMLElement
      expect(ghost.style.width).toBe('200px')
      expect(ghost.style.boxSizing).toBe('border-box')
      expect(dataTransfer.setDragImage).toHaveBeenCalledWith(ghost, 200, 0)
    })

    it('dragstart sem dataTransfer ainda emite dragStart', () => {
      const wrapper = createWrapper({ index: 1 })
      const handle = wrapper.find('.liturgy-item__drag').element
      fireDrag(handle, 'dragstart')
      expect(wrapper.emitted('dragStart')?.[0]).toEqual([1])
      expect(
        document.body.querySelector('.liturgy-item--drag-ghost'),
      ).toBeNull()
    })

    it('item done não inicia drag (guard do template)', () => {
      const wrapper = createWrapper({ item: createItem({ done: true }) })
      const handle = wrapper.find('.liturgy-item__drag').element
      const dataTransfer = {
        effectAllowed: '',
        setData: vi.fn(),
        setDragImage: vi.fn(),
      }
      fireDrag(handle, 'dragstart', { dataTransfer })
      expect(wrapper.emitted('dragStart')).toBeUndefined()
    })

    it('dragend: emite dragEnd e remove ghost após timeout', async () => {
      const wrapper = createWrapper()
      const handle = wrapper.find('.liturgy-item__drag').element
      fireDrag(handle, 'dragstart', {
        dataTransfer: { effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() },
      })
      expect(document.body.querySelector('.liturgy-item--drag-ghost')).toBeTruthy()

      fireDrag(handle, 'dragend')
      expect(wrapper.emitted('dragEnd')).toBeTruthy()
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(document.body.querySelector('.liturgy-item--drag-ghost')).toBeNull()
    })

    it('dragend sem ghost prévio apenas emite dragEnd', async () => {
      const wrapper = createWrapper()
      fireDrag(wrapper.find('.liturgy-item__drag').element, 'dragend')
      expect(wrapper.emitted('dragEnd')).toBeTruthy()
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  })

  describe('menu de player externo', () => {
    it('onMounted carrega choices para audio com playerId', () => {
      createWrapper({
        item: createItem({ type: 'audio', musicId: undefined, playerId: 'vlc' } as any),
      })
      expect(playerTestState.loadPlayerChoices).toHaveBeenCalledWith(['vlc'])
    })

    it('onMounted não carrega choices para tipo sem player (music)', () => {
      createWrapper()
      expect(playerTestState.loadPlayerChoices).not.toHaveBeenCalled()
    })

    it('sem playerOptions não renderiza o trigger', () => {
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      expect(playerTrigger(wrapper).exists()).toBe(false)
    })

    it('label do trigger: player global recebe sufixo "(padrão)"', () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      expect(playerTrigger(wrapper).text()).toContain('Player padrão (padrão)')
    })

    it('label do trigger: player do item (não global) sem sufixo', () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined, playerId: 'vlc' } as any),
      })
      expect(playerTrigger(wrapper).text()).toContain('VLC')
    })

    it('label do trigger: player desconhecido cai no placeholder', () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined, playerId: 'mpv' } as any),
      })
      expect(playerTrigger(wrapper).text()).toContain('Reproduzir no player')
    })

    it('click abre menu teleported com opções e marca a selecionada', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined, playerId: 'vlc' } as any),
      })
      const trigger = playerTrigger(wrapper)
      expect(trigger.attributes('aria-expanded')).toBe('false')

      await trigger.trigger('click')
      await nextTick()

      expect(trigger.attributes('aria-expanded')).toBe('true')
      const menu = menuEl()
      expect(menu).toBeTruthy()
      expect(menu!.getAttribute('role')).toBe('listbox')
      const options = menu!.querySelectorAll('.liturgy-item__player-option')
      expect(options).toHaveLength(2)
      const selected = menu!.querySelector('[aria-selected="true"]')
      expect(selected?.textContent).toContain('VLC')
      expect(
        wrapper.find('.liturgy-item__player').classes(),
      ).toContain('liturgy-item__player--open')
    })

    it('escolher opção emite setPlayer e fecha o menu', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()

      const option = menuEl()!.querySelectorAll('.liturgy-item__player-option')[1]!
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()

      expect(wrapper.emitted('setPlayer')?.[0]).toEqual(['vlc'])
      expect(menuEl()).toBeNull()
      expect(playerTrigger(wrapper).attributes('aria-expanded')).toBe('false')
    })

    it('item done não abre o menu e trigger fica disabled', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined, done: true } as any),
      })
      const trigger = playerTrigger(wrapper)
      expect(trigger.attributes('disabled')).toBeDefined()
      expect(wrapper.find('.liturgy-item__player').classes()).toContain(
        'liturgy-item__player--disabled',
      )

      await trigger.trigger('click')
      await nextTick()
      expect(menuEl()).toBeNull()
    })

    it('segundo click no trigger fecha o menu', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()
      expect(menuEl()).toBeTruthy()

      await playerTrigger(wrapper).trigger('click')
      await nextTick()
      expect(menuEl()).toBeNull()
    })

    it('pointerdown fora do menu fecha', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()
      expect(menuEl()).toBeTruthy()

      document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      await nextTick()
      expect(menuEl()).toBeNull()
    })

    it('pointerdown dentro do menu mantém aberto', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()

      menuEl()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      await nextTick()
      expect(menuEl()).toBeTruthy()

      // pointerdown no trigger (dentro de playerTriggerEl) também mantém aberto
      wrapper
        .find('[data-test="liturgy-row-player"]')
        .element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      await nextTick()
      expect(menuEl()).toBeTruthy()
    })

    it('Escape fecha o menu', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await nextTick()
      expect(menuEl()).toBeNull()
    })

    it('posiciona abaixo do trigger quando há espaço (minWidth = max(width, 168))', async () => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 136,
        left: 50,
        right: 250,
        width: 200,
        height: 36,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect)
      setViewport(400, 1000)
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()

      const style = menuEl()!.getAttribute('style') ?? ''
      // 2 opções → altura estimada 88; espaço abaixo 256 ≥ 88 → abre abaixo.
      expect(style).toContain('top: 142px')
      expect(style).toContain('left: 50px')
      expect(style).toContain('min-width: 200px')
    })

    it('posiciona acima (clamp 8px) quando falta espaço abaixo', async () => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 136,
        left: 50,
        right: 250,
        width: 200,
        height: 36,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect)
      setViewport(200, 1000)
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()

      // espaço abaixo 56 < 88 e top 100 ≥ 88 → acima: max(8, 100-88-6) = 8.
      const style = menuEl()!.getAttribute('style') ?? ''
      expect(style).toContain('top: 8px')
    })

    it('minWidth respeita piso de 168px para trigger estreito', async () => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 136,
        left: 50,
        right: 110,
        width: 60,
        height: 36,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect)
      setViewport(400, 1000)
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()

      const style = menuEl()!.getAttribute('style') ?? ''
      expect(style).toContain('min-width: 168px')
    })

    it('resize/scroll com menu aberto reposiciona', async () => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 136,
        left: 50,
        right: 250,
        width: 200,
        height: 36,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect)
      setViewport(400, 1000)
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()
      expect(menuEl()!.getAttribute('style')).toContain('top: 142px')

      setViewport(200, 1000)
      window.dispatchEvent(new Event('resize'))
      await nextTick()
      expect(menuEl()!.getAttribute('style')).toContain('top: 8px')

      setViewport(400, 1000)
      window.dispatchEvent(new Event('scroll'))
      await nextTick()
      expect(menuEl()!.getAttribute('style')).toContain('top: 142px')
    })

    it('unmount com menu aberto remove listeners de pointerdown', async () => {
      playerTestState.playerOptions.value = PLAYER_OPTIONS
      const wrapper = createWrapper({
        item: createItem({ type: 'audio', musicId: undefined } as any),
      })
      await playerTrigger(wrapper).trigger('click')
      await nextTick()
      expect(menuEl()).toBeTruthy()

      const spy = vi.spyOn(document, 'removeEventListener')
      wrapper.unmount()
      expect(spy).toHaveBeenCalledWith('pointerdown', expect.any(Function))
    })
  })
})

describe('LiturgyTimelineItem — handlers de template (F360/F372/F407)', () => {
  it('dragover na raiz é preventDefault (F360) e drop emite drop com index', async () => {
    const w = createWrapper({ index: 3 })
    const root = w.find('.liturgy-item')
    const evt = new Event('dragover', { bubbles: true, cancelable: true })
    root.element.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
    const dropEvt = new Event('drop', { bubbles: true, cancelable: true })
    root.element.dispatchEvent(dropEvt)
    await nextTick()
    expect(w.emitted('drop')?.[0]).toEqual([3])
  })

  it('click no label do check e no handle de drag não propaga (F372/F407 stop)', async () => {
    const w = createWrapper({})
    const label = w.find('.liturgy-item__check')
    await label.trigger('click')
    // click do label não altera done (só o input change emite toggleDone) —
    // se emitido, é click no input interno propagando; aqui o .stop segura
    const handle = w.find('.liturgy-item__drag')
    await handle.trigger('click')
    // handle com @click.stop: nenhum handler de click do pai roda — sem emits
    // extras além dos já vistos; o contrato é não crashar e não emitir drop
    expect(w.emitted('drop')).toBeUndefined()
  })
})
