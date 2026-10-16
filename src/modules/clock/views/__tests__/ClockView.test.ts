// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'

const useClockFeatureMock = vi.hoisted(() => ({
  isProjecting: { __v_isRef: true, value: false },
  configOpen: { __v_isRef: true, value: false },
  openConfig: vi.fn(),
  closeConfig: vi.fn(),
}))

vi.mock('../../composables/useClock', () => ({
  useClockFeature: () => useClockFeatureMock,
}))

vi.mock('../../../settings/components/PalcoRouteSelect.vue', () => ({
  default: { name: 'PalcoRouteSelect', props: ['module'], template: '<div class="palco-route-stub" />' },
}))
vi.mock('../../../settings/components/StageCustomizationDialog.vue', () => ({
  default: { name: 'StageCustomizationDialog', props: ['open', 'scope'], template: '<div class="stage-custom-dialog-stub" />' },
}))
vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-stub"><slot /></div>' },
}))

import ClockView from '../ClockView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': { clock: { backToUtilities: 'Voltar', title: 'Relógio', config: 'Config', projecting: 'Projetando' } } },
})

function createWrapper() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/utilities/temporizador', name: 'utilities-temporizador', component: { template: '<div />' } },
    ],
  })
  const push = vi.spyOn(router, 'push')
  const wrapper = mount(ClockView, {
    global: { plugins: [router, i18n] },
  })
  return { wrapper, push }
}

describe('ClockView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useClockFeatureMock.isProjecting.value = false
    useClockFeatureMock.configOpen.value = false
  })

  it('card sem prévia nem projetar: ficam no painel flutuante', async () => {
    const { wrapper } = createWrapper()
    await flushPromises()
    expect(wrapper.find('.clock-view__title').text()).toBe('Relógio')
    expect(wrapper.find('.clock-preview').exists()).toBe(false)
    expect(wrapper.find('.clock-project-fab').exists()).toBe(false)
    wrapper.unmount()
  })

  it('voltar leva ao Temporizador', async () => {
    const { wrapper, push } = createWrapper()
    await flushPromises()
    await wrapper.find('.clock-view__back').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'utilities-temporizador' })
    wrapper.unmount()
  })

  it('Personalizar abre a customização do palco do Relógio', async () => {
    const { wrapper } = createWrapper()
    await flushPromises()
    const btn = wrapper.find('.clock-view__tool-btn')
    expect(btn.text()).toBe('Config')
    await btn.trigger('click')
    expect(useClockFeatureMock.openConfig).toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'StageCustomizationDialog' }).props('scope')).toBe('clock')
    wrapper.unmount()
  })

  it('selo "em projeção" só enquanto projeta', async () => {
    const first = createWrapper()
    await flushPromises()
    expect(first.wrapper.find('.clock-view__projecting').exists()).toBe(false)
    first.wrapper.unmount()

    useClockFeatureMock.isProjecting.value = true
    const second = createWrapper()
    await flushPromises()
    expect(second.wrapper.find('.clock-view__projecting').text()).toContain('Projetando')
    second.wrapper.unmount()
  })
})
