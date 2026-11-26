// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import liturgyLocale from '../../locales/pt-BR'

vi.mock('../../../settings/components/StageCustomizationDialog.vue', () => ({
  default: {
    name: 'StageCustomizationDialog',
    props: { open: Boolean, scope: String, title: String },
    emits: ['close'],
    template:
      '<div v-if="open" :data-dialog="title || \'palco\'"><slot><p data-testid="stage-card">palco</p></slot></div>',
  },
}))

import LiturgyAppearanceButton from '../LiturgyAppearanceButton.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

describe('LiturgyAppearanceButton', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('a paleta abre a personalização da liturgia; o atalho troca para o palco', async () => {
    const wrapper = mount(LiturgyAppearanceButton, { global: { plugins: [i18n] } })
    const open = wrapper.get('[data-testid="liturgy-appearance-open"]')
    expect(open.attributes('title')).toBe('Personalizar liturgia')
    expect(open.find('.ti-palette').exists()).toBe(true)

    await open.trigger('click')
    expect(wrapper.find('[data-dialog="Personalizar liturgia"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="appearance-align-center"]').exists()).toBe(true)

    await wrapper.get('[data-testid="appearance-open-stage"]').trigger('click')
    expect(wrapper.find('[data-dialog="Personalizar liturgia"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="stage-card"]').exists()).toBe(true)
  })
})
