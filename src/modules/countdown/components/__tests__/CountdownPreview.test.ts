// @vitest-environment jsdom
// CountdownPreview — formattedTime, urgent/finished, digitalStyle, surfaceStyle, stage
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('../../composables/useCountdown', () => ({
  useCountdownDisplay: () => display,
}))

import CountdownPreview from '../CountdownPreview.vue'
import type { CountdownDisplayConfig, CountdownRuntimeState } from '../types/countdown'

const display = {
  formattedTime: ref('00:01:00'),
  isUrgent: ref(false),
  isFinished: ref(false),
}

const config: CountdownDisplayConfig = {
  timeFormat: 'hh:mm:ss',
  bgColor: '#000000',
  textColor: '#FFFFFF',
}

const runtime: CountdownRuntimeState = {
  status: 'idle',
  segmentStartedAt: null,
  accumulatedMs: 0,
  durationMs: 60000,
  savedTimesMs: [],
  finished: false,
}

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: { pt: { countdown: { finished: 'Encerrado' } } },
})

function createWrapper(overrides: Record<string, unknown> = {}) {
  return mount(CountdownPreview, {
    props: { config, runtime, ...overrides },
    global: { plugins: [i18n] },
  })
}

describe('CountdownPreview', () => {
  it('renderiza tempo formatado', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.countdown-preview__digital').text()).toBe('00:01:00')
  })

  it('normal: sem classes urgent/finished', () => {
    const wrapper = createWrapper()
    expect(wrapper.classes()).not.toContain('countdown-preview--urgent')
    expect(wrapper.classes()).not.toContain('countdown-preview--finished')
    expect(wrapper.find('.countdown-preview__finished').exists()).toBe(false)
  })

  it('urgent: classe --urgent, cor #ffa726, textShadow overlay', () => {
    display.isUrgent.value = true
    const wrapper = createWrapper()
    expect(wrapper.classes()).toContain('countdown-preview--urgent')
    expect(wrapper.find('.countdown-preview__digital').attributes('style')).toContain('rgb(255, 167, 38)')
    display.isUrgent.value = false
  })

  it('finished: classe --finished, mensagem, cor de erro', () => {
    display.isFinished.value = true
    const wrapper = createWrapper()
    expect(wrapper.classes()).toContain('countdown-preview--finished')
    expect(wrapper.find('.countdown-preview__finished').text()).toBe('Encerrado')
    expect(wrapper.classes()).toContain('countdown-preview--finished')
    expect(wrapper.find('.countdown-preview__finished').exists()).toBe(true)
    display.isFinished.value = false
  })

  it('finished sem preview: cor #ff3b30', () => {
    display.isFinished.value = true
    const wrapper = createWrapper({ preview: false })
    expect(wrapper.find('.countdown-preview__digital').attributes('style')).toContain('rgb(255, 59, 48)')
    display.isFinished.value = false
  })

  it('preview: textShadow none, cor var(--ds-color-on-surface)', () => {
    const wrapper = createWrapper({ preview: true })
    const style = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(style).toContain('var(--ds-color-on-surface)')
    expect(style).toContain('text-shadow: none')
  })

  it('sem stage: font-weight 800, textAlign center, fallback shadow', () => {
    const wrapper = createWrapper({ preview: false })
    const style = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(style).toContain('font-weight: 800')
    expect(style).toContain('text-align: center')
    expect(style).toContain('0 4px 30px rgba(0, 0, 0, 0.35)')
  })

  it('com stage: usa fontSize proporcional, fontWeight, textBox', () => {
    const wrapper = createWrapper({
      stage: {
        fontSize: 96,
        fontWeight: 600,
        textColor: '#00FF00',
        textAlign: 'left',
        textVerticalAlign: 'top',
        textShadow: true,
        shadowBlur: 2,
        shadowIntensity: 0.5,
        textBox: true,
        boxOpacity: 0.4,
        boxBorder: true,
      },
    })
    const style = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(style).toContain('font-weight: 600')
    expect(style).toContain('rgb(0, 255, 0)')
    expect(style).toContain('rgba(0, 0, 0, 0.4)')
    expect(style).toContain('1px solid rgba(255, 255, 255, 0.25)')
    // surface: coluna com align top/left
    const surface = wrapper.find('.countdown-preview').attributes('style')
    expect(surface).toContain('align-items: flex-start')
    expect(surface).toContain('justify-content: flex-start')
  })

  it('stage textBox false: background transparent, border none', () => {
    const wrapper = createWrapper({
      stage: {
        fontSize: 96,
        fontWeight: 400,
        textColor: '#FFFFFF',
        textAlign: 'center',
        textVerticalAlign: 'middle',
        textShadow: false,
        shadowBlur: 1,
        shadowIntensity: 0.3,
        textBox: false,
        boxOpacity: 0.4,
        boxBorder: false,
      },
    })
    const style = wrapper.find('.countdown-preview__digital').attributes('style')
    expect(style).toContain('font-weight: 400')
    expect(style).toContain('background: transparent')
    expect(style).not.toContain('border: 1px')
  })

  it('timeFormat com ms: ratio menor no fontSize fallback', async () => {
    display.formattedTime.value = '00:01:00.5'
    const wrapper = createWrapper({
      config: { ...config, timeFormat: 'hh:mm:ss.ms' },
    })
    // fallback usa min(w,h)*0.28 — só garante que renderiza
    expect(wrapper.find('.countdown-preview__digital').exists()).toBe(true)
    display.formattedTime.value = '00:01:00'
  })
})
