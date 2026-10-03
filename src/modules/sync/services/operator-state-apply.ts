import { setUserPreference, getUserPreference } from '@shared/services/user-preferences'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

/**
 * sync v2 fase 2 — PULL: aplicar operator_state do servidor no local (LWW).
 *
 * - servidor com updated_at_ms MAIOR que o local → aplica (setUserPreference)
 * - servidor mais VELHO → local vence (nada muda)
 * - sem estado local (novo dispositivo) → aplica direto
 * - namespace desconhecida / payload inválido → ignorado sem quebrar
 * - registra o updatedAt do pull (key própria do outbox)
 *
 * Namespaces suportadas (app#336 + app#349):
 * - liturgy::week    → USER_PREFERENCE_KEYS.liturgyState
 * - scheduled::items → USER_PREFERENCE_KEYS.scheduledState
 * Cada namespace tem META KEY própria (LWW independente por namespace).
 */

const LOCAL_META_KEY = 'pianolouvorja:sync:liturgy:week:updatedAt'
const SCHEDULED_META_KEY = 'pianolouvorja:sync:scheduled:items:updatedAt'

interface OperatorStateItem {
  client_uuid: string
  namespace: string
  key: string
  value_json: string
  updated_at_ms: number
  deleted_at: number | null
}

function isValidLiturgyState(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'weekdays' in value &&
    typeof (value as Record<string, unknown>).weekdays === 'object'
  )
}

function isValidScheduledState(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).categories) &&
    Array.isArray((value as Record<string, unknown>).items)
  )
}

/**
 * Aplica os itens do servidor. Retorna true quando pelo menos um item
 * foi aplicado (e o estado local re-persistido).
 */
export function applyOperatorState(items: OperatorStateItem[]): boolean {
  let applied = false

  for (const item of items) {
    if (item.deleted_at != null) continue

    let value: unknown
    try {
      value = JSON.parse(item.value_json)
    } catch {
      continue
    }

    if (item.namespace === 'liturgy' && item.key === 'week') {
      if (!isValidLiturgyState(value)) continue

      const localUpdatedAt = Number(localStorage.getItem(LOCAL_META_KEY) ?? '0')
      if (item.updated_at_ms <= localUpdatedAt) continue // LWW: local vence

      setUserPreference(USER_PREFERENCE_KEYS.liturgyState, value)
      localStorage.setItem(LOCAL_META_KEY, String(item.updated_at_ms))
      applied = true
      continue
    }

    if (item.namespace === 'scheduled' && item.key === 'items') {
      if (!isValidScheduledState(value)) continue

      const localUpdatedAt = Number(localStorage.getItem(SCHEDULED_META_KEY) ?? '0')
      if (item.updated_at_ms <= localUpdatedAt) continue // LWW: local vence

      setUserPreference(USER_PREFERENCE_KEYS.scheduledState, value)
      localStorage.setItem(SCHEDULED_META_KEY, String(item.updated_at_ms))
      applied = true
      continue
    }

    // namespace desconhecida → ignorada sem quebrar
  }

  return applied
}

/** Registra o instante do push local (base do LWW no próximo pull). */
export function markLocalLiturgyPushed(atMs: number = Date.now()): void {
  localStorage.setItem(LOCAL_META_KEY, String(atMs))
}

/** Registra o instante do push local dos agendados (LWW da namespace scheduled). */
export function markLocalScheduledPushed(atMs: number = Date.now()): void {
  localStorage.setItem(SCHEDULED_META_KEY, String(atMs))
}

/** Lê o estado atual da liturgia como operator_state item (uso no flush). */
export function currentLiturgyOperatorItem(): Omit<OperatorStateItem, 'client_uuid'> | null {
  const state = getUserPreference<unknown>(USER_PREFERENCE_KEYS.liturgyState, null)
  if (!isValidLiturgyState(state)) return null
  return {
    namespace: 'liturgy',
    key: 'week',
    value_json: JSON.stringify(state),
    updated_at_ms: Date.now(),
    deleted_at: null,
  }
}

/** Lê os agendados atuais como operator_state item (uso no flush). */
export function currentScheduledOperatorItem(): Omit<OperatorStateItem, 'client_uuid'> | null {
  const state = getUserPreference<unknown>(USER_PREFERENCE_KEYS.scheduledState, null)
  if (!isValidScheduledState(state)) return null
  return {
    namespace: 'scheduled',
    key: 'items',
    value_json: JSON.stringify(state),
    updated_at_ms: Date.now(),
    deleted_at: null,
  }
}
