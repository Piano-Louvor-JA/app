import { describe, expect, it } from 'vitest'

import { pad2, normalizeLiturgyTimeHHmm } from '../services/liturgy-format'

describe('liturgy-format - mutation kill boundaries', () => {
  describe('pad2', () => {
    it('handles negative values (edge case)', () => {
      expect(pad2(-5)).toBe('-5')
      expect(pad2(-1)).toBe('-1')
    })

    it('handles large values', () => {
      expect(pad2(100)).toBe('100')
      expect(pad2(999)).toBe('999')
    })

    it('handles zero', () => {
      expect(pad2(0)).toBe('00')
    })
  })

  describe('normalizeLiturgyTimeHHmm - boundary values', () => {
    it('accepts 23:59 (max valid)', () => {
      expect(normalizeLiturgyTimeHHmm('23:59')).toBe('23:59')
    })

    it('rejects 23:60 (minutes = 60)', () => {
      expect(normalizeLiturgyTimeHHmm('23:60')).toBeNull()
    })

    it('rejects 24:00 (hours = 24)', () => {
      expect(normalizeLiturgyTimeHHmm('24:00')).toBeNull()
    })

    it('accepts 00:00 (min valid)', () => {
      expect(normalizeLiturgyTimeHHmm('0:00')).toBe('00:00')
      expect(normalizeLiturgyTimeHHmm('00:00')).toBe('00:00')
    })

    it('accepts 23:59 with seconds', () => {
      expect(normalizeLiturgyTimeHHmm('23:59:59')).toBe('23:59')
    })

    it('handles single digit hours/minutes', () => {
      // regex requires 2-digit minutes
      expect(normalizeLiturgyTimeHHmm('5:05')).toBe('05:05')
      expect(normalizeLiturgyTimeHHmm('9:09')).toBe('09:09')
    })

    it('handles whitespace around', () => {
      expect(normalizeLiturgyTimeHHmm(' 09:05 ')).toBe('09:05')
      expect(normalizeLiturgyTimeHHmm('\t19:30\n')).toBe('19:30')
    })
  })
})