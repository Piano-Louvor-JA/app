import { describe, expect, it } from 'vitest'

import {
  clampDurationPart,
  computeCountdownRemainingMs,
  computeElapsedMs,
  computeRemainingMs,
  durationMsFromParts,
  durationPartsFromMs,
  formatElapsedMs,
  wallClockUntilRemainingMs,
} from '../services/countdown-format'

describe('countdown-format — formatElapsedMs', () => {
  it('formata 0 como zeros no formato completo', () => {
    expect(formatElapsedMs(0, 'hh:mm:ss.ms')).toBe('00:00:00.00')
  })

  it('formata com horas', () => {
    expect(formatElapsedMs(3_723_456, 'hh:mm:ss.ms')).toBe('01:02:03.45')
  })

  it('horas restantes força inclusão de hh quando formato omitiu', () => {
    expect(formatElapsedMs(4_440_000, 'mm:ss')).toBe('01:14:00')
  })

  it('horas restantes + formato com ms força hh:mm:ss.ms', () => {
    expect(formatElapsedMs(4_440_500, 'mm:ss.ms')).toBe('01:14:00.50')
  })

  it('sem horas, formato sem hh é respeitado', () => {
    expect(formatElapsedMs(65_000, 'mm:ss')).toBe('01:05')
  })

  it('negativo (overtime) ganha prefixo -', () => {
    expect(formatElapsedMs(-5_000, 'mm:ss')).toBe('-00:05')
  })

  it('negativo grande mantém sinal e formato estendido', () => {
    expect(formatElapsedMs(-4_440_000, 'mm:ss')).toBe('-01:14:00')
  })
})

describe('countdown-format — computeElapsedMs', () => {
  it('não-running retorna acumulado clampado', () => {
    expect(computeElapsedMs(2_000, 100, 'paused', 9_000)).toBe(2_000)
    expect(computeElapsedMs(2_000, 100, 'idle', 9_000)).toBe(2_000)
    expect(computeElapsedMs(-1, null, 'idle', 0)).toBe(0)
  })

  it('running soma delta do segmento', () => {
    expect(computeElapsedMs(2_000, 1_000, 'running', 4_250)).toBe(5_250)
  })
})

describe('countdown-format — computeRemainingMs', () => {
  it('retorna duration - elapsed', () => {
    expect(computeRemainingMs(60_000, 10_000, null, 'paused', 0)).toBe(50_000)
  })

  it('pode ser negativo (overtime)', () => {
    expect(computeRemainingMs(60_000, 70_000, null, 'paused', 0)).toBe(-10_000)
  })

  it('running considera segmento em curso', () => {
    expect(computeRemainingMs(60_000, 10_000, 1_000, 'running', 3_000)).toBe(48_000)
  })
})

describe('countdown-format — durationPartsFromMs / durationMsFromParts', () => {
  it('decompõe ms em partes', () => {
    expect(durationPartsFromMs(3_723_000)).toEqual({ hours: 1, minutes: 2, seconds: 3 })
  })

  it('clamp negativo para 0', () => {
    expect(durationPartsFromMs(-1)).toEqual({ hours: 0, minutes: 0, seconds: 0 })
  })

  it('recompõe partes em ms', () => {
    expect(durationMsFromParts({ hours: 1, minutes: 2, seconds: 3 })).toBe(3_723_000)
  })

  it('coage NaN/negativos para 0 e clampa min/seg em 59', () => {
    expect(durationMsFromParts({ hours: NaN, minutes: -5, seconds: 120 })).toBe(59_000)
    expect(durationMsFromParts({ hours: 2.9, minutes: 5.9, seconds: 0.4 })).toBe(7_500_000)
  })

  it('minutos/segundos 0 caem no fallback || 0 sem alterar resultado', () => {
    expect(durationMsFromParts({ hours: 1, minutes: 0, seconds: 0 })).toBe(3_600_000)
  })

  it('roundtrip partes → ms → partes', () => {
    const parts = { hours: 2, minutes: 34, seconds: 56 }
    expect(durationPartsFromMs(durationMsFromParts(parts))).toEqual(parts)
  })
})

describe('countdown-format — clampDurationPart', () => {
  it('número válido é clampado ao máximo', () => {
    expect(clampDurationPart(45, 59)).toBe(45)
    expect(clampDurationPart(90, 59)).toBe(59)
  })

  it('sem máximo retorna inteiro floor', () => {
    expect(clampDurationPart(7.9)).toBe(7)
  })

  it('string numérica é convertida', () => {
    expect(clampDurationPart('12', 59)).toBe(12)
  })

  it('NaN, infinito e negativo → 0', () => {
    expect(clampDurationPart('abc')).toBe(0)
    expect(clampDurationPart(NaN)).toBe(0)
    expect(clampDurationPart(Infinity)).toBe(0)
    expect(clampDurationPart(-3)).toBe(0)
  })

  it('null/undefined → Number() → 0', () => {
    expect(clampDurationPart(null)).toBe(0)
    expect(clampDurationPart(undefined)).toBe(0)
  })

describe('countdown-format — computeCountdownRemainingMs (mode until)', () => {
  const base = {
    mode: 'until' as const,
    untilHour: 23,
    untilMinute: 30,
    pausedRemainingMs: null,
    durationMs: 65_000,
    accumulatedMs: 0,
    segmentStartedAt: null,
    status: 'idle' as const,
  }

  it('sem pausedRemainingMs: usa relógio de parede', () => {
    const now = new Date('2026-09-16T10:00:00')
    const remaining = computeCountdownRemainingMs(base, now.getTime())
    expect(remaining).toBe(new Date('2026-09-16T23:30:00').getTime() - now.getTime())
  })

  it('pausado com pausedRemainingMs: usa o valor salvo', () => {
    const remaining = computeCountdownRemainingMs(
      { ...base, status: 'paused', pausedRemainingMs: 42_000 },
      0,
    )
    expect(remaining).toBe(42_000)
  })

  it('wallClockUntilRemainingMs clampa hora/minuto e trata valores inválidos', () => {
    const now = new Date('2026-09-16T10:00:00').getTime()
    // NaN/undefined -> fallback 0 -> meia-noite do dia
    const r0 = wallClockUntilRemainingMs(NaN, undefined as unknown as number, now)
    expect(r0).toBe(new Date('2026-09-16T00:00:00').getTime() - now)
    // clamp de hora > 23 e minuto > 59
    const rC = wallClockUntilRemainingMs(30, 120, now)
    expect(rC).toBe(new Date('2026-09-16T23:59:00').getTime() - now)
  })

  it('mode duration: delega para computeRemainingMs', () => {
    const remaining = computeCountdownRemainingMs(
      { ...base, mode: 'duration', durationMs: 60_000, accumulatedMs: 10_000 },
      0,
    )
    expect(remaining).toBe(50_000)
  })
})
})
