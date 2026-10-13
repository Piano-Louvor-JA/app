import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * sync v2 fase 2 — PULL: aplicar operator_state do servidor no local (LWW).
 *
 * Contrato:
 * - item do servidor com updated_at_ms MAIOR que o local → aplica
 * - item do servidor mais VELHO que o local → local vence (LWW), nada muda
 * - sem estado local → aplica direto (novo dispositivo)
 * - payload inválido → ignorado sem quebrar
 * - aplica ESTRUTURA da liturgia (weekdays/dayNotes/daySessionTimes/
 *   customLiturgies/deletionLocks) e re-persiste local
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

import { applyOperatorState } from '../operator-state-apply'

const USER_DATA_KEY = 'user_data'
const LITURGY_KEY = 'liturgy.state'

function serverItem(value: unknown, updatedAtMs: number) {
  return {
    client_uuid: 'liturgy-week',
    namespace: 'liturgy',
    key: 'week',
    value_json: JSON.stringify(value),
    updated_at_ms: updatedAtMs,
    deleted_at: null,
  }
}

function readLiturgy(): any | null {
  const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
  return userData[LITURGY_KEY] ?? null
}

function writeLiturgy(state: unknown): void {
  const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
  userData[LITURGY_KEY] = state
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData))
}

const LOCAL_STATE = {
  weekdays: { friday: [{ musicId: 1 }] },
  dayNotes: {},
  daySessionTimes: {},
  customLiturgies: [],
  deletionLocks: [],
}
const LOCAL_META_KEY = 'pianolouvorja:sync:liturgy:week:updatedAt'

describe('pull do operator_state (LWW)', () => {
  beforeEach(() => {
    lsStore.clear()
    writeLiturgy(LOCAL_STATE)
  })

  it('servidor mais novo → aplica e re-persiste local', () => {
    localStorage.setItem(LOCAL_META_KEY, '1000')
    const server = { ...LOCAL_STATE, weekdays: { friday: [{ musicId: 2 }] } }
    const applied = applyOperatorState([serverItem(server, 2000)])
    expect(applied).toBe(true)
    expect(readLiturgy().weekdays.friday[0].musicId).toBe(2)
    expect(Number(localStorage.getItem(LOCAL_META_KEY))).toBe(2000)
  })

  it('servidor mais velho → local vence (nada muda)', () => {
    localStorage.setItem(LOCAL_META_KEY, '5000')
    const server = { ...LOCAL_STATE, weekdays: { friday: [{ musicId: 9 }] } }
    const applied = applyOperatorState([serverItem(server, 1000)])
    expect(applied).toBe(false)
    expect(readLiturgy().weekdays.friday[0].musicId).toBe(1)
  })

  it('sem estado local (novo dispositivo) → aplica direto', () => {
    localStorage.removeItem(USER_DATA_KEY)
    localStorage.removeItem(LOCAL_META_KEY)
    const server = { ...LOCAL_STATE, weekdays: { friday: [{ musicId: 3 }] } }
    const applied = applyOperatorState([serverItem(server, 1234)])
    expect(applied).toBe(true)
    expect(readLiturgy().weekdays.friday[0].musicId).toBe(3)
  })

  it('payload inválido → ignorado, sem quebrar', () => {
    const applied = applyOperatorState([
      { client_uuid: 'x', namespace: 'other', key: 'k', value_json: '{invalid', updated_at_ms: 99, deleted_at: null },
    ])
    expect(applied).toBe(false)
    expect(readLiturgy().weekdays.friday[0].musicId).toBe(1)
  })
})
