// @vitest-environment jsdom
// CountdownDurationInput — parts, commit/clamp, disabled, compact
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import CountdownDurationInput from '../CountdownDurationInput.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      countdown: {
        duration: 'Duração',
        durationHint: 'quanto tempo',
        hours: 'Horas',
        minutes: 'Minutos',
        seconds: 'Segundos',
      },
    },
  },
})

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(CountdownDurationInput, {
    props: { durationMs: 3661000, ...props }, // 1h01m01s
    global: { plugins: [i18n] },
  })
}

describe('CountdownDurationInput', () => {
  it('renderiza campos HH/MM/SS no modo duration', () => {
    const wrapper = createWrapper()
    const inputs = wrapper.findAll('input')
    expect(inputs.length).toBe(3)
    expect((inputs[0].element as HTMLInputElement).value).toBe('1') // hours
    expect((inputs[1].element as HTMLInputElement).value).toBe('1') // minutes
    expect((inputs[2].element as HTMLInputElement).value).toBe('1') // seconds
  })

  it('modo compact: sem cabeçalho', () => {
    const wrapper = createWrapper({ compact: true })
    expect(wrapper.find('.countdown-duration__head').exists()).toBe(false)
    expect(wrapper.classes()).toContain('countdown-duration--compact')
  })

  it('mudar hours emite update:durationMs com clamp', async () => {
    const wrapper = createWrapper({ durationMs: 0 })
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('2')
    await inputs[0].trigger('change')
    const emitted = wrapper.emitted('update:durationMs')
    expect(emitted).toBeTruthy()
    // 2h = 7200000ms
    expect(emitted![0]).toEqual([7200000])
  })

  it('mudar minutes clamp 59', async () => {
    const wrapper = createWrapper({ durationMs: 0 })
    const inputs = wrapper.findAll('input')
    await inputs[1].setValue('120')
    await inputs[1].trigger('change')
    // clamp(120, 59) = 59min = 3540000ms
    expect(wrapper.emitted('update:durationMs')![0]).toEqual([3540000])
  })

  it('mudar seconds preserva hours/minutes', async () => {
    const wrapper = createWrapper({ durationMs: 3661000 }) // 1h01m01s
    const inputs = wrapper.findAll('input')
    await inputs[2].setValue('30')
    await inputs[2].trigger('change')
    // 1h01m30s = 3690000ms
    expect(wrapper.emitted('update:durationMs')![0]).toEqual([3690000])
  })

  it('só contagem regressiva: sem seletor de modo nem campos de horário', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.countdown-duration__modes').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('sem segundos: só horas e minutos', () => {
    const wrapper = createWrapper({ noSeconds: true })
    expect(wrapper.findAll('input')).toHaveLength(2)
  })

  it('disabled: inputs desabilitados', () => {
    const wrapper = createWrapper({ disabled: true })
    for (const input of wrapper.findAll('input')) {
      expect((input.element as HTMLInputElement).disabled).toBe(true)
    }
    expect(wrapper.classes()).toContain('countdown-duration--disabled')
  })
})
