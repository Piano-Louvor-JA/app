// Mock localStorage ANTES de QUALQUER import
const mockStorage = new Map<string, string>()
Object.defineProperty(global, 'localStorage', {
  value: { getItem: (k: string) => mockStorage.get(k) ?? null, setItem: (k: string, v: string) => mockStorage.set(k, v), removeItem: (k: string) => mockStorage.delete(k), clear: () => mockStorage.clear() }, writable: true,
})
Object.defineProperty(global, 'sessionStorage', {
  value: { getItem: (k: string) => mockStorage.get(k) ?? null, setItem: (k: string, v: string) => mockStorage.set(k, v), removeItem: (k: string) => mockStorage.delete(k), clear: () => mockStorage.clear() }, writable: true,
})

const { mockGetUserPreference, mockSetUserPreference, mockGetBrowserItem, mockSetBrowserItem } = vi.hoisted(() => ({
  mockGetUserPreference: vi.fn(),
  mockSetUserPreference: vi.fn(),
  mockGetBrowserItem: vi.fn(),
  mockSetBrowserItem: vi.fn(),
}))

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: mockGetUserPreference,
  setUserPreference: mockSetUserPreference,
  USER_PREFERENCE_KEYS: { liturgyState: 'liturgyState' },
}))
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: mockGetBrowserItem,
  setBrowserItem: mockSetBrowserItem,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeLiturgyState,
  loadLiturgyState,
  saveLiturgyState,
  todayWeekday,
} from '../services/liturgy-preferences'
import { LITURGY_WEEKDAYS } from '../types/liturgy'

describe('liturgy-preferences mutation kill — 33 conditionals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBrowserItem.mockReturnValue(false)
    mockSetBrowserItem.mockImplementation(() => {})
    mockSetUserPreference.mockImplementation(() => {})
  })

  describe('normalizeLiturgyState — branches L191-211', () => {
    it('null/undefined → defaults', () => {
      expect(normalizeLiturgyState(null)).toEqual({
        weekdays: { sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [] },
        dayNotes: { sunday: '', monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '' },
        daySessionTimes: { sunday: { startTime: null, endTime: null }, monday: { startTime: null, endTime: null }, tuesday: { startTime: null, endTime: null }, wednesday: { startTime: null, endTime: null }, thursday: { startTime: null, endTime: null }, friday: { startTime: null, endTime: null }, saturday: { startTime: null, endTime: null } },
        customLiturgies: [],
        deletionLocks: {},
      })
      expect(normalizeLiturgyState(undefined)).toEqual(normalizeLiturgyState(null))
    })

    it('raw não-object → defaults', () => {
      expect(normalizeLiturgyState('string')).toEqual(normalizeLiturgyState(null))
      expect(normalizeLiturgyState(123)).toEqual(normalizeLiturgyState(null))
    })

    it('weekdays normaliza cada dia', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino' }], monday: 'invalid', tuesday: null } }
      const result = normalizeLiturgyState(raw)
      expect(result.weekdays.sunday).toHaveLength(1)
      expect(result.weekdays.monday).toEqual([])
      expect(result.weekdays.tuesday).toEqual([])
    })

    it('fallback liturgies key', () => {
      const raw = { liturgies: { sunday: [{ type: 'music', name: 'Hino' }] } }
      const result = normalizeLiturgyState(raw)
      expect(result.weekdays.sunday).toHaveLength(1)
    })

    it('dayNotes normaliza strings', () => {
      const raw = { dayNotes: { sunday: 'nota', monday: 123, tuesday: null } }
      const result = normalizeLiturgyState(raw)
      expect(result.dayNotes.sunday).toBe('nota')
      // asString não converte number → string vazia
      expect(result.dayNotes.monday).toBe('')
      expect(result.dayNotes.tuesday).toBe('')
    })

    it('daySessionTimes normaliza start/end', () => {
      const raw = { daySessionTimes: { sunday: { startTime: '09:00', endTime: '10:00' }, monday: 'bad' } }
      const result = normalizeLiturgyState(raw)
      expect(result.daySessionTimes.sunday.startTime).toBe('09:00')
      expect(result.daySessionTimes.sunday.endTime).toBe('10:00')
      expect(result.daySessionTimes.monday.startTime).toBeNull()
    })

    it('customLiturgies normaliza array', () => {
      const raw = { customLiturgies: [{ name: 'Custom', items: [{ type: 'music', name: 'Hino' }] }, 'bad', null] }
      const result = normalizeLiturgyState(raw)
      expect(result.customLiturgies).toHaveLength(1)
      expect(result.customLiturgies[0].name).toBe('Custom')
    })

    it('deletionLocks filtra true keys', () => {
      const raw = { deletionLocks: { 'valid': true, '': true, 'zero': false, 'valid2': true } }
      const result = normalizeLiturgyState(raw)
      expect(result.deletionLocks).toEqual({ valid: true, valid2: true })
    })
  })

  describe('normalizeItem — branches L48-104 (via normalizeLiturgyState)', () => {
    it('raw inválido → null', () => {
      const raw = { weekdays: { sunday: [null, 'string', 123, {}] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday).toEqual([])
    })

    it('type inválido → null', () => {
      const raw = { weekdays: { sunday: [{ type: 'invalid', name: 'Hino' }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday).toEqual([])
    })

    it('name vazio → null', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: '' }, { type: 'music', name: '  ' }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday).toEqual([])
    })

    it('music duration >0 → clamp', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', durationMs: 180000 }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].durationMs).toBeGreaterThan(0)
    })

    it('music duration <=0 → 0', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', durationMs: 0 }, { type: 'music', name: 'Hino2', durationMs: -5 }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].durationMs).toBe(0)
      expect(normalizeLiturgyState(raw).weekdays.sunday[1].durationMs).toBe(0)
    })

    it('category duration → 0', () => {
      const raw = { weekdays: { sunday: [{ type: 'category', name: 'Cat', durationMs: 1000 }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].durationMs).toBe(0)
    })

    it('other types duration → clamp DEFAULT', () => {
      const raw = { weekdays: { sunday: [{ type: 'prayer', name: 'Oração', durationMs: 1000 }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].durationMs).toBeGreaterThan(0)
    })

    it('id ausente → generate', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino' }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].id).toBeTruthy()
    })

    it('subtitle/subtitle vazio → string vazia', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', subtitle: '', complementaryTitle: '  ' }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].subtitle).toBe('')
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].complementaryTitle).toBeUndefined()
    })

    it('done Boolean', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', done: 'true' }, { type: 'music', name: 'Hino2', done: true }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].done).toBe(true)
      expect(normalizeLiturgyState(raw).weekdays.sunday[1].done).toBe(true)
    })

    it('category startTime/endTime normaliza', () => {
      const raw = { weekdays: { sunday: [{ type: 'category', name: 'Cat', startTime: '9:00', endTime: '10:00' }] } }
      const result = normalizeLiturgyState(raw).weekdays.sunday[0]
      expect(result.startTime).toBe('09:00')
      expect(result.endTime).toBe('10:00')
    })

    it('music startTime/endTime → null', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', startTime: '9:00', endTime: '10:00' }] } }
      const result = normalizeLiturgyState(raw).weekdays.sunday[0]
      expect(result.startTime).toBeNull()
      expect(result.endTime).toBeNull()
    })

    it('filePaths array → filtra e trim', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', filePaths: ['a.mp3', '', 'b.mp3', 123] }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].filePaths).toEqual(['a.mp3', 'b.mp3'])
    })

    it('filePath single → array com 1', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', filePath: 'c.mp3' }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].filePaths).toEqual(['c.mp3'])
    })

    it('filePath vazio → undefined', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', filePath: '' }] } }
      expect(normalizeLiturgyState(raw).weekdays.sunday[0].filePaths).toBeUndefined()
    })

    it('url/subtitle/complementaryTitle/notes trim', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', url: '  http://x  ', notes: '  nota  ' }] } }
      const item = normalizeLiturgyState(raw).weekdays.sunday[0]
      // url não faz trim (asString direto), notes faz
      expect(item.url).toBe('  http://x  ')
      expect(item.notes).toBe('nota')
    })

    it('verseBookId/verseChapter/musicId number parsing', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', verseBookId: '1', verseChapter: '2', musicId: '3', verseNumbers: '1-5' }] } }
      const item = normalizeLiturgyState(raw).weekdays.sunday[0]
      expect(item.verseBookId).toBe(1)
      expect(item.verseChapter).toBe(2)
      expect(item.musicId).toBe(3)
      expect(item.verseNumbers).toBe('1-5')
    })

    it('musicMode instrumental vs audio', () => {
      const raw = { weekdays: { sunday: [{ type: 'music', name: 'Hino', musicMode: 'instrumental' }, { type: 'music', name: 'Hino2', musicMode: 'audio' }, { type: 'music', name: 'Hino3', musicMode: 'bad' }] } }
      const items = normalizeLiturgyState(raw).weekdays.sunday
      expect(items[0].musicMode).toBe('instrumental')
      expect(items[1].musicMode).toBe('audio')
      expect(items[2].musicMode).toBe('audio')
    })
  })

  describe('loadLiturgyState — branches L213-231', () => {
    it('stored null → defaults + clearDoneFlags', async () => {
      mockGetUserPreference.mockReturnValue(null)
      const result = loadLiturgyState()
      expect(result.weekdays.sunday).toEqual([])
      expect(mockSetBrowserItem).toHaveBeenCalledWith('liturgy_checks_cleared', true, 'session')
    })

    it('checksCleared true → não limpa done', () => {
      mockGetBrowserItem.mockReturnValue(true)
      mockGetUserPreference.mockReturnValue({ weekdays: { sunday: [{ type: 'music', name: 'Hino', done: true }] } })
      const result = loadLiturgyState()
      expect(result.weekdays.sunday[0].done).toBe(true)
    })

    it('checksCleared false → limpa done de weekdays + custom', () => {
      mockGetBrowserItem.mockReturnValue(false)
      mockGetUserPreference.mockReturnValue({
        weekdays: { sunday: [{ type: 'music', name: 'Hino', done: true }] },
        customLiturgies: [{ name: 'Custom', items: [{ type: 'music', name: 'Hino', done: true }] }],
      })
      const result = loadLiturgyState()
      expect(result.weekdays.sunday[0].done).toBe(false)
      expect(result.customLiturgies[0].items[0].done).toBe(false)
      expect(mockSetUserPreference).toHaveBeenCalled()
    })
  })

  describe('saveLiturgyState', () => {
    it('chama setUserPreference', () => {
      saveLiturgyState({} as any)
      expect(mockSetUserPreference).toHaveBeenCalled()
    })
  })

  describe('todayWeekday', () => {
    it('retorna dia da semana mapeado', () => {
      const originalDate = global.Date
      global.Date = class extends Date {
        getDay() { return 3 }
      } as any
      expect(todayWeekday()).toBe('wednesday')
      global.Date = originalDate
    })
  })
})