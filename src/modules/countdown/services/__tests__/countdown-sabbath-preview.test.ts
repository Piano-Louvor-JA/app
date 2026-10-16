import { describe, expect, it } from 'vitest'

import type { CountdownDisplayConfig, CountdownRuntimeState } from '../../types/countdown'
import { sabbathIdlePreviewRuntime, timeToMs } from '../countdown-sabbath-preview'

const base: CountdownDisplayConfig = { timeFormat: 'hh:mm:ss', bgColor: '#000', textColor: '#fff' }

function runtime(overrides: Partial<CountdownRuntimeState> = {}): CountdownRuntimeState {
  return {
    status: 'idle',
    segmentStartedAt: null,
    accumulatedMs: 0,
    durationMs: 300_000,
    savedTimesMs: [],
    finished: false,
    ...overrides,
  } as CountdownRuntimeState
}

function sabbath(sabbathConfig: CountdownDisplayConfig['sabbathConfig']): CountdownDisplayConfig {
  return { ...base, mode: 'sabbath', sabbathConfig }
}

const at = (h: number, m: number) => new Date(2026, 9, 17, h, m, 0)

describe('timeToMs', () => {
  it('HH:MM vira ms desde a meia-noite; formato inválido vira 0', () => {
    expect(timeToMs('10:15')).toBe((10 * 3600 + 15 * 60) * 1000)
    expect(timeToMs('10h15')).toBe(0)
  })
})

describe('sabbathIdlePreviewRuntime', () => {
  it('fora do modo ES, rodando ou sem término válido: null (usa o runtime real)', () => {
    expect(sabbathIdlePreviewRuntime(base, runtime())).toBeNull()
    const sc = { scheduleMode: 'endOnly' as const, endTime: '10:15' }
    expect(sabbathIdlePreviewRuntime(sabbath(sc), runtime({ status: 'running' }))).toBeNull()
    expect(sabbathIdlePreviewRuntime(sabbath(undefined), runtime())).toBeNull()
    expect(sabbathIdlePreviewRuntime(sabbath({ ...sc, endTime: '' }), runtime())).toBeNull()
  })

  it("'start': duração = Término − Início, zerada e parada", () => {
    const result = sabbathIdlePreviewRuntime(
      sabbath({ scheduleMode: 'start', startTime: '09:00', endTime: '10:15' }),
      runtime({ accumulatedMs: 5_000, finished: true }),
      at(8, 0),
    )
    expect(result).toMatchObject({ durationMs: 75 * 60_000, accumulatedMs: 0, status: 'idle', finished: false })
  })

  it("'start' com término antes do início não fica negativo", () => {
    const result = sabbathIdlePreviewRuntime(
      sabbath({ scheduleMode: 'start', startTime: '11:00', endTime: '10:15' }),
      runtime(),
    )
    expect(result?.durationMs).toBe(0)
  })

  it("'endOnly' (ou 'start' sem início válido): Término − agora, virando o dia se já passou", () => {
    const sc = { scheduleMode: 'endOnly' as const, endTime: '10:15' }
    expect(sabbathIdlePreviewRuntime(sabbath(sc), runtime(), at(10, 0))?.durationMs).toBe(15 * 60_000)
    expect(sabbathIdlePreviewRuntime(sabbath(sc), runtime(), at(10, 30))?.durationMs).toBe(
      (24 * 60 - 15) * 60_000,
    )
    const blankStart = { scheduleMode: 'start' as const, startTime: '', endTime: '10:15' }
    expect(sabbathIdlePreviewRuntime(sabbath(blankStart), runtime(), at(10, 0))?.durationMs).toBe(15 * 60_000)
    const noStart = { scheduleMode: 'start' as const, endTime: '10:15' }
    expect(sabbathIdlePreviewRuntime(sabbath(noStart), runtime(), at(10, 0))?.durationMs).toBe(15 * 60_000)
  })
})
