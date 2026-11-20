import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import FontPreview from '../FontPreview.vue'
import pt from '../../locales/pt-BR'
import en from '../../locales/en'
import es from '../../locales/es'

describe('Bible font preview', () => {
  it.each([['pt-BR', pt, 'João 3:16'], ['en', en, 'John 3:16'], ['es', es, 'Juan 3:16']] as const)('shows translated verse and the chosen face in %s', (locale, messages, reference) => {
    const w = mount(FontPreview, { props: { familyName: 'Merriweather', fontFamily: "'LouvorJA-merriweather'" }, global: { plugins: [createI18n({ legacy: false, locale, messages: { [locale]: messages } })] } })
    expect(w.find('.font-preview__reference').text()).toContain(reference)
    expect(w.find('.font-preview__verse').text().length).toBeGreaterThan(80)
    expect(w.find('.font-preview__verse').attributes('style')).toContain('LouvorJA-merriweather')
    expect(w.text()).toContain('Merriweather')
    w.unmount()
  })
  it('labels the fallback while a preview is unavailable', () => {
    const w = mount(FontPreview, { props: { familyName: 'Inter', unavailable: true }, global: { plugins: [createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': pt } })] } })
    expect(w.find('[role=status]').text()).toContain('padrão')
    w.unmount()
  })
})
