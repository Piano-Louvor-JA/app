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
  it('decompõe ms em campos H/M/S', () => {
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

  it('disabled: campos travados', () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 60_000, disabled: true },
    })
    expect(wrapper.find('.countdown-duration__mode').exists()).toBe(false)
    for (const field of wrapper.findAll('input')) expect((field.element as HTMLInputElement).disabled).toBe(true)
  })

  it('compact: omite cabeçalho', () => {
    const wrapper = mount(CountdownDurationInput, {
      props: { durationMs: 60_000, compact: true },
    })
    expect(wrapper.find('.countdown-duration__head').exists()).toBe(false)
    expect(wrapper.classes()).toContain('countdown-duration--compact')
  })
})
