import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeLiturgyState,
  loadLiturgyState,
  saveLiturgyState,
  todayWeekday,
} from '../services/liturgy-preferences'
import type { LiturgyItem, LiturgyPersistedState, WeekdayLiturgies, WeekdayNotes, WeekdaySessionTimes, CustomLiturgy } from '../types/liturgy'

// vi.hoisted garante que os mocks sejam criados ANTES dos vi.mock
const mocks = vi.hoisted(() => ({
  mockGetUserPref: vi.fn(),
  mockSetUserPref: vi.fn(),
  mockGetBrowserItem: vi.fn(),
  mockSetBrowserItem: vi.fn(),
}))

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: mocks.mockGetUserPref,
  setUserPreference: mocks.mockSetUserPref,
}))

vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: mocks.mockGetBrowserItem,
  setBrowserItem: mocks.mockSetBrowserItem,
}))

vi.mock('@shared/constants/storage-keys', () => ({
  USER_PREFERENCE_KEYS: { liturgyState: 'liturgyState' },
  CHECKS_CLEARED_KEY: 'liturgy_checks_cleared',
}))

// Imports dos módulos mockados (depois dos vi.mock)
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'
import { USER_PREFERENCE_KEYS, CHECKS_CLEARED_KEY } from '@shared/constants/storage-keys'

import { createEmptyWeekdayLiturgies, createEmptyWeekdayNotes, createEmptyWeekdaySessionTimes, LITURGY_WEEKDAYS, DEFAULT_MOMENT_DURATION_MS } from '../types/liturgy'
import { clearDoneFlags, clampMomentDurationMs, createLiturgyItemId } from '../services/liturgy-item-helpers'

const cat = (id: string, over: Partial<LiturgyItem> = {}): LiturgyItem =>
  ({ id, type: 'category', name: id, done: false, durationMs: 0, accentColor: '', categoryId: null, startTime: '09:00', endTime: '10:00', ...over }) as LiturgyItem
const child = (id: string, cid: string, over: Partial<LiturgyItem> = {}): LiturgyItem =>
  ({ id, type: 'music', name: id, done: false, durationMs: 0, accentColor: '', categoryId: cid, startTime: null, endTime: null, ...over } as LiturgyItem)

describe('liturgy-preferences — mata survivors L40-L192', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUserPref.mockReturnValue(null)
    mocks.mockGetBrowserItem.mockReturnValue(false)
  })

  describe('asNumberOrNull (L40-46) — LogicalOperator + ConditionalExpression', () => {
    it('number finito → passa por clampMomentDurationMs (arredonda 1000)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: 12345, categoryId: 'c' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(12000)
    })

    it('string numérica válida → number', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: '30000', categoryId: 'c' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(30000)
    })

    it('string com espaços → trim + parse', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: '  5000  ', categoryId: 'c' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(5000)
    })

    it('string vazia → null', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: '', categoryId: 'c' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(0)
    })

    it('string não-numérica → null', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: 'abc', categoryId: 'c' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(0)
    })

    it('null/undefined/objeto → null', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: null, categoryId: 'c' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(0)
    })
  })

  describe('normalizeItem durationMs branches (L57-65) — ConditionalExpression', () => {
    it('category → durationMs 0 (L59-60)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'category', name: 'Cat', durationMs: 999999, startTime: '09:00', endTime: '10:00' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(0)
    })

    it('music com durationRaw válido > 0 → clampMomentDurationMs (L62-63)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: 65000, categoryId: 'c' }] as unknown },
      })
      expect(state.weekdays.sunday[0].durationMs).toBe(clampMomentDurationMs(65000))
    })

    it('music com durationRaw <= 0 ou null → 0 (L62 dur != null && dur > 0)', () => {
      const zero = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: 0, categoryId: 'c' }] as unknown } })
      expect(zero.weekdays.sunday[0].durationMs).toBe(0)
      const neg = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: -100, categoryId: 'c' }] as unknown } })
      expect(neg.weekdays.sunday[0].durationMs).toBe(0)
      const nullv = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', durationMs: null, categoryId: 'c' }] as unknown } })
      expect(nullv.weekdays.sunday[0].durationMs).toBe(0)
    })

    it('outros tipos (video, etc) → clamp(durationRaw ?? DEFAULT) (L65)', () => {
      const vid = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'video', name: 'V', durationMs: 5000, categoryId: 'c' }] as unknown } })
      expect(vid.weekdays.sunday[0].durationMs).toBe(clampMomentDurationMs(5000))
      const def = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'video', name: 'V', durationMs: null, categoryId: 'c' }] as unknown } })
      expect(def.weekdays.sunday[0].durationMs).toBe(clampMomentDurationMs(DEFAULT_MOMENT_DURATION_MS))
    })
  })

  describe('normalizeItem categoryId / startTime / endTime (L75-84) — EqualityOperator + Conditional', () => {
    it('category → categoryId null (L76)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'category', name: 'Cat', categoryId: 'ignorado', startTime: '09:00', endTime: '10:00' }] as unknown },
      })
      expect(state.weekdays.sunday[0].categoryId).toBeNull()
    })

    it('non-category → categoryId da source ou null (L76)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c1', durationMs: 1000 }] as unknown },
      })
      expect(state.weekdays.sunday[0].categoryId).toBe('c1')
    })

    it('category startTime/endTime normalizada (L78-83)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'category', name: 'Cat', startTime: '9:05', endTime: '10:00' }] as unknown },
      })
      expect(state.weekdays.sunday[0].startTime).toBe('09:05')
      expect(state.weekdays.sunday[0].endTime).toBe('10:00')
    })

    it('non-category startTime/endTime → null (L81-84)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, startTime: '09:00', endTime: '10:00' }] as unknown },
      })
      expect(state.weekdays.sunday[0].startTime).toBeNull()
      expect(state.weekdays.sunday[0].endTime).toBeNull()
    })
  })

  describe('normalizeItem complementaryTitle / notes trim + undefined (L85-86)', () => {
    it('espaços → undefined (L85-86)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, complementaryTitle: '   ', notes: '  ' }] as unknown },
      })
      expect(state.weekdays.sunday[0].complementaryTitle).toBeUndefined()
      expect(state.weekdays.sunday[0].notes).toBeUndefined()
    })

    it('texto → trim persistido', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, complementaryTitle: '  titulo  ', notes: '  notas  ' }] as unknown },
      })
      expect(state.weekdays.sunday[0].complementaryTitle).toBe('titulo')
      expect(state.weekdays.sunday[0].notes).toBe('notas')
    })
  })

  describe('normalizeItem musicId/Mode/Verse/filePaths/url (L87-103)', () => {
    it('musicId string numérica → number; inválida → null', () => {
      const v = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, musicId: '42' }] as unknown } })
      expect(v.weekdays.sunday[0].musicId).toBe(42)
      const inv = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, musicId: 'x' }] as unknown } })
      expect(inv.weekdays.sunday[0].musicId).toBeNull()
    })

    it('musicMode instrumental persistido; outro → audio', () => {
      const inst = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, musicMode: 'instrumental' }] as unknown } })
      expect(inst.weekdays.sunday[0].musicMode).toBe('instrumental')
      const aud = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, musicMode: 'audio' }] as unknown } })
      expect(aud.weekdays.sunday[0].musicMode).toBe('audio')
      const other = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000, musicMode: 'qualquer' }] as unknown } })
      expect(other.weekdays.sunday[0].musicMode).toBe('audio')
    })

    it('filePaths array → trim + filter Boolean (L94-98)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'images', name: 'I', categoryId: 'c', durationMs: 1000, filePaths: [' a.jpg ', '', 'b.jpg'] }] as unknown },
      })
      expect(state.weekdays.sunday[0].filePaths).toEqual(['a.jpg', 'b.jpg'])
    })

    it('filePaths não-array mas filePath string → [filePath] (L99-100)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'images', name: 'I', categoryId: 'c', durationMs: 1000, filePath: '  x.jpg  ' }] as unknown },
      })
      expect(state.weekdays.sunday[0].filePaths).toEqual(['x.jpg'])
    })

    it('filePath vazio → undefined (L100)', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'images', name: 'I', categoryId: 'c', durationMs: 1000, filePath: '' }] as unknown },
      })
      expect(state.weekdays.sunday[0].filePaths).toBeUndefined()
    })

    it('url trim (L102) — asString NÃO trim, mantém espaços', () => {
      const state = normalizeLiturgyState({
        weekdays: { sunday: [{ id: '1', type: 'site', name: 'S', categoryId: 'c', durationMs: 1000, url: '  https://x.com  ' }] as unknown },
      })
      expect(state.weekdays.sunday[0].url).toBe('  https://x.com  ')
    })
  })

  describe('normalizeWeekdays / WeekdaySessionTimes / Notes (L113-156) — LogicalOperator !raw && typeof', () => {
    it('raw null → base empty (L115/129/139/149)', () => {
      const w = normalizeLiturgyState({ weekdays: null })
      expect(w.weekdays.sunday).toEqual([])
      expect(w.daySessionTimes.sunday.startTime).toBeNull()
      expect(w.dayNotes.sunday).toBe('')
    })

    it('raw não-objeto → base empty', () => {
      const w = normalizeLiturgyState({ weekdays: 'not an object' })
      expect(w.weekdays.sunday).toEqual([])
    })

    it('weekdays parcial: dia presente normalizado, ausente → []', () => {
      const w = normalizeLiturgyState({ weekdays: { sunday: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000 }] as unknown } })
      expect(w.weekdays.sunday).toHaveLength(1)
      expect(w.weekdays.monday).toEqual([])
    })

    it('sessionTimes parcial: dia presente → normalizado; ausente → empty', () => {
      const w = normalizeLiturgyState({ daySessionTimes: { sunday: { startTime: '9:05', endTime: '10:00' } } })
      expect(w.daySessionTimes.sunday.startTime).toBe('09:05')
      expect(w.daySessionTimes.monday.startTime).toBeNull()
    })

    it('notes parcial: dia presente → asString; ausente → ""', () => {
      const w = normalizeLiturgyState({ dayNotes: { sunday: '  anotação  ' } })
      expect(w.dayNotes.sunday).toBe('  anotação  ')
      expect(w.dayNotes.monday).toBe('')
    })
  })

  describe('normalizeCustomLiturgies (L158-177) — LogicalOperator + Conditional', () => {
    it('não-array → []', () => {
      const w = normalizeLiturgyState({ customLiturgies: 'not array' })
      expect(w.customLiturgies).toEqual([])
    })

    it('entry inválida (null/não-obj/sem name) → pula', () => {
      const w = normalizeLiturgyState({
        customLiturgies: [
          null,
          { name: '' },
          { name: 'Valida', items: [], notes: '', startTime: null, endTime: null },
        ] as unknown,
      })
      expect(w.customLiturgies).toHaveLength(1)
      expect(w.customLiturgies[0].name).toBe('Valida')
    })

    it('items/notes/startTime/endTime delegam pros normalizers', () => {
      const w = normalizeLiturgyState({
        customLiturgies: [{
          name: 'C',
          items: [{ id: '1', type: 'music', name: 'M', categoryId: 'c', durationMs: 1000 }] as unknown,
          notes: '  n  ',
          startTime: '9:05',
          endTime: '10:00',
        }] as unknown,
      })
      expect(w.customLiturgies[0].items).toHaveLength(1)
      expect(w.customLiturgies[0].notes).toBe('  n  ')
      expect(w.customLiturgies[0].startTime).toBe('09:05')
    })
  })

  describe('normalizeDeletionLocks (L179-189) — LogicalOperator key && value===true', () => {
    it('não-obj → {}', () => {
      const w = normalizeLiturgyState({ deletionLocks: 'x' })
      expect(w.deletionLocks).toEqual({})
    })

    it('chave string não-vazia + value===true → incluída; outros ignorados', () => {
      const w = normalizeLiturgyState({
        deletionLocks: { 'ok': true, '': true, 'nope': false, 'tambem': 'true', 123: true },
      })
      expect(w.deletionLocks).toEqual({ ok: true, 123: true })
    })
  })

  describe('loadLiturgyState (L213-222) — checksCleared branch', () => {
    it('checksCleared false → clearDoneFlags chamado (L219-220)', () => {
      const withDone = [{ id: '1', type: 'music', name: 'M', done: true, categoryId: 'c', durationMs: 1000 }] as LiturgyItem[]
      mocks.mockGetUserPref.mockReturnValue({ weekdays: { sunday: withDone } })
      mocks.mockGetBrowserItem.mockReturnValue(false)
      const state = loadLiturgyState()
      expect(state.weekdays.sunday[0].done).toBe(false)
    })

    it('checksCleared true → NÃO limpa done', () => {
      const withDone = [{ id: '1', type: 'music', name: 'M', done: true, categoryId: 'c', durationMs: 1000 }] as LiturgyItem[]
      mocks.mockGetUserPref.mockReturnValue({ weekdays: { sunday: withDone } })
      mocks.mockGetBrowserItem.mockReturnValue(true)
      const state = loadLiturgyState()
      expect(state.weekdays.sunday[0].done).toBe(true)
    })
  })

  describe('saveLiturgyState / loadLiturgyState (exported)', () => {
    it('saveLiturgyState → setUserPreference (sem setBrowserItem — save não seta CHECKS_CLEARED_KEY)', () => {
      const state: LiturgyPersistedState = {
        weekdays: createEmptyWeekdayLiturgies(),
        dayNotes: createEmptyWeekdayNotes(),
        daySessionTimes: createEmptyWeekdaySessionTimes(),
        customLiturgies: [],
        deletionLocks: {},
      }
      saveLiturgyState(state)
      expect(mocks.mockSetUserPref).toHaveBeenCalledWith(USER_PREFERENCE_KEYS.liturgyState, state)
      expect(mocks.mockSetBrowserItem).not.toHaveBeenCalled()
    })

    it('loadLiturgyState → getUserPreference + getBrowserItem + setBrowserItem se checksCleared false', () => {
      const withDone = [{ id: '1', type: 'music', name: 'M', done: true, categoryId: 'c', durationMs: 1000 }] as LiturgyItem[]
      mocks.mockGetUserPref.mockReturnValue({ weekdays: { sunday: withDone } })
      mocks.mockGetBrowserItem.mockReturnValue(false)
      loadLiturgyState()
      expect(mocks.mockGetUserPref).toHaveBeenCalledWith(USER_PREFERENCE_KEYS.liturgyState, null)
      expect(mocks.mockGetBrowserItem).toHaveBeenCalledWith(CHECKS_CLEARED_KEY, false, 'session')
      expect(mocks.mockSetBrowserItem).toHaveBeenCalledWith(CHECKS_CLEARED_KEY, true, 'session')
    })
  })

  describe('todayWeekday (L237-239) — returned value', () => {
    it('retorna dia da semana atual', () => {
      const day = todayWeekday()
      expect(LITURGY_WEEKDAYS).toContain(day)
    })
  })
})