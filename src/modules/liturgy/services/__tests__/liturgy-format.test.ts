// @vitest-environment jsdom
// liturgy-format — pad2, horários HH:MM, clocks, elapsed, duration label
import { describe, it, expect } from 'vitest'
import {
  pad2,
  normalizeLiturgyTimeHHmm,
  formatClock,
  formatDateBr,
  formatElapsed,
  formatCountdown,
  formatDurationLabel,
} from '../liturgy-format'

describe('pad2', () => {
  it('preenche 2 dígitos', () => {
    expect(pad2(5)).toBe('05')
    expect(pad2(23)).toBe('23')
    expect(pad2(0)).toBe('00')
  })
})

describe('normalizeLiturgyTimeHHmm', () => {
  it('HH:MM válido normaliza', () => {
    expect(normalizeLiturgyTimeHHmm('9:05')).toBe('09:05')
    expect(normalizeLiturgyTimeHHmm('23:59')).toBe('23:59')
    expect(normalizeLiturgyTimeHHmm(' 10:00 ')).toBe('10:00')
  })

  it('HH:MM:SS aceita e trunca segundos', () => {
    expect(normalizeLiturgyTimeHHmm('08:30:15')).toBe('08:30')
  })

  it('inválidos → null', () => {
    expect(normalizeLiturgyTimeHHmm('24:00')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('10:60')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('10')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('abc')).toBeNull()
    expect(normalizeLiturgyTimeHHmm(830)).toBeNull()
    expect(normalizeLiturgyTimeHHmm(null)).toBeNull()
  })
})

describe('formatadores de data/hora', () => {
  it('formatClock HH:MM:SS', () => {
    expect(formatClock(new Date(2026, 8, 30, 7, 5, 3))).toBe('07:05:03')
  })

  it('formatDateBr dd/mm/yyyy', () => {
    expect(formatDateBr(new Date(2026, 8, 30))).toBe('30/09/2026')
    expect(formatDateBr(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  it('formatElapsed HH:MM:SS com horas', () => {
    expect(formatElapsed(3661000)).toBe('01:01:01')
    expect(formatElapsed(59000)).toBe('00:00:59')
  })

  it('formatElapsed negativo: 00:00:00', () => {
    expect(formatElapsed(-5)).toBe('00:00:00')
  })

  it('formatCountdown = formatElapsed', () => {
    expect(formatCountdown(65000)).toBe('00:01:05')
  })

  it('formatDurationLabel: null/negativo → traço', () => {
    expect(formatDurationLabel(null)).toBe('—')
    expect(formatDurationLabel(undefined)).toBe('—')
    expect(formatDurationLabel(0)).toBe('—')
    expect(formatDurationLabel(-100)).toBe('—')
  })

  it('formatDurationLabel: positivo formatado', () => {
    expect(formatDurationLabel(125000)).toBe('00:02:05')
  })
})
