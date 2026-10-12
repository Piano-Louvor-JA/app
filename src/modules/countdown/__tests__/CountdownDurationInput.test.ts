// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import CountdownDurationInput from '../components/CountdownDurationInput.vue'

function input(wrapper: ReturnType<typeof mount>, index: number) {
  return wrapper.findAll('input')[index]
}

describe('CountdownDurationInput', () => {
  it('modo duration: decompõe ms em campos H/M/S', () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 3_723_000 }, // 1h 2m 3s
    })
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(3)
    expect((inputs[0].element as HTMLInputElement).value).toBe('1')
    expect((inputs[1].element as HTMLInputElement).value).toBe('2')
    expect((inputs[2].element as HTMLInputElement).value).toBe('3')
  })

  it('emite update:durationMs ao mudar horas', async () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 120_000 },
    })
    await input(wrapper, 0).setValue('3')
    expect(wrapper.emitted('update:durationMs')?.at(-1)).toEqual([10_920_000])
  })

  it('limita minutos e segundos a 59 e horas a valor bruto', async () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 0 },
    })
    await input(wrapper, 1).setValue('120')
    // clamp de minutos em 59: 59min = 3_540_000ms
    expect(wrapper.emitted('update:durationMs')?.at(-1)).toEqual([3_540_000])

    await input(wrapper, 0).setValue('150')
    // horas sem clamp: 150h = 540_000_000ms
    expect(wrapper.emitted('update:durationMs')?.at(-1)).toEqual([540_000_000])

    await input(wrapper, 2).setValue('30')
    expect(wrapper.emitted('update:durationMs')?.at(-1)).toEqual([30_000])
  })

  it('alterna modo entre duration e until via botões', async () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 60_000 },
    })
    const modes = wrapper.findAll('.countdown-duration__mode')
    expect(modes).toHaveLength(2)

    await modes[1].trigger('click')
    expect(wrapper.emitted('update:mode')).toEqual([['until']])

    // sem v-model, props.mode continua 'duration': clique no modo já ativo (props) não emite
    await modes[0].trigger('click')
    expect(wrapper.emitted('update:mode')).toEqual([['until']])

    // com v-model aplicado (mode='until'), clicar em duration emite de volta
    await wrapper.setProps({ mode: 'until' })
    await modes[0].trigger('click')
    expect(wrapper.emitted('update:mode')).toEqual([['until'], ['duration']])
  })

  it('disabled: não alterna modo', async () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 60_000, disabled: true },
    })
    await wrapper.findAll('.countdown-duration__mode')[1].trigger('click')
    expect(wrapper.emitted('update:mode')).toBeUndefined()
  })

  it('modo until: campos de hora/minuto emitem update:until com clamp', async () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 60_000, mode: 'until', untilHour: 18, untilMinute: 30 },
    })
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(2)
    expect((inputs[0].element as HTMLInputElement).value).toBe('18')

    await inputs[0].setValue('25')
    expect(wrapper.emitted('update:until')?.at(-1)).toEqual([23, 30])

    // segundo input usa props.untilHour ainda 18 (componente puro, sem estado interno)
    await inputs[1].setValue('99')
    expect(wrapper.emitted('update:until')?.at(-1)).toEqual([18, 59])
  })

  it('compact: omite cabeçalho', () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 60_000, compact: true },
    })
    expect(wrapper.find('.countdown-duration__head').exists()).toBe(false)
    expect(wrapper.classes()).toContain('countdown-duration--compact')
  })
})
