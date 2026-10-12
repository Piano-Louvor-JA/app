// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadLiturgyState,
  normalizeLiturgyState,
  saveLiturgyState,
  todayWeekday,
} from '../services/liturgy-preferences'
import { LITURGY_WEEKDAYS } from '../types/liturgy'

// browser-storage mockado (ambiente node, sem localStorage) — mesmo padrão do scheduled-store.test
const localStore: Record<string, unknown> = {}
const sessionStore: Record<string, unknown> = {}

vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: <T,>(key: string, fallback: T | null, kind: 'local' | 'session' = 'local') => {
    const store = kind === 'session' ? sessionStore : localStore
    return (key in store ? store[key] : fallback) as T | null
  },
  setBrowserItem: (key: string, value: unknown, kind: 'local' | 'session' = 'local') => {
    ;(kind === 'session' ? sessionStore : localStore)[key] = value
  },
}))

const prefs: Record<string, unknown> = {}
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: (key: string, fallback: unknown = null) => (key in prefs ? prefs[key] : fallback),
  setUserPreference: (key: string, value: unknown) => {
    prefs[key] = value
  },
}))

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

const KEY = USER_PREFERENCE_KEYS.liturgyState
const CHECKS_KEY = 'liturgy_checks_cleared'

function seedState(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    weekdays: {
      sunday: [
        {
          id: 'i1',
          type: 'music',
          name: 'Hino 1',
          done: true,
          durationMs: 90_000,
          musicId: '42',
          musicMode: 'instrumental',
        },
        { type: 'category', name: 'Abertura', startTime: '9:05', endTime: '10:00:00' },
        { type: 'annotation', name: 'Nota', filePaths: [' /a.mp3 ', '', 7] },
        { type: 'prayer', name: 'Oração', filePath: '/v.mp4', verseBookId: '2', verseChapter: 3, verseNumbers: '1,2' },
        { type: 'weird-type', name: 'inválido' },
        { type: 'music', name: '   ' },
        null,
        42,
      ],
    },
    dayNotes: { monday: 42, tuesday: 'nota terça' },
    daySessionTimes: { sunday: { startTime: '07:00', endTime: null } },
    customLiturgies: [
      { name: 'Casamento', items: [{ type: 'prayer', name: 'Oração', done: true }], startTime: '18:00', endTime: '20:00' },
      { name: '  ' },
      'nope',
      null,
    ],
    deletionLocks: { a: true, b: false, '': true, c: 'true' },
    ...extra,
  }
}

describe('liturgy-preferences', () => {
  beforeEach(() => {
    for (const k of Object.keys(localStore)) delete localStore[k]
    for (const k of Object.keys(sessionStore)) delete sessionStore[k]
    for (const k of Object.keys(prefs)) delete prefs[k]
  })

  describe('normalizeLiturgyState', () => {
    it('retorna estado vazio para null/nao-objeto', () => {
      for (const raw of [null, undefined, 42, 'x', []]) {
        const state = normalizeLiturgyState(raw)
        for (const day of LITURGY_WEEKDAYS) expect(state.weekdays[day]).toEqual([])
        expect(Object.values(state.dayNotes)).toHaveLength(LITURGY_WEEKDAYS.length)
        expect(Object.keys(state.daySessionTimes)).toHaveLength(LITURGY_WEEKDAYS.length)
        expect(state.customLiturgies).toEqual([])
        expect(state.deletionLocks).toEqual({})
      }
    })

    it('normaliza item completo: music com durationMs stringificada', () => {
      const state = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'X', durationMs: '120500' }] } })
      const item = state.weekdays.sunday[0]!
      expect(item.durationMs).toBe(121_000)
      expect(item.musicId).toBeNull()
      expect(item.musicMode).toBe('audio')
    })

    it('music: durationMs invalida/negativa cai em 0; id gerado quando ausente', () => {
      const [a, b] = normalizeLiturgyState({
        weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: -5 }, { type: 'music', name: 'B', durationMs: 'abc' }] },
      }).weekdays.sunday
      expect(a!.durationMs).toBe(0)
      expect(b!.durationMs).toBe(0)
      expect(b!.id).toBeTruthy()
    })

    it('category: durationMs sempre 0, startTime/endTime normalizados (com segundos), demais campos', () => {
      const state = normalizeLiturgyState(seedState())
      const [music, category, annotation, prayer, ...rest] = state.weekdays.sunday!
      expect(music!.durationMs).toBe(90_000)
      expect(music!.musicId).toBe(42)
      expect(music!.musicMode).toBe('instrumental')
      expect(music!.done).toBe(true)
      expect(music!.accentColor).toBeTruthy()
      expect(category!.durationMs).toBe(0)
      expect(category!.categoryId).toBeNull()
      expect(category!.startTime).toBe('09:05')
      expect(category!.endTime).toBe('10:00')
      // filePaths: filtra vazios e não-string; fallback de filePath único
      expect(annotation!.filePaths).toEqual(['/a.mp3'])
      expect(prayer!.filePaths).toEqual(['/v.mp4'])
      expect(prayer!.verseBookId).toBe(2)
      expect(prayer!.verseChapter).toBe(3)
      expect(rest.filter((i) => i != null)).toHaveLength(0)
    })

    it('complementaryTitle e notes com trim viram undefined quando vazios', () => {
      const item = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'prayer', name: 'P', complementaryTitle: '  ', notes: '  ' }] } }).weekdays.sunday[0]!
      expect(item.complementaryTitle).toBeUndefined()
      expect(item.notes).toBeUndefined()
    })

    it('weekdays aceita alias liturgies e ignora não-objeto', () => {
      const state = normalizeLiturgyState({ liturgies: { sunday: [{ type: 'prayer', name: 'P' }] } })
      expect(state.weekdays.sunday).toHaveLength(1)
      expect(normalizeLiturgyState({ weekdays: 'nope' }).weekdays.sunday).toEqual([])
    })

    it('dayNotes coage não-string para ""', () => {
      const state = normalizeLiturgyState(seedState())
      expect(state.dayNotes.monday).toBe('')
      expect(state.dayNotes.tuesday).toBe('nota terça')
    })

    it('daySessionTimes ignora não-objeto e normaliza horários', () => {
      expect(normalizeLiturgyState({ daySessionTimes: 'x' }).daySessionTimes.sunday).toEqual({ startTime: null, endTime: null })
      const st = normalizeLiturgyState(seedState()).daySessionTimes.sunday
      expect(st).toEqual({ startTime: '07:00', endTime: null })
    })

    it('customLiturgies: descarta sem nome/não-objeto, id gerado, items normalizados', () => {
      const state = normalizeLiturgyState(seedState())
      expect(state.customLiturgies).toHaveLength(1)
      const custom = state.customLiturgies[0]!
      expect(custom.name).toBe('Casamento')
      expect(custom.id).toBeTruthy()
      expect(custom.items).toHaveLength(1)
      expect(custom.startTime).toBe('18:00')
      expect(custom.endTime).toBe('20:00')
      expect(normalizeLiturgyState({ customLiturgies: 'x' }).customLiturgies).toEqual([])
    })

    it('deletionLocks: só chave truthy com valor === true', () => {
          const locks = normalizeLiturgyState(seedState()).deletionLocks
          expect(locks).toEqual({ a: true })
        })
      })

        // --- mata-mutantes guards !raw || typeof raw !== 'object' (8 funções via API pública) ---
        describe('guards de normalização via normalizeLiturgyState (mata mutantes ||→&& e if→false)', () => {
          // L49 normalizeItem: raw não-objeto no item -> null (item ignorado)
          it('normalizeItem (L49): item não-objeto em weekdays é ignorado', () => {
            const state = normalizeLiturgyState({ weekdays: { sunday: [null, 42, 'x', [], { type: 'music', name: 'Ok' }] } })
            expect(state.weekdays.sunday).toHaveLength(1)
            expect(state.weekdays.sunday[0]!.name).toBe('Ok')
          })
          // L115 normalizeWeekdays: raw não-objeto -> base
          it('normalizeWeekdays (L115): raw não-objeto retorna base vazia', () => {
            const state = normalizeLiturgyState('x')
            for (const day of LITURGY_WEEKDAYS) expect(state.weekdays[day]).toEqual([])
          })
          // L129 normalizeSessionTimes: raw não-objeto -> createEmptySessionTimes
              it('normalizeSessionTimes (L129): raw não-objeto retorna createEmptySessionTimes()', () => {
                const state = normalizeLiturgyState(null)
                for (const day of LITURGY_WEEKDAYS) expect(state.daySessionTimes[day]).toEqual({ startTime: null, endTime: null })
              })
              // L139 normalizeWeekdaySessionTimes: raw não-objeto -> base
              it('normalizeWeekdaySessionTimes (L139): raw não-objeto retorna base vazia', () => {
                const state = normalizeLiturgyState({ daySessionTimes: 'x' })
                for (const day of LITURGY_WEEKDAYS) expect(state.daySessionTimes[day]).toEqual({ startTime: null, endTime: null })
              })
          // L149 normalizeNotes: raw não-objeto -> base
          it('normalizeNotes (L149): raw não-objeto retorna base vazia', () => {
            const state = normalizeLiturgyState({ dayNotes: 'x' })
            for (const day of LITURGY_WEEKDAYS) expect(state.dayNotes[day]).toBe('')
          })
          // L163 normalizeCustomLiturgies: entry não-objeto -> continue (ignora)
          it('normalizeCustomLiturgies (L163): entry não-objeto é ignorada', () => {
            const state = normalizeLiturgyState({ customLiturgies: [null, 42, 'x', { name: 'Ok' }] })
            expect(state.customLiturgies).toHaveLength(1)
            expect(state.customLiturgies[0]!.name).toBe('Ok')
          })
          // L180 normalizeDeletionLocks: raw não-objeto -> {}
          it('normalizeDeletionLocks (L180): raw não-objeto retorna {}', () => {
            const state = normalizeLiturgyState({ deletionLocks: null })
            expect(state.deletionLocks).toEqual({})
            const state2 = normalizeLiturgyState({ deletionLocks: 42 })
            expect(state2.deletionLocks).toEqual({})
          })
          // L192 normalizeLiturgyState: raw não-objeto -> estado vazio completo
          it('normalizeLiturgyState (L192): raw não-objeto retorna estado vazio completo', () => {
            const empty = normalizeLiturgyState(null)
            for (const day of LITURGY_WEEKDAYS) expect(empty.weekdays[day]).toEqual([])
            expect(Object.values(empty.dayNotes)).toHaveLength(LITURGY_WEEKDAYS.length)
            expect(Object.keys(empty.daySessionTimes)).toHaveLength(LITURGY_WEEKDAYS.length)
            expect(empty.customLiturgies).toEqual([])
            expect(empty.deletionLocks).toEqual({})
          })
        })

        // --- asNumberOrNull L40/L41 ---
          describe('asNumberOrNull mata-mutantes', () => {
            it('L40: number finito retorna value; number não-finito retorna null', () => {
              // testar internamente via item com durationMs
              const state = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: 1500 }] } }) // 1500 -> clamp 2000
              expect(state.weekdays.sunday[0]!.durationMs).toBe(2000)
              const state2 = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'B', durationMs: Infinity }] } })
              expect(state2.weekdays.sunday[0]!.durationMs).toBe(0)
            })
            it('L41: string numérica válida parseia; string vazia/whitespace retorna null', () => {
              const state = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: '1500' }] } })
              expect(state.weekdays.sunday[0]!.durationMs).toBe(2000)
              const state2 = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'B', durationMs: '' }] } })
              expect(state2.weekdays.sunday[0]!.durationMs).toBe(0)
              const state3 = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'C', durationMs: '   ' }] } })
              expect(state3.weekdays.sunday[0]!.durationMs).toBe(0)
              // mutante StringLiteral: value.trim() !== '' -> 'Stryker was here!'
              const state4 = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'D', durationMs: 'Stryker was here!' }] } })
              expect(state4.weekdays.sunday[0]!.durationMs).toBe(0)
            })
            it('L40/L41: number não-finito E string não-numérica ambos -> null', () => {
              const state = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: NaN }] } })
              expect(state.weekdays.sunday[0]!.durationMs).toBe(0)
            })
          })

        // --- ternário type === 'music' L61 ---
          describe('ternário type===music (L61) mata-mutantes', () => {
            it('category NUNCA recebe durationMs (mesmo com durationRaw); music/prayer com duration -> clamp', () => {
              const music = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'M', durationMs: 1500 }] } }).weekdays.sunday[0]!
              expect(music.durationMs).toBe(2000)
              // mata o swap do ternário: category com durationRaw tem que ser 0, não clamp
              const cat = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'category', name: 'C', durationMs: 1500 }] } }).weekdays.sunday[0]!
              expect(cat.durationMs).toBe(0)
              const prayer = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'prayer', name: 'P', durationMs: 1500 }] } }).weekdays.sunday[0]!
              expect(prayer.durationMs).toBe(2000)
            })
          })

        // --- durationRaw != null && durationRaw > 0 L62 ---
        describe('durationRaw guarda (L62) mata-mutantes', () => {
          it('durationRaw null -> 0; durationRaw 0 -> 0; durationRaw negativo -> 0; durationRaw positivo -> clamp', () => {
            const a = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'A', durationMs: null }] } }).weekdays.sunday[0]!
            expect(a.durationMs).toBe(0)
            const b = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'B', durationMs: 0 }] } }).weekdays.sunday[0]!
            expect(b.durationMs).toBe(0)
            const c = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'C', durationMs: -1 }] } }).weekdays.sunday[0]!
            expect(c.durationMs).toBe(0)
            const d = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'D', durationMs: 5000 }] } }).weekdays.sunday[0]!
            expect(d.durationMs).toBeGreaterThan(0)
          })
        })

        // --- asString(x) || createLiturgyItemId() L68/L168 ---
        describe('asString fallback (L68/L168) mata-mutantes', () => {
          it('id ausente/undefined/nao-string -> createLiturgyItemId chamado; id string válida -> usa ela', () => {
            const withId = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'M', id: 'meu-id' }] } }).weekdays.sunday[0]!
            expect(withId.id).toBe('meu-id')
            const noId = normalizeLiturgyState({ weekdays: { sunday: [{ type: 'music', name: 'M' }] } }).weekdays.sunday[0]!
            expect(noId.id).toBeTruthy()
            expect(noId.id).not.toBe('meu-id')
          })
          it('customLiturgy id igual', () => {
            const withId = normalizeLiturgyState({ customLiturgies: [{ name: 'X', id: 'custom-1' }] }).customLiturgies[0]!
            expect(withId.id).toBe('custom-1')
            const noId = normalizeLiturgyState({ customLiturgies: [{ name: 'Y' }] }).customLiturgies[0]!
            expect(noId.id).toBeTruthy()
          })
        })

        // --- deletionLocks key && value === true L184 ---
          describe('deletionLocks key/value (L184) mata-mutantes', () => {
            it('chave vazia é rejeitada; chave 0/string entram; valor não-===true rejeitado', () => {
              const state = normalizeLiturgyState({ deletionLocks: { '': true, '0': true, a: true, b: false, c: 'true', d: 1 } })
              expect(state.deletionLocks).toEqual({ '0': true, a: true })
            })
          })

        describe('save/load', () => {
    it('save persiste e load devolve o mesmo estado', () => {
      const state = normalizeLiturgyState(seedState())
      saveLiturgyState(state)
      expect(prefs[KEY]).toBeDefined()
      const loaded = loadLiturgyState()
      expect(loaded.weekdays.sunday).toHaveLength(4)
    })

    it('load limpa done flags na 1ª leitura da sessão e marca CHECKS_CLEARED', () => {
      saveLiturgyState(normalizeLiturgyState(seedState()))
      delete sessionStore[CHECKS_KEY]
      const loaded = loadLiturgyState()
      expect(loaded.weekdays.sunday!.every((i) => !i.done)).toBe(true)
      expect(loaded.customLiturgies.every((c) => c.items.every((i) => !i.done))).toBe(true)
      expect(sessionStore[CHECKS_KEY]).toBe(true)
    })

    it('load com flag de sessão ativa preserva done flags', () => {
      saveLiturgyState(normalizeLiturgyState(seedState()))
      sessionStore[CHECKS_KEY] = true
      const loaded = loadLiturgyState()
      expect(loaded.weekdays.sunday!.some((i) => i.done)).toBe(true)
    })

    it('load sem nada persistido retorna estado vazio e grava flag', () => {
      const loaded = loadLiturgyState()
      expect(loaded.weekdays.sunday).toEqual([])
      expect(sessionStore[CHECKS_KEY]).toBe(true)
    })
  })

  describe('todayWeekday', () => {
    it('retorna um dia válido da semana', () => {
      expect(LITURGY_WEEKDAYS).toContain(todayWeekday())
    })

    it('usa fallback sunday quando getDay() retorna índice inválido', () => {
      const RealDate = Date
      class FakeDate extends RealDate {
        getDay(): number {
          return 99 as unknown as number
        }
      }
      vi.stubGlobal('Date', FakeDate)
      try {
        expect(todayWeekday()).toBe('sunday')
      } finally {
        vi.unstubAllGlobals()
        void RealDate
      }
    })
  })
})
