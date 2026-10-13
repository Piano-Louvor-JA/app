import { describe, expect, it } from 'vitest'

import { computeElapsedMs, formatElapsedMs } from '../services/timer-format'

describe('timer-format — formatElapsedMs', () => {
  it('formata 0ms como zeros', () => {
    expect(formatElapsedMs(0, 'hh:mm:ss.ms')).toBe('00:00:00.00')
  })

  it('formata horas, minutos, segundos e centésimos', () => {
    // 1h 2min 3s 456ms → centésimos = 45
    expect(formatElapsedMs(3_723_456, 'hh:mm:ss.ms')).toBe('01:02:03.45')
  })

  it('formato sem ms omite centésimos', () => {
    expect(formatElapsedMs(65_000, 'hh:mm:ss')).toBe('00:01:05')
  })

  it('formato customizado (só mm:ss)', () => {
    expect(formatElapsedMs(125_000, 'mm:ss')).toBe('02:05')
  })

  it('negativos e não-inteiros são clampados para 0', () => {
    expect(formatElapsedMs(-1000, 'mm:ss')).toBe('00:00')
    expect(formatElapsedMs(999.9, 'ss')).toBe('00')
  })

  it('token desconhecido no formato passa intacto', () => {
    expect(formatElapsedMs(61_000, 'min ss')).toBe('min 01')
  })
})

describe('timer-format — computeElapsedMs', () => {
  it('status não-running retorna acumulado (mesmo com segmentStartedAt)', () => {
    expect(computeElapsedMs(5_000, 100, 'paused', 3_000)).toBe(5_000)
    expect(computeElapsedMs(5_000, 100, 'idle', 3_000)).toBe(5_000)
  })

  it('running sem segmentStartedAt retorna acumulado', () => {
    expect(computeElapsedMs(5_000, null, 'running', 3_000)).toBe(5_000)
  })

  it('running soma nowMs - segmentStartedAt ao acumulado', () => {
    expect(computeElapsedMs(5_000, 1_000, 'running', 3_500)).toBe(7_500)
  })

  it('clamp para 0 quando acumulado negativo', () => {
    expect(computeElapsedMs(-50, null, 'paused', 0)).toBe(0)
  })
})
