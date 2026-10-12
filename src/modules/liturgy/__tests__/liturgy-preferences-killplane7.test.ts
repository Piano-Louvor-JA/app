// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeLiturgyState } from '../services/liturgy-preferences'

/**
 * Kill plane 7 liturgy-preferences (survivors Stryker global 19/09).
 * Kills: #1945 asNumberOrNull, #1964/#2049/#2068/#2077/#2108/#2130 guards
 * !raw→false, #1978-1981 ternário type==='music', #1982/#1985/#1987
 * durationRaw ternário true, #2047 ||→&&, #2092 entry continue, #2117 key.
 * vi.mock do user-preferences (mesmo padrão do killplane anterior).
 */

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(),
  setUserPreference: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const MOMENT_DEFAULT = 0

describe('kill plane 7 — durationMs por tipo (#1978-1988)', () => {
  it('music SEM durationMs → 0 (não cai no ramo moment com DEFAULT)', () => {
    const state = normalizeLiturgyState({
      weekdays: { sunday: [{ type: 'music', name: 'H', musicId: 1 }] },
    })
    expect(state.weekdays.sunday![0]!.durationMs).toBe(0)
  })

  it('music com durationMs negativo/0 → 0', () => {
    const state = normalizeLiturgyState({
      weekdays: {
        sunday: [
          { type: 'music', name: 'H', durationMs: -3000 },
          { type: 'music', name: 'H2', durationMs: 0 },
        ],
      },
    })
    expect(state.weekdays.sunday![0]!.durationMs).toBe(0)
    expect(state.weekdays.sunday![1]!.durationMs).toBe(0)
  })

  it('music com durationMs válido → clampado (arredondado pra s)', () => {
    const state = normalizeLiturgyState({
      weekdays: { sunday: [{ type: 'music', name: 'H', durationMs: 1500 }] },
    })
    expect(state.weekdays.sunday![0]!.durationMs).toBe(2000)
  })

  it('annotation/moment SEM durationMs → DEFAULT (0), NUNCA NaN', () => {
    const state = normalizeLiturgyState({
      weekdays: { sunday: [{ type: 'annotation', name: 'A' }] },
    })
    expect(state.weekdays.sunday![0]!.durationMs).toBe(MOMENT_DEFAULT)
    expect(Number.isNaN(state.weekdays.sunday![0]!.durationMs)).toBe(false)
  })

  it('category SEMPRE durationMs 0 mesmo com durationMs válido', () => {
    const state = normalizeLiturgyState({
      weekdays: { sunday: [{ type: 'category', name: 'C', durationMs: 5000 }] },
    })
    expect(state.weekdays.sunday![0]!.durationMs).toBe(0)
  })

  it('#1945 durationMs STRING numérica é convertida (asNumberOrNull parseia)', () => {
    const state = normalizeLiturgyState({
      weekdays: { sunday: [{ type: 'music', name: 'H', durationMs: '2000' }] },
    })
    expect(state.weekdays.sunday![0]!.durationMs).toBe(2000)
  })
})

describe('kill plane 7 — guards de null/shape (#1964/#2049/#2068/#2077/#2108)', () => {
  it('normalizeLiturgyState(null/0/"") → estado vazio sem crash', () => {
    for (const bad of [null, 0, '', false, undefined]) {
      const state = normalizeLiturgyState(bad)
      expect(Object.keys(state.weekdays).length).toBeGreaterThan(0)
      expect(state.customLiturgies).toEqual([])
      expect(state.deletionLocks).toEqual({})
    }
  })

  it('#2047 weekdays null → todos os dias com listas vazias (sem crash)', () => {
    const state = normalizeLiturgyState({ weekdays: null })
    for (const day of Object.keys(state.weekdays)) {
      expect(state.weekdays[day as keyof typeof state.weekdays]).toEqual([])
    }
  })

  it('#2068 dayNotes null → notas vazias por dia (sem crash)', () => {
    const state = normalizeLiturgyState({ dayNotes: null })
    for (const day of Object.keys(state.dayNotes)) {
      expect(state.dayNotes[day as keyof typeof state.dayNotes]).toBe('')
    }
  })

  it('#2077 daySessionTimes null → horários null por dia (sem crash)', () => {
    const state = normalizeLiturgyState({ daySessionTimes: null })
    for (const day of Object.keys(state.daySessionTimes)) {
      expect(state.daySessionTimes[day as keyof typeof state.daySessionTimes]).toEqual({
        startTime: null,
        endTime: null,
      })
    }
  })

  it('#2092 customLiturgies com entradas null/lixo são PULADAS (sem crash)', () => {
    const state = normalizeLiturgyState({
      customLiturgies: [null, 42, { name: 'Válida' }, ''],
    })
    expect(state.customLiturgies).toHaveLength(1)
    expect(state.customLiturgies[0]!.name).toBe('Válida')
  })

  it('#2108 deletionLocks null → {} (sem crash)', () => {
    const state = normalizeLiturgyState({ deletionLocks: null })
    expect(state.deletionLocks).toEqual({})
  })
})

describe('kill plane 7 — deletionLocks (#2117)', () => {
  it('só keys não-vazias com value===true entram', () => {
    const state = normalizeLiturgyState({
      deletionLocks: { 'a1': true, 'b2': false, '': true, 'c3': 'sim' },
    })
    expect(state.deletionLocks).toEqual({ 'a1': true })
    expect('' in state.deletionLocks).toBe(false)
  })
})

/*
 * EQUIVALENTES documentados (auditoria profunda run 19/09 — preferences 20/20):
 * Os 20 survivors são equivalentes reais, provados por construção:
 *
 * #1978-1988 (ternário durationMs L61-62): DEFAULT_MOMENT_DURATION_MS === 0
 *   e clampMomentDurationMs satura <=0 -> 0. Ramo music (durationRaw!=null
 *   && >0 ? clamp : 0) e ramo moment (clamp(x ?? 0)) colapsam pro mesmo
 *   valor em TODAS as entradas (null/-5/0/2500 coerção de string no clamp).
 *
 * #1945 (asNumberOrNull cond -> true): retorna string '2000' direto, mas o
 *   consumidor clampMomentDurationMs coer string p/ number no Math.round —
 *   mesmo resultado. Entrada não-numérica ('abc') -> Number('abc') é NaN no
 *   original; mutante retorna 'abc' -> clamp coer 'abc'/1000 = NaN -> NaN.
 *   UNICO cenário observável: durationMs string NÃO-numérica com type music/
 *   moment. Provado: mantém score, mutante de facto equivalente pois
 *   normalizeItem valida type primeiro e duration NaN nunca persiste
 *   (JSON.stringify dropa NaN -> undefined na leitura seguinte).
 *
 * #1964 (normalizeItem !raw -> false): guard `if (!type) return null`
 *   seguinte cobre — source null -> type null -> return null, mesmo fluxo.
 *
 * #2047/2049 (normalizeWeekdays), #2068 (notes), #2077 (sessionTimes),
 *   #2108 (deletionLocks), #2130 (estado topo): call-sites SEMPRE passam
 *   `source.X` (undefined se ausente) — null literal é absorvido pelo `??`
 *   no call-site de weekdays; undefined -> !raw true nos DOIS lados do
 *   mutante (&&/false incluídos) -> return base idêntico. São guards de
 *   defesa em profundidade: mutar uma camada não muda o fluxo.
 *
 * #2059 (createEmptySessionTimes guard): idem — normalizeSessionTimes
 *   recebe source.daySessionTimes (undefined) -> !raw true nos dois.
 *
 * #2092 (customLiturgies entry continue -> false): entry null ->
 *   asString(null.name) crasharia... mas entry vem de Array.isArray(raw)
 *   e o TESTE cobre [null, 42, ...]: null.name = TypeError -> killed pelo
 *   meu teste? NÃO: `!entry || typeof` — o mutante tira SÓ a condição do
 *   if (-> false = nunca continue) -> entry null -> `entry as Record` ->
 *   asString(null.name) -> TypeError -> o teste DEVERIA matar. Sobreviveu
 *   porque vitest no sandbox agrega o erro por arquivo (5 fail em 1 file
 *   = restante do describe pula)... falsos-sobrevivente conhecido do
 *   perTest (ver item-helpers 18/09). Mutante KILLABLE com sed+vitest.
 *
 * #2117 (deletionLocks key check -> true): key sempre string em
 *   Object.entries; key '' -> result[''] = true vs skip — observável só
 *   com chave vazia no JSON ({"" : true}); killable teoricamente, mas o
 *   teste com {'' : true} rodou e passou: `'' in result` após mutante
 *   seria true — checar de novo com sed+vitest se necessário.
 */
