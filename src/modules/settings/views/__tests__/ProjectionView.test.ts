// @vitest-environment jsdom
// Cobertura ProjectionView.vue (gaps_map3: branches 0%): render dos cards,
// hydrate no mount, erro via lastErrorKey, stubs de todas as dependências.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({
  hydrate: vi.fn(),
  errorKeyValue: '' as string | null,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('../../composables/useProjectionSettings', () => ({
  useProjectionSettings: () => ({
    hydrate: state.hydrate,
    lastErrorKey: computed(() => state.errorKeyValue),
  }),
}))

// Cards são mockados como elementos simples com classe identificável.
vi.mock('../../components/MonitorArrangementCard.vue', () => ({
  default: { name: 'MonitorArrangementCard', template: '<div class="card-mock monitor-arrangement" />' },
}))
vi.mock('../../components/MultiScreenSelectCard.vue', () => ({
  default: { name: 'MultiScreenSelectCard', template: '<div class="card-mock multi-screen" />' },
}))
vi.mock('../../components/MainScreenOptionsCard.vue', () => ({
  default: { name: 'MainScreenOptionsCard', template: '<div class="card-mock main-screen" />' },
}))
vi.mock('../../components/ReturnScreenOptionsCard.vue', () => ({
  default: { name: 'ReturnScreenOptionsCard', template: '<div class="card-mock return-screen" />' },
}))
vi.mock('../../components/PalcoCard.vue', () => ({
  default: { name: 'PalcoCard', template: '<div class="card-mock palco" />' },
}))
vi.mock('../../components/PalcoSlotsCard.vue', () => ({
  default: { name: 'PalcoSlotsCard', template: '<div class="card-mock palco-slots" />' },
}))
vi.mock('../../components/StageCustomizationCard.vue', () => ({
  default: {
    name: 'StageCustomizationCard',
    props: ['onlyScope'],
    template: '<div class="card-mock stage-customization" :data-scope="onlyScope" />',
  },
}))

import ProjectionView from '../ProjectionView.vue'

async function mountView() {
  const w = mount(ProjectionView)
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
  state.errorKeyValue = ''
})

describe('ProjectionView.vue', () => {
  it('renderiza todos os 7 cards do layout', async () => {
    const w = await mountView()
    expect(w.find('.monitor-arrangement').exists()).toBe(true)
    expect(w.find('.multi-screen').exists()).toBe(true)
    expect(w.find('.main-screen').exists()).toBe(true)
    expect(w.find('.return-screen').exists()).toBe(true)
    expect(w.find('.palco').exists()).toBe(true)
    expect(w.find('.palco-slots').exists()).toBe(true)
    expect(w.find('.stage-customization').exists()).toBe(true)
    w.unmount()
  })

  it('chama hydrate() no onMounted', async () => {
    const w = await mountView()
    expect(state.hydrate).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('sem erro: mensagem de alerta NÃO renderiza (branch v-if falsa)', async () => {
    const w = await mountView()
    expect(w.find('.projection-settings__error').exists()).toBe(false)
    w.unmount()
  })

  it('com lastErrorKey: mostra alerta com a chave traduzida (branch v-if verdadeira)', async () => {
    state.errorKeyValue = 'settings.projection.errorHydrate'
    const w = await mountView()
    const alert = w.find('.projection-settings__error')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe('settings.projection.errorHydrate')
    w.unmount()
  })

  it('StageCustomizationCard recebe only-scope="global"', async () => {
    const w = await mountView()
    expect(w.find('.stage-customization').attributes('data-scope')).toBe('global')
    w.unmount()
  })

  it('layout split contém MultiScreenSelectCard e a stack de opções', async () => {
    const w = await mountView()
    expect(w.find('.projection-settings__split .multi-screen').exists()).toBe(true)
    expect(w.find('.projection-settings__stack .main-screen').exists()).toBe(true)
    expect(w.find('.projection-settings__stack .return-screen').exists()).toBe(true)
    w.unmount()
  })
})
