// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'

import { useLiturgyClock, startLiturgyClockTick, stopLiturgyClockTick } from '../useLiturgyClock'

function mountWith(
  startTime: () => string | null,
  endTime: () => string | null,
  countdownRunning: () => boolean,
  countdownStartedAt: () => number | null,
) {
  return mount(
    defineComponent({
      setup() {
        return {
          exposed: useLiturgyClock(
            startTime,
            endTime,
            countdownRunning,
            countdownStartedAt,
          ),
        }
      },
      render() {
        return h('div')
      },
    }),
  )
}

type Exposed = Record<string, { value: unknown } & (() => unknown)>

describe('useLiturgyClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fora de componente: unmount hook não roda, sem erro', () => {
    // fora de setup, onMounted/onUnmounted não registram — exercita o
    // caminho defensivo sem interval ativo
    expect(() => useLiturgyClock(() => null, () => null, () => false, () => null)).not.toThrow()
  })

  it('tick helpers: start agenda interval, stop null-safe', () => {
    const now = ref(new Date(2026, 8, 15, 19, 0, 0))
    vi.setSystemTime(new Date(2026, 8, 15, 19, 0, 5))
    const id = startLiturgyClockTick(now)
    vi.advanceTimersByTime(1000)
    expect(now.value.getMinutes()).toBe(0)
    expect(now.value.getSeconds()).toBe(6)
    expect(() => stopLiturgyClockTick(id)).not.toThrow()
    // null-safe
    expect(() => stopLiturgyClockTick(null)).not.toThrow()
    vi.clearAllTimers()
  })

  it('headerDateTime formata data • hora e atualiza a cada 1s; unmount limpa interval', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 19, 45, 30))
    const wrapper = mountWith(() => null, () => null, () => false, () => null)
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed

    const header = (e.headerDateTime as unknown as () => string)()
    expect(header).toBe('15/09/2026 • 19:45:30')

    // avança o clock e dispara o interval (fake timers avançam Date junto)
    vi.setSystemTime(new Date(2026, 8, 15, 19, 46, 35))
    vi.advanceTimersByTime(1000)
    const header2 = (e.headerDateTime as unknown as () => string)()
    expect(header2).toBe('15/09/2026 • 19:46:36')

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('inputs de hora refletem startTime/endTime (ou vazio)', () => {
    const wrapper = mountWith(
      () => '19:30',
      () => null,
      () => false,
      () => null,
    )
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    expect(e.startTimeInput.value).toBe('19:30')
    expect(e.endTimeInput.value).toBe('')
    wrapper.unmount()
  })

  it('countdown parado ou sem startedAt → “—” e not expired', () => {
    const wrapper = mountWith(
      () => '19:30',
      () => '20:30',
      () => false,
      () => null,
    )
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    expect(e.remainingCountdownLabel.value).toBe('—')
    expect(e.countdownExpired.value).toBe(false)
    wrapper.unmount()
  })

  it('countdown rodando com endTime inválida → “—”; válida conta regressivo', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 19, 45, 0))
    const startedAt = new Date(2026, 8, 15, 19, 45, 0).getTime()

    // endTime inválida (25:99)
    const w1 = mountWith(
      () => '19:30',
      () => '25:99',
      () => true,
      () => startedAt,
    )
    const e1 = (w1.vm as unknown as { exposed: Exposed }).exposed
    expect(e1.remainingCountdownLabel.value).toBe('—')
    expect(e1.countdownExpired.value).toBe(false)
    w1.unmount()

    // startedAt null com running=true → “—” e not expired (branches 62/74)
    const w1b = mountWith(
      () => '19:30',
      () => '20:30',
      () => true,
      () => null,
    )
    const e1b = (w1b.vm as unknown as { exposed: Exposed }).exposed
    expect(e1b.remainingCountdownLabel.value).toBe('—')
    expect(e1b.countdownExpired.value).toBe(false)
    w1b.unmount()

    // endTime null com running=true → “—” / not expired
    const w1c = mountWith(
      () => '19:30',
      () => null,
      () => true,
      () => startedAt,
    )
    const e1c = (w1c.vm as unknown as { exposed: Exposed }).exposed
    expect(e1c.remainingCountdownLabel.value).toBe('—')
    expect(e1c.countdownExpired.value).toBe(false)
    w1c.unmount()

    // inputs: null → '' (68) e regex-fail → timestampFromHHmm null (15)
    const w1d = mountWith(
      () => null,
      () => 'abc',
      () => true,
      () => startedAt,
    )
    const e1d = (w1d.vm as unknown as { exposed: Exposed }).exposed
    expect(e1d.startTimeInput.value).toBe('')
    expect(e1d.endTimeInput.value).toBe('abc')
    expect(e1d.remainingCountdownLabel.value).toBe('—')
    expect(e1d.countdownExpired.value).toBe(false)
    w1d.unmount()

    // válida: 20:30 - 19:45 = 45min → 45:00 (formato mm:ss ou hh:mm:ss conforme service)
    const w2 = mountWith(
      () => '19:30',
      () => '20:30',
      () => true,
      () => startedAt,
    )
    const e2 = (w2.vm as unknown as { exposed: Exposed }).exposed
    const label = e2.remainingCountdownLabel.value as string
    expect(label).not.toBe('—')
    expect(label).toContain('45')
    // não expirou ainda
    expect(e2.countdownExpired.value).toBe(false)
    w2.unmount()
  })

  it('countdown expira quando now >= endsAt', () => {
    const startedAt = new Date(2026, 8, 15, 19, 45, 0).getTime()
    vi.setSystemTime(new Date(2026, 8, 15, 20, 30, 5))
    const wrapper = mountWith(
      () => '19:30',
      () => '20:30',
      () => true,
      () => startedAt,
    )
    const e = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    expect(e.countdownExpired.value).toBe(true)
    wrapper.unmount()
  })
})
