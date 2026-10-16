// @vitest-environment jsdom
// CountdownView — coverage: render, goBack, estrutura
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Composable testado à parte: aqui só o contrato tela ↔ minimizar.
const minimizeMock = vi.fn(async () => {})
const prepareMock = vi.fn()
vi.mock('@shared/composables/useMinimizablePage', () => ({
  useMinimizablePage: (options: unknown) => {
    ;(globalThis as any).__minimizeOptions = options
    return { minimize: minimizeMock, prepare: prepareMock, takeRestoredState: () => null }
  },
}))

const mockCountdown = {
  config: { durationSeconds: 300 },
  runtime: { remaining: 300, isRunning: false },
  isProjecting: false,
  configOpen: false,
  isRunning: false,
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
}

const mockRouter = { push: vi.fn() }

vi.mock('../../composables/useCountdown', () => ({
  useCountdownFeature: () => mockCountdown,
}))

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: vi.fn(() => ({})),
  subscribeStageSettings: vi.fn(() => () => {}),
}))

vi.mock('../../../settings/types/stage-settings', () => ({
  stageBgCss: (color: string | null) => color ?? 'transparent',
  resolveBackgroundImage: vi.fn(() => null),
  stageBgCss: () => '#0A0E1A',
}))

vi.mock('../../../settings/components/PalcoRouteSelect.vue', () => ({
  default: { template: '<div class="palco-route-select" />' },
}))

vi.mock('../../../settings/components/StageCustomizationDialog.vue', () => ({
  default: { template: '<div class="stage-custom-dialog" />' },
}))

vi.mock('../../components/CountdownConfigDialog.vue', () => ({
  default: { template: '<div class="countdown-config-dialog" />' },
}))

vi.mock('../../components/CountdownDurationInput.vue', () => ({
  default: { template: '<div class="countdown-duration-input" />' },
}))

vi.mock('../../components/CountdownPreview.vue', () => ({
  default: { template: '<div class="countdown-preview" />' },
}))

vi.mock('../../components/CountdownProjectFab.vue', () => ({
  default: { template: '<div class="countdown-project-fab" />' },
}))

vi.mock('../../components/CountdownSavedList.vue', () => ({
  default: { template: '<div class="countdown-saved-list" />' },
}))

import CountdownView from '../CountdownView.vue'

describe('CountdownView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCountdown.configOpen = false
  })

  it('renderiza', () => {
    const wrapper = mount(CountdownView)
    expect(wrapper.exists()).toBe(true)
  })

  it('monta saved list e duration input; prévia e projetar ficam no painel flutuante', () => {
    const wrapper = mount(CountdownView)
    expect(wrapper.find('.countdown-saved-list').exists()).toBe(true)
    expect(wrapper.find('.countdown-duration-input').exists()).toBe(true)
    expect(wrapper.find('.countdown-preview').exists()).toBe(false)
    expect(wrapper.find('.countdown-project-fab').exists()).toBe(false)
  })

  it('goBack navega para utilities-temporizador', () => {
    const wrapper = mount(CountdownView)
    wrapper.vm.goBack()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'utilities-temporizador' })
  })
})

describe('CountdownView — minimizar página', () => {
  it('– fica abaixo da seta de voltar, minimiza e descreve a tela', async () => {
    minimizeMock.mockClear()
    const w = mount(CountdownView)
    const stack = w.find('.page-back-stack')
    expect(stack.find('.countdown-view__back').exists()).toBe(true)
    await stack.find('.page-back-stack__minimize').trigger('click')
    expect(minimizeMock).toHaveBeenCalledTimes(1)
    const options = (globalThis as any).__minimizeOptions
    expect(options.describe()).toEqual({ title: 'countdown.title', icon: 'ti-hourglass', summary: '' })
    expect(options.capture()).toBeNull()
    expect(options.fallbackRoute).toEqual({ name: 'utilities-temporizador' })
    w.unmount()
  })
})
