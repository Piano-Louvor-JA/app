// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('../../components/UtilitiesHubCard.vue', () => ({
  default: {
    name: 'UtilitiesHubCard',
    props: ['titleKey', 'descriptionKey', 'icon', 'available'],
    template: '<div class="hub-stub">{{ titleKey }}</div>',
  },
}))

import UtilitiesView from '../UtilitiesView.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': { utilities: { title: 'Utilitários', subtitle: 'Ferramentas' } } } })

describe('UtilitiesView', () => {
  it('renderiza header e o card desabilitado do OBS', () => {
    const w = mount(UtilitiesView, { global: { plugins: [i18n] } })
    expect(w.find('.utilities-view__title').text()).toBe('Utilitários')
    const cards = w.findAll('.hub-stub')
    expect(cards).toHaveLength(4)
    expect(cards.map((card) => card.text())).toContain('utilities.obs')
    w.unmount()
  })
})
