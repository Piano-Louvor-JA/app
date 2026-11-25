// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import liturgyLocale from '../../locales/pt-BR'
import { loadLiturgyAppearance } from '../../services/liturgy-appearance'
import { useLiturgyAppearanceStore } from '../../stores/useLiturgyAppearanceStore'
import LiturgyAppearancePanel from '../LiturgyAppearancePanel.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

function mountPanel() {
  return mount(LiturgyAppearancePanel, { global: { plugins: [i18n] } })
}

describe('LiturgyAppearancePanel', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('alinhamento, tamanho e opções do título da categoria são salvos', async () => {
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="appearance-align-center"]').trigger('click')
    await wrapper.get('[data-testid="appearance-size-xl"]').trigger('click')
    await wrapper.get('[data-testid="appearance-uppercase"]').setValue(true)
    await wrapper.get('[data-testid="appearance-bold"]').setValue(false)
    await wrapper.get('[data-testid="appearance-show-time"]').setValue(false)
    await wrapper.get('[data-testid="appearance-show-subtitle"]').setValue(false)

    expect(loadLiturgyAppearance().category).toMatchObject({
      titleAlign: 'center',
      titleSize: 'xl',
      uppercase: true,
      bold: false,
      showTime: false,
      showSubtitle: false,
    })
    expect(wrapper.get('[data-testid="appearance-align-center"]').attributes('aria-pressed')).toBe('true')
  })

  it('fundo e cor do título: escolher e voltar ao padrão', async () => {
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="appearance-background"]').setValue('#1e3a5f')
    await wrapper.get('[data-testid="appearance-title-color"]').setValue('#ffd600')
    expect(loadLiturgyAppearance().category).toMatchObject({ background: '#1e3a5f', titleColor: '#ffd600' })

    await wrapper.get('[data-testid="appearance-background-reset"]').trigger('click')
    expect(loadLiturgyAppearance().category.background).toBe('')
  })

  it('lista todos os tipos; a cor escolhida vale e pode voltar à original', async () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('[data-testid^="appearance-type-color-"]').length).toBe(11)
    expect(wrapper.text()).toContain('Música')

    await wrapper.get('[data-testid="appearance-type-color-music"]').setValue('#ff0000')
    expect(loadLiturgyAppearance().typeColors).toEqual({ music: '#ff0000' })
    await wrapper.get('[data-testid="appearance-type-reset-music"]').trigger('click')
    expect(loadLiturgyAppearance().typeColors).toEqual({})
  })

  it('restaurar padrão limpa tudo; o atalho do palco avisa quem abriu', async () => {
    const store = useLiturgyAppearanceStore()
    store.updateCategory({ titleAlign: 'center' })
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="appearance-reset"]').trigger('click')
    expect(loadLiturgyAppearance().category.titleAlign).toBe('left')

    await wrapper.get('[data-testid="appearance-open-stage"]').trigger('click')
    expect(wrapper.emitted('openStage')).toHaveLength(1)
  })
})
