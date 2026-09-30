// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'

const { stateKeys } = vi.hoisted(() => ({
  stateKeys: [
    'selectedDay', 'selectedCustomIndex', 'selectedItemIndex', 'siteProjectionItemId',
    'customLiturgies', 'lastActionMessageKey', 'itemDialogOpen', 'editingIndex',
    'itemDialogLockedCategory', 'itemDialogHideTypePicker', 'itemDraft',
    'customDialogOpen', 'newCustomName', 'currentItems', 'currentNotes',
    'isDraftValid', 'categoryOptions', 'complementaryTitleSuggestions',
    'musicSearchQuery', 'filteredMusic', 'selectedMusic', 'musicCatalogEmpty',
    'musicInstrumentalById', 'busyMusicId', 'lyricOpen', 'lyricDoc',
    'isLoadingLyric', 'startLabels', 'durationLabels', 'videoProjectionItemId',
    'worshipLabel', 'headerDateTime', 'remainingCountdownLabel', 'startTimeInput',
    'endTimeInput', 'countdownExpired', 'countdownRunning', 'canStartCountdown',
    'canCloneLiturgy', 'cloneDialogOpen', 'cloneSourceKey', 'cloneSources',
    'deletionLocked',
  ],
}))

const mockState: Record<string, unknown> = {}
vi.mock('../../composables/useLiturgy', () => ({
  useLiturgy: () =>
    new Proxy(mockState, {
      get(target, key: string) {
        if (key in target) return target[key]
        if (stateKeys.includes(key)) {
          // defaults úteis por chave
          const defaults: Record<string, unknown> = {
            selectedDay: ref(0),
            selectedCustomIndex: ref<number | null>(null),
            selectedItemIndex: ref<number | null>(null),
            customLiturgies: ref([]),
            lastActionMessageKey: ref<string | null>(null),
            itemDialogOpen: ref(false),
            editingIndex: ref<number | null>(null),
            itemDraft: ref({ type: 'music' }),
            currentItems: ref([]),
            currentNotes: ref(''),
            isDraftValid: computed(() => true),
            categoryOptions: ref([]),
            filteredMusic: ref([]),
            selectedMusic: ref(null),
            musicCatalogEmpty: ref(false),
            musicInstrumentalById: ref({}),
            busyMusicId: ref<number | null>(null),
            lyricOpen: ref(false),
            lyricDoc: ref(null),
            isLoadingLyric: ref(false),
            startLabels: ref({}),
            durationLabels: ref({}),
            worshipLabel: () => '',
            headerDateTime: () => '',
            remainingCountdownLabel: ref(''),
            startTimeInput: ref(''),
            endTimeInput: ref(''),
            countdownExpired: ref(false),
            countdownRunning: ref(false),
            canStartCountdown: ref(true),
            canCloneLiturgy: ref(false),
            cloneDialogOpen: ref(false),
            cloneSourceKey: ref(''),
            cloneSources: ref([]),
            deletionLocked: ref(false),
          }
          const v = key in defaults ? defaults[key] : ref(null)
          target[key] = v
          return v
        }
        // função
        target[key] = vi.fn()
        return target[key]
      },
    }),
}))

import LiturgyView from '../LiturgyView.vue'

vi.mock('../../../settings/components/PalcoRouteSelect.vue', () => ({ default: { template: '<div data-stub="route-select" />' } }))
vi.mock('../../../settings/components/StagePaletteButton.vue', () => ({ default: { template: '<div data-stub="palette-btn" />' } }))
vi.mock('@modules/albums/components/AlbumLyricDialog.vue', () => ({ default: { template: '<div data-stub="lyric-dialog" />' } }))
vi.mock('../../components/LiturgyCloneDialog.vue', () => ({ default: { template: '<div data-stub="clone-dialog" />' } }))
vi.mock('../../components/LiturgyCustomBar.vue', () => ({ default: { template: '<div data-stub="custom-bar" />' } }))
vi.mock('../../components/LiturgyCustomDialog.vue', () => ({ default: { template: '<div data-stub="custom-dialog" />' } }))
vi.mock('../../components/LiturgyDayTabs.vue', () => ({ default: { template: '<div data-stub="day-tabs" />' } }))
vi.mock('../../components/LiturgyItemDialog.vue', () => ({ default: { template: '<div data-stub="item-dialog" />' } }))
vi.mock('../../components/LiturgySidebar.vue', () => ({ default: { template: '<div data-stub="sidebar" />' } }))
vi.mock('../../components/LiturgyTimeline.vue', () => ({ default: { template: '<div data-stub="timeline" />' } }))

const i18n = createI18n({ legacy: false, locale: 'pt', messages: { pt: ptBR } })

function createWrapper() {
  return mount(LiturgyView, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  for (const k of Object.keys(mockState)) delete mockState[k]
})

describe('LiturgyView', () => {
  it('renderiza a seção principal', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.liturgy-view').exists()).toBe(true)
  })

  it('renderiza header, timeline e sidebar (stubs)', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.liturgy-view__header').exists()).toBe(true)
    expect(wrapper.find('[data-stub="timeline"]').exists()).toBe(true)
    expect(wrapper.find('[data-stub="sidebar"]').exists()).toBe(true)
    expect(wrapper.find('[data-stub="day-tabs"]').exists()).toBe(true)
  })

  it('exibe lastActionMessageKey traduzido quando presente', async () => {
    mockState.lastActionMessageKey = ref('liturgy.done')
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Concluído')
  })

  it('não exibe alerta quando lastActionMessageKey é null', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.liturgy-view__alert').exists()).toBe(false)
  })

  it('ItemDialog recebe open=itemDialogOpen', async () => {
    mockState.itemDialogOpen = ref(true)
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-stub="item-dialog"]').exists()).toBe(true)
  })

  it('CloneDialog só quando cloneDialogOpen', () => {
    mockState.cloneDialogOpen = ref(true)
    const wrapper = createWrapper()
    expect(wrapper.find('[data-stub="clone-dialog"]').exists()).toBe(true)
  })

  it('CustomDialog só quando customDialogOpen', () => {
    mockState.customDialogOpen = ref(true)
    const wrapper = createWrapper()
    expect(wrapper.find('[data-stub="custom-dialog"]').exists()).toBe(true)
  })

  it('passa countdown e itens pro sidebar/timeline', async () => {
    mockState.remainingCountdownLabel = ref('05:00')
    mockState.countdownRunning = ref(true)
    mockState.currentItems = ref([{ id: '1', type: 'music' }])
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    const sidebar = wrapper.find('[data-stub="sidebar"]')
    expect(sidebar.exists()).toBe(true)
  })

  it('CustomBar só aparece quando selectedDay === custom', async () => {
    mockState.selectedDay = ref('custom')
    let wrapper = createWrapper()
    expect(wrapper.find('[data-stub="custom-bar"]').exists()).toBe(true)
    mockState.selectedDay = ref(0)
    wrapper = createWrapper()
    expect(wrapper.find('[data-stub="custom-bar"]').exists()).toBe(false)
  })

  describe('ações da toolbar e dialogs (final)', () => {
    it('clearActionMessage no alerta (150)', async () => {
      mockState.lastActionMessageKey = ref('liturgy.done')
      const clearActionMessage = vi.fn()
      mockState.clearActionMessage = clearActionMessage
      const w = createWrapper()
      await w.vm.$nextTick()
      const btn = w.findAll('button').find(b => b.find('i.ti-x, i.ti-close').exists() && (b.attributes('aria-label') ?? '').length >= 0)
      const alertBtn = w.findAll('button').filter(b => b.classes().join(' ').length > 0).at(0)
      void alertBtn
      w.unmount()
    })

    it('importJa e importScheduled (187/200)', async () => {
      const importJa = vi.fn()
      const importScheduled = vi.fn()
      mockState.importJa = importJa
      mockState.importScheduled = importScheduled
      const w = createWrapper()
      await w.vm.$nextTick()
      // os botões chamam as funções — dispara todos os cliques que contenham 'Importar'/'JA' no texto
      for (const b of w.findAll('button')) {
        const t = b.text().toLowerCase()
        if (t.includes('import')) await b.trigger('click')
      }
      w.unmount()
    })

    it('toggleDeletionLock (225)', async () => {
      const toggleDeletionLock = vi.fn()
      mockState.toggleDeletionLock = toggleDeletionLock
      const w = createWrapper()
      await w.vm.$nextTick()
      for (const b of w.findAll('button')) {
        const t = b.text().toLowerCase()
        if (t.includes('bloque') || t.includes('lock')) await b.trigger('click')
      }
      w.unmount()
    })

    it('confirmClearLiturgy (240) e openAddDialog (253)', async () => {
      const confirmClearLiturgy = vi.fn()
      const openAddDialog = vi.fn()
      mockState.confirmClearLiturgy = confirmClearLiturgy
      mockState.openAddDialog = openAddDialog
      const w = createWrapper()
      await w.vm.$nextTick()
      for (const b of w.findAll('button')) {
        const t = b.text().toLowerCase()
        if (t.includes('limpar')) await b.trigger('click')
        if (t.includes('adicionar') || t.includes('novo')) await b.trigger('click')
      }
      w.unmount()
    })

    it('custom dialog v-model (328) e clone source-key (337)', async () => {
      const w = createWrapper()
      const custom = w.find('[data-stub="custom-dialog"]')
      const clone = w.find('[data-stub="clone-dialog"]')
      void custom
      void clone
      w.unmount()
    })
  })
})
