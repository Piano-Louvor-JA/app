// @vitest-environment jsdom
// CountdownConfigDialog — open/close, swatches, formats, custom colors, reset
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import CountdownConfigDialog from '../CountdownConfigDialog.vue'
import {
  COUNTDOWN_BG_PRESETS,
  COUNTDOWN_TEXT_PRESETS,
  COUNTDOWN_TIME_FORMATS,
} from '../../types/countdown'
import type { CountdownDisplayConfig } from '../../types/countdown'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      countdown: {
        configTitle: 'Configurar',
        configSubtitle: 'Aparência',
        close: 'Fechar',
        bgColor: 'Cor de fundo',
        bgColorHint: 'dica bg',
        textColor: 'Cor do texto',
        textColorHint: 'dica texto',
        timeFormat: 'Formato',
        timeFormatHint: 'dica formato',
        customColor: 'Cor personalizada',
        resetDisplay: 'Redefinir',
        apply: 'Aplicar',
      },
    },
  },
})

const config: CountdownDisplayConfig = {
  timeFormat: 'hh:mm:ss',
  bgColor: '#000000',
  textColor: '#FFFFFF',
}

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(CountdownConfigDialog, {
    props: { open: true, config, ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('CountdownConfigDialog', () => {
  it('open=false: não renderiza dialog', () => {
    const wrapper = createWrapper({ open: false })
    expect(document.querySelector('.countdown-config')).toBeNull()
    wrapper.unmount()
  })

  it('open=true: renderiza dialog com title e close', () => {
    const wrapper = createWrapper()
    const dialog = document.querySelector('.countdown-config')
    expect(dialog).toBeTruthy()
    expect(dialog!.getAttribute('role')).toBe('dialog')
    expect(document.querySelector('.countdown-config__title')!.textContent).toBe('Configurar')
    wrapper.unmount()
  })

  it('fecha pelo botão X', async () => {
    const wrapper = createWrapper()
    const closeBtn = document.querySelector('.countdown-config__icon-btn') as HTMLElement
    closeBtn.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('fecha pelo botão Aplicar', async () => {
    const wrapper = createWrapper()
    const applyBtn = document.querySelector('.countdown-config__btn--primary') as HTMLElement
    applyBtn.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('reset emite reset', async () => {
    const wrapper = createWrapper()
    const resetBtn = document.querySelector('.countdown-config__btn--danger') as HTMLElement
    resetBtn.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('reset')).toBeTruthy()
    wrapper.unmount()
  })

  it('renderiza todos os swatches de bg com active no selecionado', () => {
    const wrapper = createWrapper()
    const swatches = document.querySelectorAll('.countdown-config__swatches')[0]
    const buttons = swatches.querySelectorAll('.countdown-config__swatch')
    expect(buttons.length).toBe(COUNTDOWN_BG_PRESETS.length)
    const active = swatches.querySelector('.countdown-config__swatch--active')
    expect(active).toBeTruthy()
    wrapper.unmount()
  })

  it('clicar swatch de bg emite update:bgColor', async () => {
    const wrapper = createWrapper()
    const swatches = document.querySelectorAll('.countdown-config__swatches')[0]
    const firstSwatch = swatches.querySelector('.countdown-config__swatch') as HTMLElement
    firstSwatch.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:bgColor')).toBeTruthy()
    expect(wrapper.emitted('update:bgColor')![0]).toEqual([COUNTDOWN_BG_PRESETS[0]])
    wrapper.unmount()
  })

  it('clicar swatch de texto emite update:textColor', async () => {
    const wrapper = createWrapper()
    const swatches = document.querySelectorAll('.countdown-config__swatches')[1]
    const firstSwatch = swatches.querySelector('.countdown-config__swatch') as HTMLElement
    firstSwatch.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:textColor')![0]).toEqual([COUNTDOWN_TEXT_PRESETS[0]])
    wrapper.unmount()
  })

  it('custom color input bg emite update:bgColor com valor digitado', async () => {
    const wrapper = createWrapper()
    const colorInput = document.querySelectorAll('.countdown-config__custom input[type="color"]')[0] as HTMLInputElement
    colorInput.value = '#123456'
    colorInput.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:bgColor')![0]).toEqual(['#123456'])
    wrapper.unmount()
  })

  it('custom color input texto emite update:textColor', async () => {
    const wrapper = createWrapper()
    const colorInput = document.querySelectorAll('.countdown-config__custom input[type="color"]')[1] as HTMLInputElement
    colorInput.value = '#abcdef'
    colorInput.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:textColor')![0]).toEqual(['#abcdef'])
    wrapper.unmount()
  })

  it('renderiza formatos com active no atual e emite update:timeFormat', async () => {
    const wrapper = createWrapper()
    const formatBtns = document.querySelectorAll('.countdown-config__format-btn')
    expect(formatBtns.length).toBe(COUNTDOWN_TIME_FORMATS.length)
    const active = document.querySelector('.countdown-config__format-btn--active')
    expect(active?.textContent?.trim()).toBe('hh:mm:ss')
    ;(formatBtns[1] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:timeFormat')![0]).toEqual([COUNTDOWN_TIME_FORMATS[1]])
    wrapper.unmount()
  })
})
