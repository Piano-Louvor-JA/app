import { beforeEach, describe, expect, it } from 'vitest'
import {
  activeLiturgyStateKey,
  loadLiturgyState,
  saveLiturgyState,
} from '../liturgy-preferences'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

function readKey(key: string): unknown {
  const raw = localStorage.getItem('user_data')
  if (!raw) return null
  try {
    return JSON.parse(raw)[key] ?? null
  } catch {
    return null
  }
}

function writeKey(key: string, value: unknown): void {
  const raw = localStorage.getItem('user_data')
  const data = raw ? JSON.parse(raw) : {}
  data[key] = value
  localStorage.setItem('user_data', JSON.stringify(data))
}

function setLanguage(language: string | null): void {
  const raw = localStorage.getItem('user_data')
  const data = raw ? JSON.parse(raw) : {}
  if (language == null) delete data.language
  else data.language = language
  localStorage.setItem('user_data', JSON.stringify(data))
}

beforeEach(() => {
  localStorage.clear()
})

describe('activeLiturgyStateKey', () => {
  it('deriva do idioma ativo (pt/en/es)', () => {
    setLanguage('pt-BR')
    expect(activeLiturgyStateKey()).toBe('liturgy.state.pt')
    setLanguage('en')
    expect(activeLiturgyStateKey()).toBe('liturgy.state.en')
    setLanguage('es')
    expect(activeLiturgyStateKey()).toBe('liturgy.state.es')
  })

  it('fallback pt sem idioma configurado', () => {
    setLanguage(null)
    expect(activeLiturgyStateKey()).toBe('liturgy.state.pt')
  })
})

describe('liturgia isolada por idioma', () => {
  it('salva e carrega sem vazamento cross-locale', () => {
    setLanguage('pt-BR')
    const ptState = loadLiturgyState()
    ptState.dayNotes.sunday = 'culto em português'
    saveLiturgyState(ptState)

    setLanguage('es')
    const esState = loadLiturgyState()
    expect(esState.dayNotes.sunday).toBe('')

    esState.dayNotes.sunday = 'culto en español'
    saveLiturgyState(esState)

    setLanguage('pt-BR')
    expect(loadLiturgyState().dayNotes.sunday).toBe('culto em português')
    setLanguage('es')
    expect(loadLiturgyState().dayNotes.sunday).toBe('culto en español')

    expect(readKey('liturgy.state.pt')).toBeTruthy()
    expect(readKey('liturgy.state.es')).toBeTruthy()
  })

  it('migra estado legado liturgy.state → liturgy.state.pt uma única vez', () => {
    writeKey(USER_PREFERENCE_KEYS.liturgyState, {
      weekdays: { sunday: [{ id: 'i1', type: 'music', name: 'Hino 1' }] },
    })

    setLanguage('pt-BR')
    const state = loadLiturgyState()
    expect(state.weekdays.sunday?.[0]?.name).toBe('Hino 1')
    expect(readKey('liturgy.state.pt')).toBeTruthy()

    // Migração idempotente: estado ES migrado não herda o legado PT
    setLanguage('es')
    expect(loadLiturgyState().weekdays.sunday).toEqual([])
  })
})
