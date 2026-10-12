// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import {
  useTimerDisplay,
  useTimerFeature,
  useTimerTick,
} from '../useTimer'
import { useTimerStore } from '../../stores/useTimerStore'

let onRaf: FrameRequestCallback | null = null

beforeEach(() => {
  localStorage.clear()
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
  vi.useRealTimers()
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

type Exposed = Record<string, { value: unknown }>

describe('useTimerTick', () => {
  it('ativo: tick atualiza; inativo: tick não atualiza; unmount cancela', () => {
    const t0 = Date.now()
    let active = true
    const wrapper = mountWith(() => useTimerTick(() => active))
    expect(onRaf).not.toBeNull()

    vi.setSystemTime(t0 + 1000)
    onRaf!()
    const e = (wrapper.vm as unknown as { exposed: { now: { value: number } } }).exposed
    expect(e.now.value).toBe(t0 + 1000)

    active = false
    vi.setSystemTime(t0 + 2000)
    onRaf!()
    expect(e.now.value).toBe(t0 + 1000) // congelado (active=false)

    wrapper.unmount()
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled()
  })
})

describe('useTimerDisplay', () => {
  it('usa store por padrão e formata elapsed', () => {
    const store = useTimerStore()
    store.start()
    vi.setSystemTime(Date.now() + 1500)
    const wrapper = mountWith(() => useTimerDisplay())
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    onRaf!() // tick: elapsed cresce com o clock adiantado
    const elapsed = e.elapsedMs.value as number
    expect(elapsed).toBeGreaterThanOrEqual(1500)
    expect(typeof e.formattedTime.value).toBe('string')
    expect(String(e.formattedTime.value)).toContain('00')
    wrapper.unmount()
  })

  it('sources custom têm prioridade sobre o store', () => {
    const wrapper = mountWith(() =>
      useTimerDisplay(
        () => ({ timeFormat: 'mm:ss' }) as never,
        () => ({
          status: 'paused',
          accumulatedMs: 65_000,
          segmentStartedAt: null,
        }) as never,
      ),
    )
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    expect(e.elapsedMs.value).toBe(65_000)
    expect(e.formattedTime.value).toBe('01:05')
    wrapper.unmount()
  })
})

describe('useTimerFeature', () => {
  it('hidrata, expõe computeds e delega ações', async () => {
    const store = useTimerStore()
    const hydrateSpy = vi.spyOn(store, 'hydrate')
    const wrapper = mountWith(() => useTimerFeature())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed

    expect(hydrateSpy).toHaveBeenCalledOnce()
    expect(f.config.value).toBe(store.config)
    expect(f.runtime.value).toBe(store.runtime)
    expect(f.isRunning.value).toBe(false)
    expect(f.isPaused.value).toBe(false)
    expect(f.isProjecting.value).toBe(false)
    expect(f.configOpen.value).toBe(false)

    f.setTimeFormat('mm:ss')
    expect(store.config.timeFormat).toBe('mm:ss')
    f.setBgColor('#010203')
    expect(store.config.bgColor).toBe('#010203')
    f.setTextColor('#040506')
    expect(store.config.textColor).toBe('#040506')
    f.resetDisplayToDefault()

    f.openConfig()
    expect(f.configOpen.value).toBe(true)
    f.closeConfig()
    expect(f.configOpen.value).toBe(false)

    f.start()
    expect(f.isRunning.value).toBe(true)
    f.pause()
    expect(f.isPaused.value).toBe(true)
    expect(f.isRunning.value).toBe(false)
    f.reset()
    expect(f.isRunning.value).toBe(false)
    expect(f.isPaused.value).toBe(false)

    f.start()
    f.saveMark()
    expect(store.runtime.savedTimesMs.length).toBe(1)
    f.removeSavedMark(0)
    expect(store.runtime.savedTimesMs.length).toBe(0)
    f.clearSavedMarks()

    await f.toggleProjection()
    await f.syncProjection()
    await f.clearProjection()
    wrapper.unmount()
  })
})
