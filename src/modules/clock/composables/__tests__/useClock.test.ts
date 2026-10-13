// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import {
  useClockDisplay,
  useClockFeature,
  useClockTick,
} from '../useClock'
import { useClockStore } from '../../stores/useClockStore'

let onRaf: FrameRequestCallback | null = null

beforeEach(() => {
  setActivePinia(createPinia())
  onRaf = null
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
    onRaf = cb
    return 1
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mountWith(setup: () => unknown) {
  return mount(
    defineComponent({
      setup() {
        return { exposed: setup() }
      },
      render() {
        return h('div')
      },
    }),
  )
}

describe('useClockTick', () => {
  it('agenda rAF no mount e cancela no unmount; tick atualiza now', () => {
    const wrapper = mountWith(() => useClockTick())
    expect(onRaf).not.toBeNull()
    // dispara um frame manualmente: now muda
    const before = (wrapper.vm as unknown as { exposed: { now: { value: Date } } }).exposed.now.value.getTime()
    vi.setSystemTime(before + 5000)
    onRaf!()
    const after = (wrapper.vm as unknown as { exposed: { now: { value: Date } } }).exposed.now.value.getTime()
    expect(after - before).toBe(5000)
    wrapper.unmount()
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('useClockDisplay', () => {
  it('ângulos e formatação a partir de data fixa', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15, 13, 30, 45, 500))
    const wrapper = mountWith(() => useClockDisplay())
    const exposed = wrapper.vm as unknown as {
      exposed: {
        hourAngle: { value: number }
        minuteAngle: { value: number }
        secondAngle: { value: number }
        formattedTime: { value: string }
        formattedSeconds: { value: string }
        ampm: { value: string }
        config: { value: { format24h: boolean } }
      }
    }
    const e = exposed.exposed
    // 13h30m45.5s → (13%12)=1 → 1*30 + 30*0.5 = 45
    expect(e.hourAngle.value).toBeCloseTo(45)
    expect(e.minuteAngle.value).toBeCloseTo(180 + 4.5)
    expect(e.secondAngle.value).toBeCloseTo(270 + 3)
    expect(e.formattedTime.value).toBe('13:30')
    expect(e.formattedSeconds.value).toBe('45')
    expect(e.ampm.value).toBe('PM')
    expect(e.config.value.format24h).toBe(true)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('formato 12h inclui AM/PM e configSource custom tem prioridade', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15, 9, 5, 3, 0))
    const wrapper = mountWith(() =>
      useClockDisplay(() => ({ format24h: false } as never)),
    )
    const e = (wrapper.vm as unknown as {
      exposed: { formattedTime: { value: string }; ampm: { value: string } }
    }).exposed
    expect(e.formattedTime.value).toBe('09:05')
    expect(e.ampm.value).toBe('AM')
    wrapper.unmount()
    vi.useRealTimers()
  })
})

describe('useClockFeature', () => {
  it('hidrata store, expõe computeds e delega setters', async () => {
    const store = useClockStore()
    const hydrateSpy = vi.spyOn(store, 'hydrate')
    const wrapper = mountWith(() => useClockFeature())
    const f = (wrapper.vm as unknown as { exposed: Record<string, { value: unknown }> }).exposed

    expect(hydrateSpy).toHaveBeenCalledOnce()
    expect(f.config.value).toBe(store.config)
    expect(f.isAnalog.value).toBe(store.isAnalog)
    expect(f.isProjecting.value).toBe(false)
    expect(f.configOpen.value).toBe(false)

    f.setStyle('digital')
    expect(store.config.style).toBe('digital')
    f.setShowSeconds(false)
    expect(store.config.showSeconds).toBe(false)
    f.setFormat24h(false)
    expect(store.config.format24h).toBe(false)
    f.setBgColor('#abcdef')
    expect(store.config.bgColor).toBe('#abcdef')
    f.setTextColor('#123456')
    expect(store.config.textColor).toBe('#123456')
    f.resetToDefault()

    f.openConfig()
    expect(f.configOpen.value).toBe(true)
    f.closeConfig()
    expect(f.configOpen.value).toBe(false)

    await f.toggleProjection()
    await f.syncProjection()
    await f.clearProjection()
    wrapper.unmount()
  })
})
