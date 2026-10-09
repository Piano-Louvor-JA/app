// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import {
  useCountdownDisplay,
  useCountdownFeature,
  useCountdownTick,
} from '../useCountdown'
import { useCountdownStore } from '../../stores/useCountdownStore'

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

describe('useCountdownTick', () => {
  it('ativo: atualiza; inativo: congela; unmount cancela', () => {
    let active = true
    const t0 = Date.now()
    const wrapper = mountWith(() => useCountdownTick(() => active))
    const e = (wrapper.vm as unknown as { exposed: { now: { value: number } } }).exposed

    vi.setSystemTime(t0 + 1000)
    onRaf!()
    expect(e.now.value).toBe(t0 + 1000)

    active = false
    vi.setSystemTime(t0 + 5000)
    onRaf!()
    expect(e.now.value).toBe(t0 + 1000)

    wrapper.unmount()
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled()
  })
})

describe('useCountdownDisplay', () => {
  it('sources custom: remaining, formatted, isUrgent, isFinished', () => {
    // pausa em 65s acumulados → resta duração - 65s
    const wrapper = mountWith(() =>
      useCountdownDisplay(
        () => ({ timeFormat: 'mm:ss' }) as never,
        () => ({
          mode: 'duration',
          status: 'paused',
          durationMs: 120_000,
          accumulatedMs: 65_000,
          segmentStartedAt: null,
          finished: false,
        }) as never,
      ),
    )
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    expect(e.remainingMs.value).toBe(55_000)
    expect(e.formattedTime.value).toBe('00:55')
    // 55s restantes, paused → isUrgent true (<=60s e status paused)
    expect(e.isUrgent.value).toBe(true)
    expect(e.isFinished.value).toBe(false)
    wrapper.unmount()
  })

  it('until mode: finished quando passou do horário; tick ativo', () => {
    const wrapper = mountWith(() =>
      useCountdownDisplay(
        () => ({ timeFormat: 'mm:ss' }) as never,
        () => ({
          mode: 'until',
          status: 'idle',
          durationMs: 0,
          accumulatedMs: 0,
          segmentStartedAt: null,
          finished: false,
        }) as never,
      ),
    )
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    expect(e.isUrgent.value).toBe(false)
    // default 18:00: se agora já passou de 18h, finished (remaining <= 0)
    const h = new Date().getHours()
    expect(e.isFinished.value).toBe(h >= 18)
    // tick agendado (mode until sempre ativo) e executado
    expect(onRaf).not.toBeNull()
    onRaf!() // exercita o callback do rAF do display
    expect(e.remainingMs.value).toBeDefined()
    wrapper.unmount()
  })

  it('sem sources: usa o store; finished=true e running/paused branches', () => {
    const store = useCountdownStore()
    const wrapper = mountWith(() => useCountdownDisplay())
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    // fallback pro store (48/49)
    expect(e.config.value).toBe(store.config)
    expect(e.runtime.value).toBe(store.runtime)

    // duração <= 0 → false (76). Store default tem duração > 0, forço 0.
    store.setDurationMs(0)
    expect(e.isFinished.value).toBe(false)
    store.setDurationMs(1000)

    // finished flag true → true (77)
    store.setDurationMs(1000)
    store.start()
    // força finished
    store.runtime.finished = true
    expect(e.isFinished.value).toBe(true)

    // running com remaining > 0 → false (79 running side false)
    store.runtime.finished = false
    expect(e.isFinished.value).toBe(false)

    // até o fim → true (79 accumulated side)
    vi.setSystemTime(Date.now() + 2000)
    onRaf!()
    expect(e.isFinished.value).toBe(true)

    // accumulatedMs >= duração com status nem running nem paused → finished
    store.reset()
    store.runtime.status = 'idle'
    store.runtime.accumulatedMs = 1500
    store.runtime.finished = false
    expect(e.remainingMs.value).toBeLessThanOrEqual(0)
    expect(e.isFinished.value).toBe(true)
    wrapper.unmount()
  })
})

describe('useCountdownFeature', () => {
  it('hidrata, expõe computeds e delega ações', async () => {
    const store = useCountdownStore()
    const hydrateSpy = vi.spyOn(store, 'hydrate')
    const wrapper = mountWith(() => useCountdownFeature())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed

    expect(hydrateSpy).toHaveBeenCalledOnce()
    expect(f.config.value).toBe(store.config)
    expect(f.runtime.value).toBe(store.runtime)
    expect(f.isRunning.value).toBe(false)
    expect(f.isPaused.value).toBe(false)
    expect(f.canStart.value).toBe(store.canStart)
    expect(f.isProjecting.value).toBe(false)
    expect(f.configOpen.value).toBe(false)
    expect(f.durationParts.value).toBeDefined()

    f.setTimeFormat('mm:ss')
    expect(store.config.timeFormat).toBe('mm:ss')
    f.setBgColor('#0a0b0c')
    f.setTextColor('#0d0e0f')
    f.resetDisplayToDefault()

    f.openConfig()
    expect(f.configOpen.value).toBe(true)
    f.closeConfig()
    expect(f.configOpen.value).toBe(false)

    f.setDurationMs(60_000)
    expect(store.runtime.durationMs).toBe(60_000)
    expect(f.canStart.value).toBe(true)

    f.start()
    expect(f.isRunning.value).toBe(true)
    f.pause()
    expect(f.isPaused.value).toBe(true)
    f.reset()
    expect(f.isRunning.value).toBe(false)

    f.saveMark()
    f.removeSavedMark(0)
    f.clearSavedMarks()

    await f.toggleProjection()
    await f.syncProjection()
    await f.clearProjection()
    wrapper.unmount()
  })

  it('until mode: setCountdownMode e setUntilTime', () => {
    const store = useCountdownStore()
    const wrapper = mountWith(() => useCountdownFeature())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed

    f.setCountdownMode('until')
    expect(store.runtime.mode).toBe('until')
    expect(f.isUntilMode.value).toBe(true)
    f.setUntilTime(23, 59)
    expect(store.runtime.untilHour).toBe(23)
    expect(store.runtime.untilMinute).toBe(59)
    wrapper.unmount()
  })
})
