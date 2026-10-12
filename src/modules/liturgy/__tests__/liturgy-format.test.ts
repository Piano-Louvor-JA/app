import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  formatClock,
  formatCountdown,
  formatDateBr,
  formatDurationLabel,
  formatElapsed,
  normalizeLiturgyTimeHHmm,
  pad2,
} from '../services/liturgy-format'

describe('pad2', () => {
  it('preenche número de um dígito com zero', () => {
    expect(pad2(5)).toBe('05')
  })
  it('mantém número de dois dígitos', () => {
    expect(pad2(23)).toBe('23')
  })
})

describe('normalizeLiturgyTimeHHmm', () => {
  it('retorna null para valor não-string', () => {
    expect(normalizeLiturgyTimeHHmm(123)).toBeNull()
    expect(normalizeLiturgyTimeHHmm(null)).toBeNull()
  })
  it('retorna null para formato inválido', () => {
    expect(normalizeLiturgyTimeHHmm('abc')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('12')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('12:5')).toBeNull()
  })
  it('retorna null para horas/minutos fora da faixa', () => {
    expect(normalizeLiturgyTimeHHmm('24:00')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('12:60')).toBeNull()
  })
  it('normaliza HH:MM com padding', () => {
    expect(normalizeLiturgyTimeHHmm('9:05')).toBe('09:05')
    expect(normalizeLiturgyTimeHHmm('19:30')).toBe('19:30')
  })
  it('aceita HH:MM:SS do input type=time descartando segundos', () => {
    expect(normalizeLiturgyTimeHHmm('09:05:30')).toBe('09:05')
  })
  it('retorna null quando grupos capturados não são numéricos', () => {
    // regex não casa, grupos undefined → NaN não finito
    expect(normalizeLiturgyTimeHHmm('aa:bb')).toBeNull()
  })
})

describe('formatClock', () => {
  it('formata hora/min/seg com padding', () => {
    const d = new Date(2026, 8, 17, 7, 5, 3)
    expect(formatClock(d)).toBe('07:05:03')
  })
})

describe('formatDateBr', () => {
  it('formata data dd/mm/aaaa', () => {
    const d = new Date(2026, 8, 3, 10, 0, 0)
    expect(formatDateBr(d)).toBe('03/09/2026')
  })
})

describe('formatElapsed', () => {
  it('clamp para zero com ms negativo', () => {
    expect(formatElapsed(-5000)).toBe('00:00:00')
  })
  it('formata horas/min/seg', () => {
    expect(formatElapsed(((2 * 60 + 3) * 60 + 4) * 1000)).toBe('02:03:04')
  })
})

describe('formatCountdown', () => {
  it('delega para formatElapsed', () => {
    expect(formatCountdown(65_000)).toBe('00:01:05')
  })
})

describe('formatDurationLabel', () => {
  it('retorna travessão para null/undefined/<=0', () => {
    expect(formatDurationLabel(null)).toBe('—')
    expect(formatDurationLabel(undefined)).toBe('—')
    expect(formatDurationLabel(0)).toBe('—')
    expect(formatDurationLabel(-1)).toBe('—')
  })
  it('formata duração positiva', () => {
    expect(formatDurationLabel(90_000)).toBe('00:01:30')
  })
})
