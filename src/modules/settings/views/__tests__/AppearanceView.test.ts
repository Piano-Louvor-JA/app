// @vitest-environment jsdom
// Cobertura AppearanceView.vue (gaps_map3: branches 33%): hero, layout 3 colunas,
// feature flag SHOW_LYRIC_CUSTOMIZATION=false (bloco lyrics oculto), hydrate.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({
  hydrate: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('../../composables/useProjectionSettings', () => ({
  useProjectionSettings: () => ({
    hydrate: state.hydrate,
  }),
}))

vi.mock('../../components/AccentColorCard.vue', () => ({
  default: { name: 'AccentColorCard', template: '<div class="card-mock accent-color" />' },
}))
vi.mock('../../components/InteractionModeCard.vue', () => ({
  default: { name: 'InteractionModeCard', template: '<div class="card-mock interaction-mode" />' },
}))
vi.mock('../../components/LyricCustomizationCard.vue', () => ({
  default: { name: 'LyricCustomizationCard', template: '<div class="card-mock lyric-customization" />' },
}))
vi.mock('../../components/ThemeOrbitalSwitcher.vue', () => ({
  default: { name: 'ThemeOrbitalSwitcher', template: '<div class="card-mock theme-orbital" />' },
}))

import AppearanceView from '../AppearanceView.vue'

async function mountView() {
  const w = mount(AppearanceView)
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AppearanceView.vue', () => {
  it('renderiza hero com título e subtítulo traduzidos', async () => {
    const w = await mountView()
    expect(w.find('.appearance-experience__title').text()).toBe('settings.appearance.experienceTitle')
    expect(w.find('.appearance-experience__subtitle').text()).toBe('settings.appearance.experienceSubtitle')
    w.unmount()
  })

  it('renderiza as 3 colunas (interaction, theme, accent)', async () => {
    const w = await mountView()
    expect(w.find('.appearance-experience__col--left .interaction-mode').exists()).toBe(true)
    expect(w.find('.appearance-experience__center .theme-orbital').exists()).toBe(true)
    expect(w.find('.appearance-experience__col--right .accent-color').exists()).toBe(true)
    w.unmount()
  })

  it('SHOW_LYRIC_CUSTOMIZATION=false: seção lyrics NÃO renderiza (branch)', async () => {
    const w = await mountView()
    expect(w.find('.appearance-experience__lyrics').exists()).toBe(false)
    expect(w.find('.lyric-customization').exists()).toBe(false)
    w.unmount()
  })

  it('chama hydrate() no onMounted', async () => {
    const w = await mountView()
    expect(state.hydrate).toHaveBeenCalledTimes(1)
    w.unmount()
  })
})
