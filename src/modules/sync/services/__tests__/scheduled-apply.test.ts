import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * sync v2 fase "scheduled" (app#349) — PULL: aplicar operator_state da
 * namespace 'scheduled' (key 'items') no local (LWW).
 *
 * Contrato:
 * - item do servidor com updated_at_ms MAIOR que o local → aplica
 * - item do servidor mais VELHO → local vence (LWW), nada muda
 * - sem estado local (novo dispositivo) → aplica direto
 * - payload inválido (sem categories/items array) → ignorado sem quebrar
 * - namespace desconhecida → ignorada (não cai no branch de scheduled)
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

import { applyOperatorState } from '../operator-state-apply'

const USER_DATA_KEY = 'user_data'
const SCHEDULED_KEY = 'scheduled.state'
const SCHEDULED_META_KEY = 'pianolouvorja:sync:scheduled:items:updatedAt'

function serverItem(value: unknown, updatedAtMs: number) {
  return {
    client_uuid: 'scheduled-items',
    namespace: 'scheduled',
    key: 'items',
    value_json: JSON.stringify(value),
    updated_at_ms: updatedAtMs,
    deleted_at: null,
  }
}

function readScheduled(): any | null {
  const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
  return userData[SCHEDULED_KEY] ?? null
}

function writeScheduled(state: unknown): void {
  const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
  userData[SCHEDULED_KEY] = state
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData))
}

const LOCAL_STATE = {
  categories: [{ id: 'c1', name: 'Cultos' }],
  items: [{ id: 'i1', categoryId: 'c1', date: '2026-10-10', name: 'Programa', filePath: '', isRelativePath: false, notes: '' }],
}

describe('pull do operator_state — namespace scheduled (LWW)', () => {
  beforeEach(() => {
    lsStore.clear()
    writeScheduled(LOCAL_STATE)
  })

  it('servidor mais novo → aplica e re-persiste local', () => {
    localStorage.setItem(SCHEDULED_META_KEY, '1000')
    const server = { ...LOCAL_STATE, items: [{ ...LOCAL_STATE.items[0]!, name: 'Viajou' }] }
    const applied = applyOperatorState([serverItem(server, 2000)])
    expect(applied).toBe(true)
    expect(readScheduled().items[0].name).toBe('Viajou')
    expect(Number(localStorage.getItem(SCHEDULED_META_KEY))).toBe(2000)
  })

  it('servidor mais velho → local vence (nada muda)', () => {
    localStorage.setItem(SCHEDULED_META_KEY, '5000')
    const server = { ...LOCAL_STATE, items: [] }
    const applied = applyOperatorState([serverItem(server, 1000)])
    expect(applied).toBe(false)
    expect(readScheduled().items).toHaveLength(1)
  })

  it('sem estado local (novo dispositivo) → aplica direto', () => {
    localStorage.removeItem(USER_DATA_KEY)
    localStorage.removeItem(SCHEDULED_META_KEY)
    const server = { ...LOCAL_STATE, categories: [{ id: 'c9', name: 'Outra' }] }
    const applied = applyOperatorState([serverItem(server, 1234)])
    expect(applied).toBe(true)
    expect(readScheduled().categories[0].id).toBe('c9')
    expect(Number(localStorage.getItem(SCHEDULED_META_KEY))).toBe(1234)
  })

  it('payload inválido (sem arrays) → ignorado, sem quebrar', () => {
    const applied = applyOperatorState([serverItem({ foo: 'bar' }, 9999)])
    expect(applied).toBe(false)
    expect(readScheduled().items).toHaveLength(1)
  })

  it('meta keys das namespaces são independentes (liturgy não afeta scheduled)', () => {
    localStorage.setItem(SCHEDULED_META_KEY, '5000')
    // item liturgy mais novo NÃO pode destravar o scheduled local mais novo
    const liturgyItem = {
      client_uuid: 'liturgy-week',
      namespace: 'liturgy',
      key: 'week',
      value_json: JSON.stringify({ weekdays: {} }),
      updated_at_ms: 9000,
      deleted_at: null,
    }
    const server = { ...LOCAL_STATE, items: [] }
    const applied = applyOperatorState([liturgyItem, serverItem(server, 1000)])
    // liturgy aplicou (weekdays presente), scheduled NÃO (local mais novo venceu)
    expect(readScheduled().items).toHaveLength(1)
    expect(applied).toBe(true)
  })
})
