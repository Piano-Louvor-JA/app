import { describe, it, expect } from 'vitest'
import {
  computeRemainingRawMs,
  formatCountdownWithSign,
} from '../services/countdown-format'

describe('tempo negativo (modo escola sabatina)', () => {
  it('computeRemainingRawMs retorna negativo quando elapsed ultrapassa duration', () => {
    // duration 60s, elapsed 90s => -30s
    expect(
      computeRemainingRawMs(60_000, 90_000, null, 'paused', 0),
    ).toBe(-30_000)
  })

  it('computeRemainingRawMs retorna positivo normal antes de zerar', () => {
    expect(
      computeRemainingRawMs(60_000, 10_000, null, 'paused', 0),
    ).toBe(50_000)
  })

  it('computeRemainingRawMs rodando usa nowMs', () => {
    // duration 60s, accumulated 0, iniciou há 90s => -30s
    expect(
      computeRemainingRawMs(60_000, 0, 1_000, 'running', 91_000),
    ).toBe(-30_000)
  })

  it('formatCountdownWithSign prefixa sinal negativo', () => {
    expect(formatCountdownWithSign(-30_000, 'mm:ss')).toBe('-00:30')
  })

  it('formatCountdownWithSign sem negativo mantém formato normal', () => {
    expect(formatCountdownWithSign(30_000, 'mm:ss')).toBe('00:30')
  })

  it('formatCountdownWithSign com horas', () => {
    expect(formatCountdownWithSign(-3_600_000, 'hh:mm:ss')).toBe('-01:00:00')
  })
})
