// @vitest-environment jsdom
// CountdownDurationInput — parts, commit/clamp, modes, until, disabled, compact
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
        mode: 'Modo',
        modeDuration: 'Duração',
        modeUntil: 'Até',
        until: 'Até horário',
        untilHour: 'Hora',
        untilMinute: 'Minuto',
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

  it('onMode: emite update:mode', async () => {
    const wrapper = createWrapper()
    const modeBtns = wrapper.findAll('.countdown-duration__mode')
    expect(modeBtns.length).toBe(2)
    await modeBtns[1].trigger('click')
    expect(wrapper.emitted('update:mode')).toBeTruthy()
    expect(wrapper.emitted('update:mode')![0]).toEqual(['until'])
  })

  it('onMode: mesmo modo não emite', async () => {
    const wrapper = createWrapper()
    const modeBtns = wrapper.findAll('.countdown-duration__mode')
    await modeBtns[0].trigger('click') // já está em duration
    expect(wrapper.emitted('update:mode')).toBeFalsy()
  })

  it('onMode: disabled não emite', async () => {
    const wrapper = createWrapper({ disabled: true })
    const modeBtns = wrapper.findAll('.countdown-duration__mode')
    await modeBtns[1].trigger('click')
    expect(wrapper.emitted('update:mode')).toBeFalsy()
  })

  it('modo until: campos de hora/minuto, emite update:until (hora)', async () => {
    const wrapper = createWrapper({ mode: 'until', untilHour: 18, untilMinute: 30 })
    const untilInputs = wrapper.findAll('.countdown-duration__field input')
    expect(untilInputs.length).toBe(2)
    await untilInputs[0].setValue('9')
    await untilInputs[0].trigger('change')
    expect(wrapper.emitted('update:until')![0]).toEqual([9, 30])
  })

  it('modo until: emite update:until (minuto)', async () => {
    const wrapper = createWrapper({ mode: 'until', untilHour: 18, untilMinute: 30 })
    const untilInputs = wrapper.findAll('.countdown-duration__field input')
    await untilInputs[1].setValue('45')
    await untilInputs[1].trigger('change')
    expect(wrapper.emitted('update:until')![0]).toEqual([18, 45])
  })

  it('until: clamp hora 23', async () => {
    const wrapper = createWrapper({ mode: 'until', untilHour: 18, untilMinute: 0 })
    const untilInputs = wrapper.findAll('.countdown-duration__field input')
    await untilInputs[0].setValue('99')
    await untilInputs[0].trigger('change')
    expect(wrapper.emitted('update:until')![0]).toEqual([23, 0])
  })

  it('until: clamp minuto 59', async () => {
    const wrapper = createWrapper({ mode: 'until', untilHour: 18, untilMinute: 0 })
    const untilInputs = wrapper.findAll('.countdown-duration__field input')
    await untilInputs[1].setValue('99')
    await untilInputs[1].trigger('change')
    expect(wrapper.emitted('update:until')![0]).toEqual([18, 59])
  })

  it('disabled: inputs desabilitados', () => {
    const wrapper = createWrapper({ disabled: true })
    for (const input of wrapper.findAll('input')) {
      expect((input.element as HTMLInputElement).disabled).toBe(true)
    }
    expect(wrapper.classes()).toContain('countdown-duration--disabled')
  })

  it('mode until: botão until tem classe --on', () => {
    const wrapper = createWrapper({ mode: 'until' })
    const modeBtns = wrapper.findAll('.countdown-duration__mode')
    expect(modeBtns[1].classes()).toContain('countdown-duration__mode--on')
    expect(modeBtns[0].classes()).not.toContain('countdown-duration__mode--on')
  })
})
