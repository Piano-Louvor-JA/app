// @vitest-environment jsdom
// Cobertura TimerView.vue: header, reset/save, toolbar config, projecting
// badge e savedList. Prévia, iniciar/pausar e projetar ficam no TimerChrome.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'

const fns = vi.hoisted(() => ({
  setTimeFormat: vi.fn(),
  setBgColor: vi.fn(),
  setTextColor: vi.fn(),
  resetDisplayToDefault: vi.fn(),
  openConfig: vi.fn(),
  closeConfig: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  reset: vi.fn(),
  saveMark: vi.fn(),
  removeSavedMark: vi.fn(),
  clearSavedMarks: vi.fn(),
  toggleProjection: vi.fn(),
  state: {
    isRunning: false,
    isProjecting: false,
    configOpen: false,
    runtime: { savedTimesMs: [1000, 2000] },
    config: { timeFormat: 'mm:ss' },
  },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

const routerPush = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush.push }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-mock"><slot /></div>' },
}))

vi.mock('../../../settings/components/PalcoRouteSelect.vue', () => ({
  default: { name: 'PalcoRouteSelect', props: ['module'], template: '<div class="palco-route-mock" />' },
}))

vi.mock('../../../settings/components/StageCustomizationDialog.vue', () => ({
  default: { name: 'StageCustomizationDialog', props: ['open', 'scope'], template: '<div class="stage-dialog-mock" />' },
}))
vi.mock('../../components/TimerSavedList.vue', () => ({
  default: { name: 'TimerSavedList', props: ['items', 'timeFormat'], emits: ['remove', 'clear'], template: '<div class="saved-list-mock" />' },
}))

vi.mock('../../composables/useTimer', () => ({
  useTimerDisplay: () => ({
    formattedTime: { value: '00:00' },
    now: { value: 0 },
    config: { value: {} },
    runtime: { value: {} },
    elapsedMs: { value: 0 },
  }),
  useTimerFeature: () => ({
    config: computed(() => fns.state.config),
    runtime: computed(() => fns.state.runtime),
    isProjecting: computed(() => fns.state.isProjecting),
    configOpen: computed(() => fns.state.configOpen),
    isRunning: computed(() => fns.state.isRunning),
    setTimeFormat: fns.setTimeFormat,
    setBgColor: fns.setBgColor,
    setTextColor: fns.setTextColor,
    resetDisplayToDefault: fns.resetDisplayToDefault,
    openConfig: fns.openConfig,
    closeConfig: fns.closeConfig,
    start: fns.start,
    pause: fns.pause,
    reset: fns.reset,
    saveMark: fns.saveMark,
    removeSavedMark: fns.removeSavedMark,
    clearSavedMarks: fns.clearSavedMarks,
    toggleProjection: fns.toggleProjection,
  }),
}))

import TimerView from '../TimerView.vue'

function mountView() {
  return mount(TimerView)
}

beforeEach(() => {
  window.localStorage?.clear?.()
  vi.clearAllMocks()
  fns.state.isRunning = false
  fns.state.isProjecting = false
  fns.state.configOpen = false
  fns.state.runtime = { savedTimesMs: [1000, 2000] }
  fns.state.config = { timeFormat: 'mm:ss' }
})

describe('TimerView.vue', () => {
  it('renderiza header com PalcoRouteSelect, título e botão back', () => {
    const w = mountView()
    expect(w.find('.palco-route-mock').exists()).toBe(true)
    expect(w.find('.timer-view__title').text()).toBe('timer.title')
    expect(w.find('.timer-view__back').exists()).toBe(true)
    w.unmount()
  })

  it('back navega pra utilities-temporizador', async () => {
    const w = mountView()
    await w.find('.timer-view__back').trigger('click')
    expect(routerPush.push).toHaveBeenCalledWith({ name: 'utilities-temporizador' })
    w.unmount()
  })

  it('card sem prévia, iniciar/pausar nem projetar: ficam no painel flutuante', () => {
    fns.state.isRunning = true
    const w = mountView()
    expect(w.find('.timer-preview').exists()).toBe(false)
    expect(w.find('.timer-view__ctrl--start').exists()).toBe(false)
    expect(w.find('.timer-view__ctrl--pause').exists()).toBe(false)
    expect(w.find('.timer-project-fab').exists()).toBe(false)
    w.unmount()
  })

  it('reset e save chamam as ações do feature', async () => {
    const w = mountView()
    await w.find('.timer-view__ctrl--reset').trigger('click')
    expect(fns.reset).toHaveBeenCalled()
    await w.find('.timer-view__ctrl--save').trigger('click')
    expect(fns.saveMark).toHaveBeenCalled()
    w.unmount()
  })

  it('toolbar palette abre o config', async () => {
    const w = mountView()
    await w.find('.timer-view__tool-btn').trigger('click')
    expect(fns.openConfig).toHaveBeenCalled()
    w.unmount()
  })

  it('isProjecting=false: badge projecting oculto (branch)', () => {
    const w = mountView()
    expect(w.find('.timer-view__projecting').exists()).toBe(false)
    w.unmount()
  })

  it('isProjecting=true: badge projecting visível', () => {
    fns.state.isProjecting = true
    const w = mountView()
    expect(w.find('.timer-view__projecting').exists()).toBe(true)
    w.unmount()
  })

  it('TimerSavedList recebe savedTimesMs e timeFormat', () => {
    const w = mountView()
    const list = w.findComponent({ name: 'TimerSavedList' })
    expect(list.props('items')).toEqual([1000, 2000])
    expect(list.props('timeFormat')).toBe('mm:ss')
    w.unmount()
  })
})
