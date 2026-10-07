// @vitest-environment jsdom
// Cobertura TimerView.vue (gaps_map3: 87/63/69): header, controles
// start/pause/reset/save, toolbar config, projecting badge, savedList,
// stageBg com/sem backgroundImage, effectiveConfig com stage.timer.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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
    stage: null as Record<string, unknown> | null,
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

const stageSettings = vi.hoisted(() => {
  const listeners: Array<() => void> = []
  return {
    listeners,
    settings: { timer: null as Record<string, unknown> | null, backgroundImage: null as string | null, backgroundColor: '#101010' },
    subscribe: (fn: () => void) => {
      listeners.push(fn)
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1) }
    },
  }
})

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => JSON.parse(JSON.stringify(stageSettings.settings)),
  subscribeStageSettings: stageSettings.subscribe,
}))

vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: (bg: unknown) => (bg ? String(bg) : null),
}))

vi.mock('../../../settings/components/StageCustomizationDialog.vue', () => ({
  default: { name: 'StageCustomizationDialog', props: ['open', 'scope'], template: '<div class="stage-dialog-mock" />' },
}))
vi.mock('../../components/TimerConfigDialog.vue', () => ({
  default: { name: 'TimerConfigDialog', props: ['open'], template: '<div class="config-dialog-mock" />' },
}))
vi.mock('../../components/TimerPreview.vue', () => ({
  default: {
    name: 'TimerPreview',
    props: {
      config: { type: Object, default: null },
      runtime: { type: Object, default: null },
      stage: { type: Object, default: null },
      preview: { type: Boolean, default: false },
    },
    template: `<div
      class="timer-preview-mock"
      :data-config="JSON.stringify(config)"
      :data-preview="String(preview)"
    />`,
  },
}))
vi.mock('../../components/TimerProjectFab.vue', () => ({
  default: { name: 'TimerProjectFab', props: ['projecting'], emits: ['project', 'clear'], template: '<div class="fab-mock" />' },
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
  stageSettings.listeners.length = 0
  stageSettings.settings.timer = null
  stageSettings.settings.backgroundImage = null
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

  it('isRunning=false: botão start visível; clique chama start', async () => {
    const w = mountView()
    const start = w.find('.timer-view__ctrl--start')
    expect(start.exists()).toBe(true)
    await start.trigger('click')
    expect(fns.start).toHaveBeenCalled()
    w.unmount()
  })

  it('isRunning=true: botão pause visível; clique chama pause', async () => {
    fns.state.isRunning = true
    const w = mountView()
    const pause = w.find('.timer-view__ctrl--pause')
    expect(pause.exists()).toBe(true)
    await pause.trigger('click')
    expect(fns.pause).toHaveBeenCalled()
    expect(w.find('.timer-view__ctrl--start').exists()).toBe(false)
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

  it('stageBg sem backgroundImage: só backgroundColor', () => {
    const w = mountView()
    const style = w.find('.timer-view__preview').attributes('style') ?? ''
    expect(style).toContain('rgb(16, 16, 16)')
    expect(style).not.toContain('url(')
    w.unmount()
  })

  it('stageBg com backgroundImage: url aplicada (branch)', () => {
    stageSettings.settings.backgroundImage = 'img://fundo.png'
    const w = mountView()
    const style = w.find('.timer-view__preview').attributes('style') ?? ''
    expect(style).toContain('img://fundo.png')
    w.unmount()
  })

  it('effectiveConfig: stage.timer merge por cima do config', async () => {
    stageSettings.settings.timer = { bgColor: '#202020' }
    const w = mountView()
    await flushPromises()
    const preview = w.findComponent({ name: 'TimerPreview' })
    expect((preview.props('config') as { bgColor: string }).bgColor).toBe('#202020')
    w.unmount()
  })

  it('effectiveConfig sem stage.timer: config puro', async () => {
    const w = mountView()
    await flushPromises()
    const preview = w.findComponent({ name: 'TimerPreview' })
    const mock = w.find('.timer-preview-mock')
    expect(mock.exists()).toBe(true)
    const raw = mock.attributes('data-config') ?? '{}'
    const cfg = JSON.parse(raw) as Record<string, unknown>
    expect(cfg).toEqual({ timeFormat: 'mm:ss' })
    w.unmount()
  })

  it('subscribeStageSettings: update re-read settings; unmount desinscreve', async () => {
    const w = mountView()
    await flushPromises()
    const before = stageSettings.listeners.length
    expect(before).toBeGreaterThan(0)
    stageSettings.settings.backgroundImage = 'img://novo.png'
    stageSettings.listeners.forEach((fn) => fn())
    await flushPromises()
    const style = w.find('.timer-view__preview').attributes('style') ?? ''
    expect(style).toContain('img://novo.png')
    w.unmount()
    expect(stageSettings.listeners.length).toBe(before - 1)
  })

  it('TimerPreview recebe preview=true e stage', () => {
    const w = mountView()
    const preview = w.findComponent({ name: 'TimerPreview' })
    expect(w.find('.timer-preview-mock').attributes('data-preview')).toBeTruthy()
    w.unmount()
  })
})
