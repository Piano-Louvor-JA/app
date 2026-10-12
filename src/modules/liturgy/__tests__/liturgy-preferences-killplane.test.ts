// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  loadLiturgyState,
  normalizeLiturgyState,
  saveLiturgyState,
} from '../services/liturgy-preferences'
import { LITURGY_WEEKDAYS } from '../types/liturgy'

/**
 * Kill plane SEM vi.mock — usa localStorage real (jsdom).
 * Motivo: com vi.mock no arquivo original, o runner do Stryker carrega o módulo
 * via mock hoisted e a injeção do mutante não chega no código executado
 * (mutantes manualmente matáveis aparecem como Survived no report).
 * Este arquivo exercita o MESMO código (asNumberOrNull, guards, ternários)
 * sem mock, para que os mutantes sejam executados de verdade.
 */
describe('liturgy-preferences kill plane sem mock (jsdom + localStorage real)', () => {
  it('L40: durationMs number finito preserva valor clampado; Infinity -> 0', () => {
    const ok = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: 1500 }] } })
    expect(ok.weekdays.sunday[0]!.durationMs).toBe(2000)
    const inf = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'B', durationMs: Infinity }] } })
    expect(inf.weekdays.sunday[0]!.durationMs).toBe(0)
  })

  it('L41: string numérica parseia; vazia/whitespace/lixo -> null -> 0', () => {
    const ok = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: '1500' }] } })
    expect(ok.weekdays.sunday[0]!.durationMs).toBe(2000)
    for (const bad of ['', '   ', 'Stryker was here!']) {
      const st = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'X', durationMs: bad }] } })
      expect(st.weekdays.sunday[0]!.durationMs).toBe(0)
    }
  })

  it('L40/L41 via musicId (number | null, SEM clamp): number finito preserva, Infinity/NaN/lixo -> null', () => {
    const ok = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', musicId: 42 }] } })
    expect(ok.weekdays.sunday[0]!.musicId).toBe(42)
    for (const bad of [Infinity, -Infinity, NaN, 'abc', '', {}, [], true]) {
      const st = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'X', musicId: bad }] } })
      expect(st.weekdays.sunday[0]!.musicId).toBeNull()
    }
    const strNum = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', musicId: '42' }] } })
    expect(strNum.weekdays.sunday[0]!.musicId).toBe(42)
  })

  it('L41 via musicId string: whitespace -> null, "42 " -> 42, "Stryker was here!" -> null', () => {
    const spaced = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', musicId: '  42  ' }] } })
    expect(spaced.weekdays.sunday[0]!.musicId).toBe(42)
    const junk = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', musicId: 'Stryker was here!' }] } })
    expect(junk.weekdays.sunday[0]!.musicId).toBeNull()
    // mata MethodExpression value.trim() -> value: '   ' trimado = '' -> null; sem trim = truthy -> Number('   ') = 0
    const ws = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', musicId: '   ' }] } })
    expect(ws.weekdays.sunday[0]!.musicId).toBeNull()
  })

  it('L40 via verseChapter/verseBookId: mesmos contratos de asNumberOrNull', () => {
    const ok = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', verseChapter: 3, verseBookId: 7 }] } })
    expect(ok.weekdays.sunday[0]!.verseChapter).toBe(3)
    expect(ok.weekdays.sunday[0]!.verseBookId).toBe(7)
    const bad = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', verseChapter: NaN, verseBookId: 'x' }] } })
    expect(bad.weekdays.sunday[0]!.verseChapter).toBeNull()
    expect(bad.weekdays.sunday[0]!.verseBookId).toBeNull()
  })

  it('L49: item não-objeto em weekdays é descartado', () => {
    const st = normalizeLiturgyState({ weekdays: { sunday: [null, 42, 'x', [], true, { type: 'music', name: 'Ok' }] } })
    expect(st.weekdays.sunday).toHaveLength(1)
    expect(st.weekdays.sunday[0]!.name).toBe('Ok')
  })

  it('L49 via customLiturgies items: entry não-objeto descartada', () => {
    const st = normalizeLiturgyState({ customLiturgies: [{ name: 'C', items: [null, 1, 'x', { type: 'music', name: 'M' }] }] })
    expect(st.customLiturgies[0]!.items).toHaveLength(1)
  })

  it('L115: weekdays não-objeto -> todas as listas vazias', () => {
    for (const bad of [null, 42, 'x', [], true]) {
      const st = normalizeLiturgyState({ weekdays: bad })
      for (const day of LITURGY_WEEKDAYS) expect(st.weekdays[day]).toEqual([])
    }
  })

  it('L129: daySessionTimes por dia não-objeto -> { null, null }', () => {
    const st = normalizeLiturgyState({ daySessionTimes: { sunday: null, monday: 42, tuesday: 'x', wednesday: [] } })
    expect(st.daySessionTimes.sunday).toEqual({ startTime: null, endTime: null })
    expect(st.daySessionTimes.monday).toEqual({ startTime: null, endTime: null })
    expect(st.daySessionTimes.tuesday).toEqual({ startTime: null, endTime: null })
    expect(st.daySessionTimes.wednesday).toEqual({ startTime: null, endTime: null })
  })

  it('L129 via normalizeLiturgyState(null): toda a estrutura vazia', () => {
    const st = normalizeLiturgyState(null)
    for (const day of LITURGY_WEEKDAYS) {
      expect(st.weekdays[day]).toEqual([])
      expect(st.dayNotes[day]).toBe('')
      expect(st.daySessionTimes[day]).toEqual({ startTime: null, endTime: null })
    }
    expect(st.customLiturgies).toEqual([])
    expect(st.deletionLocks).toEqual({})
  })

  it('L139: daySessionTimes não-objeto -> base vazia para todos os dias', () => {
    for (const bad of [null, 42, 'x', [], true]) {
      const st = normalizeLiturgyState({ daySessionTimes: bad })
      for (const day of LITURGY_WEEKDAYS) expect(st.daySessionTimes[day]).toEqual({ startTime: null, endTime: null })
    }
  })

  it('L149: dayNotes não-objeto -> "" para todos os dias; valores não-string -> ""', () => {
    for (const bad of [null, 42, [], true]) {
      const st = normalizeLiturgyState({ dayNotes: bad })
      for (const day of LITURGY_WEEKDAYS) expect(st.dayNotes[day]).toBe('')
    }
    const st = normalizeLiturgyState({ dayNotes: { sunday: 42, monday: null, tuesday: {} } })
    expect(st.dayNotes.sunday).toBe('')
    expect(st.dayNotes.monday).toBe('')
    expect(st.dayNotes.tuesday).toBe('')
  })

  it('L163: customLiturgies entries não-objeto ignoradas; sem nome ignoradas', () => {
    const st = normalizeLiturgyState({ customLiturgies: [null, 42, 'x', [], true, { name: '' }, { name: '  ' }, { name: 'Ok' }] })
    expect(st.customLiturgies).toHaveLength(1)
    expect(st.customLiturgies[0]!.name).toBe('Ok')
  })

  it('L180: deletionLocks não-objeto -> {}', () => {
    for (const bad of [null, 42, 'x', [], true]) {
      const st = normalizeLiturgyState({ deletionLocks: bad })
      expect(st.deletionLocks).toEqual({})
    }
  })

  it('L184: só chave não-vazia + value === true entra', () => {
    const st = normalizeLiturgyState({ deletionLocks: { '': true, '0': true, a: true, b: false, c: 'true', d: 1, e: null } })
    expect(st.deletionLocks).toEqual({ '0': true, a: true })
  })

  it('L192: raw não-objeto -> estado vazio completo (mesmo com liturgies alias)', () => {
    for (const bad of [null, undefined, 42, 'x', [], true]) {
      const st = normalizeLiturgyState(bad)
      for (const day of LITURGY_WEEKDAYS) expect(st.weekdays[day]).toEqual([])
      expect(st.customLiturgies).toEqual([])
    }
  })

  it('L61/L62: category nunca tem durationMs; music respeita guard > 0; prayer usa ?? DEFAULT', () => {
    const cat = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'category', name: 'C', durationMs: 1500 }] } })
    expect(cat.weekdays.sunday[0]!.durationMs).toBe(0)
    const musicZero = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'M', durationMs: 0 }] } })
    expect(musicZero.weekdays.sunday[0]!.durationMs).toBe(0)
    const musicNeg = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'M', durationMs: -5 }] } })
    expect(musicNeg.weekdays.sunday[0]!.durationMs).toBe(0)
    const prayer = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'prayer', name: 'P' }] } })
    expect(prayer.weekdays.sunday[0]!.durationMs).toBe(0) // clamp(0 ?? 0) = 0
  })

  it('L68/L168: id não-string gera id; id string preservado', () => {
    const st = normalizeLiturgyState({
      weekdays: { sunday: [{ type: 'music', name: 'M', id: 'meu-id' }] },
      customLiturgies: [{ name: 'C', id: 'c-1' }],
    })
    expect(st.weekdays.sunday[0]!.id).toBe('meu-id')
    expect(st.customLiturgies[0]!.id).toBe('c-1')
    const st2 = normalizeLiturgyState({
      weekdays: { sunday: [{ type: 'music', name: 'M', id: 42 }] },
      customLiturgies: [{ name: 'C', id: null }],
    })
    expect(st2.weekdays.sunday[0]!.id).toBeTruthy()
    expect(st2.weekdays.sunday[0]!.id).not.toBe('meu-id')
    expect(st2.customLiturgies[0]!.id).toBeTruthy()
  })

  it('loadLiturgyState + saveLiturgyState com localStorage real: round-trip preserva dados', () => {
    const state = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: 1500 }] } })
    saveLiturgyState(state)
    const loaded = loadLiturgyState()
    expect(loaded.weekdays.sunday).toHaveLength(1)
    expect(loaded.weekdays.sunday[0]!.durationMs).toBe(2000)
  })
})
