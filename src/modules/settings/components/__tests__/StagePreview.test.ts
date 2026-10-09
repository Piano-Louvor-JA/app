// @vitest-environment jsdom
// StagePreview — sample/footer por módulo, containerStyle, textStyle, boxStyle
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'

import StagePreview from '../StagePreview.vue'
import type { StageSettings } from '../types/stage-settings'

// DEFAULT real não é mockado — importar antes do mock estragaria; usar fixture:
const base: StageSettings = {
  backgroundColor: '#0A0E1A',
  textColor: '#FFFFFF',
  fontSize: 96,
  fontWeight: 600,
  margin: 120,
  textShadow: true,
  shadowBlur: 2.2,
  shadowIntensity: 0.8,
  textBox: true,
  boxOpacity: 0.45,
  boxBorder: true,
  textAlign: 'center',
  textVerticalAlign: 'middle',
  footerRefColor: '#FCCE02',
  footerRefWeight: 600,
  showBibleVersion: true,
  bibleFontSize: 84,
  bibleFontWeight: 500,
  bibleTextColor: '#FFFFFF',
  backgroundImage: null,
} as StageSettings

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(StagePreview, {
    props: { settings: { ...base }, ...props },
  })
}

describe('StagePreview', () => {
  it('módulo hino: sample com 2 linhas, sem footer', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.stage-preview__text').text()).toContain('O nosso sol')
    expect(wrapper.find('.stage-preview__footer').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('stage-preview--bible')
  })

  it('módulo bible: sample de versículo + footer com referência', () => {
    const wrapper = createWrapper({ module: 'bible' })
    expect(wrapper.find('.stage-preview__text').text()).toContain('Porque Deus amou')
    expect(wrapper.find('.stage-preview__footer').exists()).toBe(true)
    expect(wrapper.find('.stage-preview__footer').text()).toBe('João 3:16 — ARC')
    expect(wrapper.classes()).toContain('stage-preview--bible')
  })

  it('bible sem showBibleVersion: footer escondido', () => {
    const wrapper = createWrapper({ module: 'bible', settings: { ...base, showBibleVersion: false } })
    expect(wrapper.find('.stage-preview__footer').exists()).toBe(false)
  })

  it('containerStyle: backgroundColor aplicado', () => {
    const wrapper = createWrapper({ settings: { ...base, backgroundColor: '#123456' } })
    const style = wrapper.find('.stage-preview').attributes('style')
    expect(style).toContain('background-color: rgb(18, 52, 86)')
  })

  it('textStyle: textColor e fontSize cqw (hino)', () => {
    const wrapper = createWrapper({ settings: { ...base, fontSize: 96, textColor: '#FF0000' } })
    const style = wrapper.find('.stage-preview__text').attributes('style')
    expect(style).toContain('rgb(255, 0, 0)')
    expect(style).toContain('font-weight: 600')
  })

  it('textStyle bible: usa bibleFontSize e bibleTextColor', () => {
    const wrapper = createWrapper({
      module: 'bible',
      settings: { ...base, bibleFontSize: 84, bibleTextColor: '#00FF00' },
    })
    const style = wrapper.find('.stage-preview__text').attributes('style')
    expect(style).toContain('rgb(0, 255, 0)')
    expect(style).toContain('font-weight: 500')
  })

  it('textStyle: textShadow proporcional quando ativo', () => {
    const wrapper = createWrapper({ settings: { ...base, textShadow: true, shadowBlur: 2.2, shadowIntensity: 0.8 } })
    const style = wrapper.find('.stage-preview__text').attributes('style')
    expect(style).toContain('text-shadow')
    expect(style).toContain('rgba(0,0,0,0.8)')
  })

  it('textStyle: textShadow none quando desativado', () => {
    const wrapper = createWrapper({ settings: { ...base, textShadow: false } })
    const style = wrapper.find('.stage-preview__text').attributes('style')
    expect(style).toContain('text-shadow: none')
  })

  it('boxStyle: caixinha com opacity e borda quando textBox ativo', () => {
    const wrapper = createWrapper({ settings: { ...base, textBox: true, boxOpacity: 0.45, boxBorder: true } })
    const style = wrapper.find('.stage-preview__box').attributes('style')
    expect(style).toContain('rgba(0, 0, 0, 0.45)')
    expect(style).toContain('1px solid rgba(255, 255, 255, 0.25)')
    expect(style).toContain('1.4cqw 0 1.4cqw 0')
  })

  it('boxStyle: textBox false → style vazio', () => {
    const wrapper = createWrapper({ settings: { ...base, textBox: false } })
    expect(wrapper.find('.stage-preview__box').attributes('style')).toBeUndefined()
  })

  it('boxStyle: boxBorder false → border none', () => {
    const wrapper = createWrapper({ settings: { ...base, textBox: true, boxBorder: false } })
    const style = wrapper.find('.stage-preview__box').attributes('style')
    expect(style).not.toContain('border: 1px')
  })

  it('footerStyle: cor e peso do rodapé', () => {
    const wrapper = createWrapper({
      module: 'bible',
      settings: { ...base, footerRefColor: '#FFCC00', footerRefWeight: 800 },
    })
    const style = wrapper.find('.stage-preview__footer').attributes('style')
    expect(style).toContain('rgb(255, 204, 0)')
    expect(style).toContain('font-weight: 800')
  })

  it('backgroundImage com dataURL: aplica url(...)', () => {
    const dataUrl = 'data:image/png;base64,AAA'
    const wrapper = createWrapper({ settings: { ...base, backgroundImage: dataUrl } })
    const style = wrapper.find('.stage-preview').attributes('style')
    expect(style).toContain('background-image')
  })
})
