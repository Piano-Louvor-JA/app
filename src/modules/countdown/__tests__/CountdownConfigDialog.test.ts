// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import { COUNTDOWN_BG_PRESETS, COUNTDOWN_TEXT_PRESETS, COUNTDOWN_TIME_FORMATS } from '../types/countdown'
import CountdownConfigDialog from '../components/CountdownConfigDialog.vue'

const config = {
  timeFormat: 'mm:ss' as const,
  bgColor: COUNTDOWN_BG_PRESETS[0],
  textColor: COUNTDOWN_TEXT_PRESETS[0],
}

function q<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel)
  expect(el, `esperado elemento ${sel}`).toBeTruthy()
  return el as T
}

function qa<T extends Element = HTMLElement>(sel: string): T[] {
  return Array.from(document.querySelectorAll<T>(sel))
}

describe('CountdownConfigDialog', () => {
  it('fechado: não renderiza nada', () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: false, config },
    })
    expect(document.querySelector('.countdown-config')).toBeNull()
    wrapper.unmount()
  })

  it('aberto: dialog com header, presets e formatos', () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: true, config },
    })
    expect(q('[role="dialog"]')).toBeTruthy()
    expect(qa('.countdown-config__swatch')).toHaveLength(
      COUNTDOWN_BG_PRESETS.length + COUNTDOWN_TEXT_PRESETS.length,
    )
    expect(qa('input[type="color"]')).toHaveLength(2)
    expect(qa('.countdown-config__format-btn')).toHaveLength(COUNTDOWN_TIME_FORMATS.length)
    wrapper.unmount()
  })

  it('swatch ativo marcado via aria-checked', () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: true, config },
    })
    expect(qa('.countdown-config__swatch[aria-checked="true"]').length).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })

  it('clique em swatch de fundo emite update:bgColor', async () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: true, config },
    })
    const bgIndex = COUNTDOWN_BG_PRESETS.length - 1
    await qa('.countdown-config__swatch')[bgIndex].click()
    expect(wrapper.emitted('update:bgColor')).toEqual([[COUNTDOWN_BG_PRESETS[bgIndex]]])
    wrapper.unmount()
  })

  it('clique em swatch de texto emite update:textColor', async () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: true, config },
    })
    const swatches = qa('.countdown-config__swatch')
    await swatches[COUNTDOWN_BG_PRESETS.length + COUNTDOWN_TEXT_PRESETS.length - 1].click()
    expect(wrapper.emitted('update:textColor')).toEqual([[COUNTDOWN_TEXT_PRESETS.at(-1)]])
    wrapper.unmount()
  })

  it('inputs color customizados emitem update:bgColor/textColor', async () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: true, config },
    })
    const colorInputs = qa('input[type="color"]')
    expect(colorInputs).toHaveLength(2)

    colorInputs[0].value = '#123456'
    colorInputs[0].dispatchEvent(new Event('input'))
    expect(wrapper.emitted('update:bgColor')).toEqual([['#123456']])

    colorInputs[1].value = '#654321'
    colorInputs[1].dispatchEvent(new Event('input'))
    expect(wrapper.emitted('update:textColor')).toEqual([['#654321']])
    wrapper.unmount()
  })

  it('botão de formato emite update:timeFormat', async () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: true, config },
    })
    const btns = qa('.countdown-config__format-btn')
    await btns[btns.length - 1].click()
    expect(wrapper.emitted('update:timeFormat')).toEqual([[COUNTDOWN_TIME_FORMATS.at(-1)]])
    wrapper.unmount()
  })

  it('botões fechar/reset do footer e header emitem eventos', async () => {
    const wrapper = mount(CountdownConfigDialog, {
      attachTo: document.body,
      props: { open: true, config },
    })
    await q('.countdown-config__icon-btn').click()
    expect(wrapper.emitted('close')).toHaveLength(1)

    await q('.countdown-config__btn--danger').click()
    expect(wrapper.emitted('reset')).toHaveLength(1)

    await q('.countdown-config__btn--primary').click()
    expect(wrapper.emitted('close')).toHaveLength(2)
    wrapper.unmount()
  })
})
