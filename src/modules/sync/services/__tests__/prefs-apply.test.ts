import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * sync v2 (app#349, peça 2) — PULL da namespace 'prefs' (LWW por lote).
 *
 * Contrato:
 * - servidor com updated_at_ms MAIOR → aplica CADA key da whitelist
 * - servidor mais velho → local vence, nada muda
 * - key FORA da whitelist → ignorada SEMPRE (mesmo do servidor mais novo)
 *   — segurança: tokens/sessão/estado transitório nunca viajam
 * - payload não-objeto → ignorado
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

import { applyOperatorState } from '../operator-state-apply'

const USER_DATA_KEY = 'user_data'
const PREFS_META_KEY = 'pianolouvorja:sync:prefs:updatedAt'

function prefsItem(values: Record<string, unknown>, updatedAtMs: number) {
  return {
    client_uuid: 'prefs',
    namespace: 'prefs',
    key: 'values',
    value_json: JSON.stringify(values),
    updated_at_ms: updatedAtMs,
    deleted_at: null,
  }
}

function readPref(key: string): unknown {
  const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
  return userData[key]
}

describe('pull do operator_state — namespace prefs (LWW, whitelist)', () => {
  beforeEach(() => {
    lsStore.clear()
  })

  it('servidor mais novo → aplica keys da whitelist', () => {
    localStorage.setItem(PREFS_META_KEY, '1000')
    const applied = applyOperatorState(
      [prefsItem({ theme: 'dark', language: 'en', 'ui.zoom': 1.2 }, 2000)],
    )
    expect(applied).toBe(true)
    expect(readPref('theme')).toBe('dark')
    expect(readPref('language')).toBe('en')
    expect(readPref('ui.zoom')).toBe(1.2)
    expect(Number(localStorage.getItem(PREFS_META_KEY))).toBe(2000)
  })

  it('servidor mais velho → local vence (nada muda)', () => {
    const userData = JSON.stringify({ theme: 'light' })
    localStorage.setItem(USER_DATA_KEY, userData)
    localStorage.setItem(PREFS_META_KEY, '5000')
    const applied = applyOperatorState([prefsItem({ theme: 'dark' }, 1000)])
    expect(applied).toBe(false)
    expect(readPref('theme')).toBe('light')
  })

  it('key fora da whitelist → ignorada sempre', () => {
    const applied = applyOperatorState(
      [prefsItem({ theme: 'dark', token: 'EVIL', 'session.x': 1, liturgyState: {} }, 9999)],
    )
    expect(readPref('theme')).toBe('dark') // whitelist aplicou
    expect(readPref('token')).toBeUndefined() // fora → ignorada
    expect(readPref('session.x')).toBeUndefined()
    expect(readPref('liturgyState')).toBeUndefined() // namespaces próprias nunca viajam como pref
    expect(applied).toBe(true)
  })

  it('payload não-objeto → ignorado', () => {
    const applied = applyOperatorState([prefsItem('not-an-object', 9999)])
    expect(applied).toBe(false)
  })
})
