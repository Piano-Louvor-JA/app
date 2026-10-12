// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import type { CountdownDisplayConfig, CountdownRuntimeState } from '../types/countdown'
import CountdownPreview from '../components/CountdownPreview.vue'

const NOW = 1_700_000_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function makeConfig(overrides: Partial<CountdownDisplayConfig> = {}): CountdownDisplayConfig {
  return {
    durationMs: 65_000,
    timeFormat: 'mm:ss',
    textColor: '#ffffff',
    ...overrides,
  } as CountdownDisplayConfig
}

function makeRuntime(overrides: Partial<CountdownRuntimeState> = {}): CountdownRuntimeState {
  return {
    status: 'idle',
    segmentStartedAt: null,
    accumulatedMs: 65_000,
    durationMs: 65_000,
    savedTimesMs: [],
    finished: false,
    ...overrides,
  }
}

describe('CountdownPreview', () => {
  it('renderiza tempo formatado e cor do config quando não urgente', () => {
    const wrapper = mount(CountdownPreview, {
      global: { plugins: [createPinia()] },
      props: {
        config: makeConfig({ textColor: '#00ff00' }),
        runtime: makeRuntime({ accumulatedMs: 35_000, durationMs: 65_000 }),
      },
    })
    expect(wrapper.find('.countdown-preview__digital').text()).toBe('00:30')
    expect(wrapper.classes()).not.toContain('countdown-preview--urgent')
    expect(wrapper.classes()).not.toContain('countdown-preview--finished')
    expect(wrapper.find('.countdown-preview__finished').exists()).toBe(false)
    expect(wrapper.find('.countdown-preview__digital').attributes('style')).toContain('color: rgb(0, 255, 0)')
  })

  it('urgente: aplica classe e textShadow de urgência', () => {
      const wrapper = mount(CountdownPreview, {
        global: { plugins: [createPinia()] },
        props: {
          config: makeConfig(),
          runtime: makeRuntime({ status: 'running', segmentStartedAt: NOW, accumulatedMs: 60_000, durationMs: 65_000 }),
        },
      })
    expect(wrapper.classes()).toContain('countdown-preview--urgent')
    expect(wrapper.find('.countdown-preview__digital').attributes('style')).toContain('rgba(0,0,0,0.45)')
  })

  it('finalizado: cor de erro, shadow e mensagem', () => {
    const wrapper = mount(CountdownPreview, {
      global: { plugins: [createPinia()] },
      props: {
        config: makeConfig(),
        runtime: makeRuntime({ status: 'idle', accumulatedMs: 65_000, durationMs: 65_000, finished: true }),
      },
    })
    expect(wrapper.classes()).toContain('countdown-preview--finished')
    const digital = wrapper.find('.countdown-preview__digital')
    expect(digital.attributes('style')).toContain('rgb(255, 59, 48)')
    expect(wrapper.find('.countdown-preview__finished').exists()).toBe(true)
  })

  it('finalizado em preview: usa var CSS de erro', () => {
    const wrapper = mount(CountdownPreview, {
      global: { plugins: [createPinia()] },
      props: {
        config: makeConfig(),
        runtime: makeRuntime({ status: 'idle', accumulatedMs: 65_000, durationMs: 65_000, finished: true }),
        preview: true,
      },
    })
    expect(wrapper.find('.countdown-preview__digital').attributes('style')).toContain(
      'var(--ds-color-error',
    )
  })

  it('sem stage: alinhamento central e fontSize pelo menor lado', () => {
    const wrapper = mount(CountdownPreview, {
      global: { plugins: [createPinia()] },
      props: { config: makeConfig(), runtime: makeRuntime() },
    })
    const style = wrapper.attributes('style')
    expect(style).toContain('align-items: center')
    expect(style).toContain('justify-content: center')
    const digitalStyle = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(digitalStyle).toContain('font-weight: 800')
    expect(digitalStyle).toContain('text-align: center')
  })

  it('com stage: usa fontSize/textColor/fontWeight/textAlign do palco', () => {
    const wrapper = mount(CountdownPreview, {
      global: { plugins: [createPinia()] },
      props: {
        config: makeConfig(),
        runtime: makeRuntime(),
        stage: {
          fontSize: 96,
          fontWeight: 300,
          textColor: '#abcdef',
          textAlign: 'left',
          textVerticalAlign: 'bottom',
          textShadow: false,
          textBox: false,
        } as never,
      },
    })
    const surface = wrapper.attributes('style')
    expect(surface).toContain('align-items: flex-start')
    expect(surface).toContain('justify-content: flex-end')
    const digital = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(digital).toContain('font-weight: 300')
    expect(digital).toContain('text-align: left')
  })

  it('com stage + textBox + shadow: aplica fundo, borda e sombra', () => {
      const wrapper = mount(CountdownPreview, {
        global: { plugins: [createPinia()] },
        props: {
          config: makeConfig(),
          runtime: makeRuntime({ status: 'running', segmentStartedAt: NOW, accumulatedMs: 0, durationMs: 65_000 }),
          stage: {
            fontSize: 96,
            fontWeight: 700,
            textColor: '#ffffff',
            textAlign: 'center',
            textVerticalAlign: 'center',
            textShadow: true,
            shadowBlur: 2,
            shadowIntensity: 0.5,
            textBox: true,
            boxBorder: true,
            boxOpacity: 0.4,
          } as never,
        },
      })
    const digital = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(digital).toContain('rgba(0,0,0,0.5)')
    expect(digital).toContain('rgba(0, 0, 0, 0.4)')
    expect(digital).toContain('border: 1px solid rgba(255, 255, 255, 0.25)')
    expect(digital).toContain('2.5vmin 1.8vmin')
  })

  it('atualiza o texto quando o runtime muda', async () => {
    const wrapper = mount(CountdownPreview, {
      global: { plugins: [createPinia()] },
      props: { config: makeConfig(), runtime: makeRuntime({ accumulatedMs: 55_000, durationMs: 65_000 }) },
    })
    expect(wrapper.find('.countdown-preview__digital').text()).toBe('00:10')
    await wrapper.setProps({ runtime: makeRuntime({ accumulatedMs: 4_000, durationMs: 65_000 }) })
    expect(wrapper.find('.countdown-preview__digital').text()).toBe('01:01')
  })

  it('com stage e container medido: fontSize proporcional ao palco', async () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 960 })
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 540 })
      const wrapper = mount(CountdownPreview, {
        global: { plugins: [createPinia()] },
        props: {
          config: makeConfig(),
          runtime: makeRuntime({ status: 'running', segmentStartedAt: NOW, accumulatedMs: 0, durationMs: 65_000 }),
          stage: {
            fontSize: 192,
            fontWeight: 600,
            textColor: '#123456',
            textAlign: 'left',
            textVerticalAlign: 'top',
            textShadow: true,
            shadowBlur: 3,
            shadowIntensity: 0.6,
            textBox: false,
          } as never,
        },
      })
      await vi.advanceTimersByTimeAsync(0)
    const digital = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(digital).toContain('font-size: 96px') // (192/1920)*960
    expect(digital).toContain('font-weight: 600')
    expect(digital).toContain('text-align: left')
    expect(digital).toContain('rgba(0,0,0,0.6)')
    const surface = wrapper.attributes('style')
    expect(surface).toContain('align-items: flex-start') // left
    expect(surface).toContain('justify-content: flex-start') // top
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 0 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 0 })
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('formato com ms altera proporção da fonte; retry de medição quando container vazio', async () => {
      const wrapper = mount(CountdownPreview, {
        global: { plugins: [createPinia()] },
        props: {
          config: makeConfig({ timeFormat: 'mm:ss.ms' }),
          runtime: makeRuntime({ status: 'running', segmentStartedAt: NOW, accumulatedMs: 0, durationMs: 65_000 }),
        },
      })
      await vi.advanceTimersByTimeAsync(150)
    const digital = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(digital).toContain('font-size: 20px') // max(0*0.28, 20)
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('stage com sombra ativa sem urgência e alinhamento right/bottom', () => {
      const wrapper = mount(CountdownPreview, {
        global: { plugins: [createPinia()] },
        props: {
          config: makeConfig(),
          runtime: makeRuntime({ status: 'running', segmentStartedAt: NOW, accumulatedMs: 0, durationMs: 65_000 }),
          stage: {
            fontSize: 96,
            fontWeight: 400,
            textColor: '#abcdef',
            textAlign: 'right',
            textVerticalAlign: 'bottom',
            textShadow: true,
            shadowBlur: 2,
            shadowIntensity: 0.3,
            textBox: false,
          } as never,
        },
      })
    const digital = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(digital).toContain('color: rgb(171, 205, 239)') // branch stage de baseTextColor
    expect(digital).toContain('rgba(0,0,0,0.3)') // sombra do palco (não urgência)
    expect(digital).toContain('text-align: right')
    const surface = wrapper.attributes('style')
    expect(surface).toContain('align-items: flex-end')
    expect(surface).toContain('justify-content: flex-end')
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('preview sem stage: cor CSS do tema e sem sombra', () => {
    const wrapper = mount(CountdownPreview, {
      global: { plugins: [createPinia()] },
      props: {
        config: makeConfig(),
        runtime: makeRuntime({ accumulatedMs: 0, durationMs: 65_000, finished: false }),
        preview: true,
      },
    })
    expect(wrapper.find('.countdown-preview__digital').attributes('style')).toContain(
      'var(--ds-color-on-surface)',
    )
    wrapper.unmount()
  })

  it('stage com textShadow desligada: sombra none', () => {
      const wrapper = mount(CountdownPreview, {
        global: { plugins: [createPinia()] },
        props: {
          config: makeConfig(),
          runtime: makeRuntime({ status: 'running', segmentStartedAt: NOW, accumulatedMs: 0, durationMs: 65_000 }),
          stage: {
            fontSize: 96,
            fontWeight: 400,
            textColor: '#ffffff',
            textAlign: 'center',
            textVerticalAlign: 'center',
            textShadow: false,
            shadowBlur: 1,
            shadowIntensity: 0.4,
            textBox: false,
          } as never,
        },
      })
    expect(wrapper.find('.countdown-preview__digital').attributes('style')).toContain(
      'text-shadow: none',
    )
    vi.useRealTimers()
    wrapper.unmount()
  })
})

