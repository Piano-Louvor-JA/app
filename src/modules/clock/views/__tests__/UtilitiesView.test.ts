// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('../../components/UtilitiesHubCard.vue', () => ({
  default: {
    name: 'UtilitiesHubCard',
    props: ['titleKey', 'descriptionKey', 'icon', 'to', 'available'],
    template:
      '<div class="hub-stub" :data-to="to ?? \'\'" :data-available="String(available)">{{ titleKey }}</div>',
  },
}))

import UtilitiesView from '../UtilitiesView.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': { utilities: { title: 'Utilitários', subtitle: 'Ferramentas' } } } })

describe('UtilitiesView', () => {
  it('renderiza header e o card funcional do OBS', () => {
    const w = mount(UtilitiesView, { global: { plugins: [i18n] } })
    expect(w.find('.utilities-view__title').text()).toBe('Utilitários')
    const cards = w.findAll('.hub-stub')
    // 4 cards: temporizador, random, draw, obs. Diagnóstico saiu de
    // Utilitários — agora é card em /config/general (app#423 follow-up).
    expect(cards).toHaveLength(4)
    expect(cards.some((card) => card.attributes('data-to') === '/diagnostics')).toBe(false)
    const obs = cards.find((card) => card.text() === 'utilities.obs')
    expect(obs?.attributes('data-available')).toBe('true')
    expect(obs?.attributes('data-to')).toBe('/utilities/obs')
    const draw = cards.find((card) => card.text() === 'utilities.draw')
    expect(draw?.attributes('data-available')).toBe('false')
    w.unmount()
  })
})
