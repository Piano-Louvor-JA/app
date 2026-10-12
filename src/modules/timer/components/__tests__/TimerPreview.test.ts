// @vitest-environment jsdom
// Cobertura TimerPreview.vue (gaps_map3): fontSize com/sem stage, textColor
// (stage/preview/config), digitalStyle (shadow/box), stageFlexJustify, measure.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('../../composables/useTimer', async () => {
  const { computed } = await import('vue')
  return {
    useTimerDisplay: () => ({
      formattedTime: computed(() => '01:23'),
      now: computed(() => 0),
      config: computed(() => ({})),
      runtime: computed(() => ({})),
      elapsedMs: computed(() => 0),
    }),
  }
})

import TimerPreview from '../TimerPreview.vue'
import type { StageSettings } from '../../../settings/types/stage-settings'

const stage: StageSettings = {
  backgroundColor: '#000',
  backgroundImage: null,
  textColor: '#ff0000',
  fontSize: 96,
  fontWeight: 600,
  textAlign: 'center',
  textVerticalAlign: 'middle',
  textShadow: true,
  shadowBlur: 3,
  shadowIntensity: 0.5,
  textBox: false,
  boxOpacity: 0.4,
  boxBorder: false,
} as unknown as StageSettings

const config = { timeFormat: 'mm:ss', bgColor: '#111', textColor: '#00ff00' } as never

function mountTimer(props: Record<string, unknown> = {}) {
  return mount(TimerPreview, {
    props: { config, runtime: {}, ...props },
    attachTo: document.body,
  })
}

function setSize(w: ReturnType<typeof mount>, width: number, height: number) {
  const el = w.find('.timer-preview').element as HTMLElement
  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TimerPreview.vue', () => {
  it('renderiza o tempo formatado', () => {
    const w = mountTimer()
    expect(w.find('.timer-preview__digital').text()).toBe('01:23')
    w.unmount()
  })

  it('com stage + largura medida: fontSize escala pela largura (96/1920*400)', async () => {
    const w = mountTimer({ stage })
    setSize(w, 400, 300)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('font-size: 20px')
    expect(style).toContain('rgb(255, 0, 0)')
    w.unmount()
  })

  it('sem stage: cor vem do config.textColor e peso 800', async () => {
    const w = mountTimer()
    setSize(w, 400, 300)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('rgb(0, 255, 0)')
    expect(style).toContain('font-weight: 800')
    w.unmount()
  })

  it('preview sem stage: textShadow none (branch)', async () => {
    const w = mountTimer({ preview: true })
    setSize(w, 400, 300)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('text-shadow: none')
    w.unmount()
  })

  it('sem stage sem preview: textShadow glow default', async () => {
    const w = mountTimer()
    setSize(w, 400, 300)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('text-shadow: 0 4px 30px')
    w.unmount()
  })

  it('stage com textShadow: shadow do Palco aplicado', async () => {
    const w = mountTimer({ stage })
    setSize(w, 400, 300)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('text-shadow: 0 0 3vh rgba(0,0,0,0.5)')
    w.unmount()
  })

  it('stage textBox: background/border/padding aplicados', async () => {
    const st = { ...stage, textBox: true, boxOpacity: 0.6, boxBorder: true } as StageSettings
    const w = mountTimer({ stage: st })
    setSize(w, 400, 300)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('rgba(0, 0, 0, 0.6)')
    expect(style).toContain('border: 1px solid')
    w.unmount()
  })

  it('preview:true sem stage → cor var(--ds-color-on-surface) (branch textColor)', () => {
    const w = mountTimer({ preview: true })
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('--ds-color-on-surface')
    w.unmount()
  })

  it('surfaceStyle: center/center sem stage', () => {
    const w = mountTimer()
    const style = w.find('.timer-preview').attributes('style') ?? ''
    expect(style).toContain('align-items: center')
    expect(style).toContain('justify-content: center')
    w.unmount()
  })

  it('surfaceStyle: alinhamentos do stage (top/left)', () => {
    const st = { ...stage, textVerticalAlign: 'top', textAlign: 'left' } as StageSettings
    const w = mountTimer({ stage: st })
    const style = w.find('.timer-preview').attributes('style') ?? ''
    expect(style).toContain('align-items: flex-start')
    expect(style).toContain('justify-content: flex-start')
    w.unmount()
  })

  it('stage bottom/right → flex-end/flex-end', () => {
    const st = { ...stage, textVerticalAlign: 'bottom', textAlign: 'right' } as StageSettings
    const w = mountTimer({ stage: st })
    const style = w.find('.timer-preview').attributes('style') ?? ''
    expect(style).toContain('align-items: flex-end')
    expect(style).toContain('justify-content: flex-end')
    w.unmount()
  })

  it('sem stage: fontSize pelo min(w,h) com ratio 0.36 (sem ms) e clamp 20', async () => {
    const w = mountTimer()
    setSize(w, 200, 100)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('font-size: 36px')
    w.unmount()
  })

  it('timeFormat com ms: ratio 0.28', async () => {
    const w = mountTimer({ config: { ...config, timeFormat: 'mm:ss.ms' } as never })
    setSize(w, 200, 100)
    await nextTick()
    const style = w.find('.timer-preview__digital').attributes('style') ?? ''
    expect(style).toContain('font-size: 28')
    w.unmount()
  })

  it('onUnmounted: remove listener de resize', () => {
    const spy = vi.spyOn(window, 'removeEventListener')
    const w = mountTimer()
    w.unmount()
    expect(spy).toHaveBeenCalledWith('resize', expect.any(Function))
    spy.mockRestore()
  })

  it('measure com dimensões 0: agenda retry via setTimeout', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    const w = mountTimer()
    const el = w.find('.timer-preview').element as HTMLElement
    Object.defineProperty(el, 'offsetWidth', { value: 0, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: 0, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100)
    setTimeoutSpy.mockRestore()
    w.unmount()
  })
})
