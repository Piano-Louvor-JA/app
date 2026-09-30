// Teste rápido CountdownView — coverage básico
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'

// Mock simples
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' }
}))

vi.mock('../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: vi.fn(() => ({})),
  subscribeStageSettings: vi.fn(() => () => {})
}))

vi.mock('../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: vi.fn(() => 'bg-url'),
  StageSettings: class {}
}))

vi.mock('../composables/useCountdown', () => ({
  useCountdown: () => ({
    config: {},
    runtime: {},
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
  })
}))

vi.mock('../../settings/components/StageCustomizationDialog.vue', () => ({
  default: { template: '<div class="dialog" />;' }
}))

vi.mock('../components/CountdownConfigDialog.vue', () => ({
  default: { template: '<div class="config-dialog" />;' }
}))

vi.mock('../components/CountdownPreview.vue', () => ({
  default: { template: '<div class="preview" />;' }
}))

vi.mock('../components/CountdownProjectFab.vue', () => ({
  default: { template: '<div class="fab" />;' }
}))

vi.mock('../components/CountdownSavedList.vue', () => ({
  default: { template: '<div class="saved-list" />;' }
}))

import CountdownView from '../CountdownView.vue'

describe('CountdownView - coverage básico', () => {
  it('renderiza componente', () => {
    const wrapper = mount(CountdownView)
    expect(wrapper.exists()).toBe(true)
  })

  it('contém algum conteúdo', () => {
    const wrapper = mount(CountdownView)
    expect(wrapper.text()).toBeTruthy()
  })

  it('goBack chama router.push', () => {
    const wrapper = mount(CountdownView)
    wrapper.vm.goBack()
    expect(require('vue-router').useRouter().push).toHaveBeenCalledWith({ name: 'utilities-tempo' })
  })
})