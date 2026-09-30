// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('../../composables/useProjectionSettings', async () => {
  const { ref } = await import('vue')
  return {
    useProjectionSettings: () => ({
      hydrate: vi.fn().mockResolvedValue(undefined),
      lastErrorKey: ref<string | null>(null),
    }),
  }
})

// cards filhos como stubs leves
vi.mock('../../components/MonitorArrangementCard.vue', () => ({ default: { name: 'MonitorArrangementCard', template: '<div class="stub-mon" />' } }))
vi.mock('../../components/MultiScreenSelectCard.vue', () => ({ default: { name: 'MultiScreenSelectCard', template: '<div class="stub-multi" />' } }))
vi.mock('../../components/MainScreenOptionsCard.vue', () => ({ default: { name: 'MainScreenOptionsCard', template: '<div class="stub-main" />' } }))
vi.mock('../../components/ReturnScreenOptionsCard.vue', () => ({ default: { name: 'ReturnScreenOptionsCard', template: '<div class="stub-return" />' } }))
vi.mock('../../components/PalcoCard.vue', () => ({ default: { name: 'PalcoCard', template: '<div class="stub-palco" />' } }))
vi.mock('../../components/PalcoSlotsCard.vue', () => ({ default: { name: 'PalcoSlotsCard', template: '<div class="stub-slots" />' } }))
vi.mock('../../components/StageCustomizationCard.vue', () => ({ default: { name: 'StageCustomizationCard', props: ['onlyScope'], template: '<div class="stub-stage">{{ onlyScope }}</div>' } }))

import ProjectionView from '../ProjectionView.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': {} } })

describe('ProjectionView', () => {
  it('monta com todos os cards e sem erro', async () => {
    const w = mount(ProjectionView, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(w.find('.stub-mon').exists()).toBe(true)
    expect(w.find('.stub-multi').exists()).toBe(true)
    expect(w.find('.stub-main').exists()).toBe(true)
    expect(w.find('.stub-return').exists()).toBe(true)
    expect(w.find('.stub-palco').exists()).toBe(true)
    expect(w.find('.stub-slots').exists()).toBe(true)
    expect(w.find('.stub-stage').text()).toBe('global')
    expect(w.find('.projection-settings__error').exists()).toBe(false)
    w.unmount()
  })
})
