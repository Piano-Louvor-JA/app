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
 */

const LOCAL_META_KEY = 'pianolouvorja:sync:liturgy:week:updatedAt'

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

/**
 * Aplica os itens do servidor. Retorna true quando pelo menos um item
 * foi aplicado (e o estado local re-persistido).
 */
export function applyOperatorState(items: OperatorStateItem[]): boolean {
  let applied = false

  for (const item of items) {
    if (item.namespace !== 'liturgy' || item.key !== 'week') continue
    if (item.deleted_at != null) continue

    let value: unknown
    try {
      value = JSON.parse(item.value_json)
    } catch {
      continue
    }
    if (!isValidLiturgyState(value)) continue

    const localUpdatedAt = Number(localStorage.getItem(LOCAL_META_KEY) ?? '0')
    if (item.updated_at_ms <= localUpdatedAt) continue // LWW: local vence

    setUserPreference(USER_PREFERENCE_KEYS.liturgyState, value)
    localStorage.setItem(LOCAL_META_KEY, String(item.updated_at_ms))
    applied = true
  }

  return applied
}

/** Registra o instante do push local (base do LWW no próximo pull). */
export function markLocalLiturgyPushed(atMs: number = Date.now()): void {
  localStorage.setItem(LOCAL_META_KEY, String(atMs))
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
