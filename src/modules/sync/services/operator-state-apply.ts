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
const PREFS_META_KEY = 'pianolouvorja:sync:prefs:updatedAt'

/**
 * Whitelist de preferências que SINCRONIZAM entre dispositivos (app#349).
 * FORA desta lista NUNCA viaja — nem do servidor mais novo. Isso protege
 * tokens/sessão, estado transitório (random.session) e namespaces próprias
 * do sync (liturgy.state/scheduled.state têm operator_state dedicado).
 */
export const SYNCABLE_PREF_KEYS: ReadonlySet<string> = new Set([
  USER_PREFERENCE_KEYS.theme,
  USER_PREFERENCE_KEYS.blur,
  USER_PREFERENCE_KEYS.accent,
  USER_PREFERENCE_KEYS.interaction,
  USER_PREFERENCE_KEYS.autoBrightness,
  USER_PREFERENCE_KEYS.bibleSelectedVersion,
  USER_PREFERENCE_KEYS.projectionSettings,
  USER_PREFERENCE_KEYS.homeLocation,
  USER_PREFERENCE_KEYS.uiZoom,
  USER_PREFERENCE_KEYS.clockConfig,
  USER_PREFERENCE_KEYS.timerConfig,
  USER_PREFERENCE_KEYS.countdownConfig,
  USER_PREFERENCE_KEYS.randomConfig,
  USER_PREFERENCE_KEYS.language,
])

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

    if (item.namespace === 'prefs' && item.key === 'values') {
      if (typeof value !== 'object' || value === null) continue

      const localUpdatedAt = Number(localStorage.getItem(PREFS_META_KEY) ?? '0')
      if (item.updated_at_ms <= localUpdatedAt) continue // LWW: local vence

      let prefApplied = false
      for (const [key, prefValue] of Object.entries(value as Record<string, unknown>)) {
        if (!SYNCABLE_PREF_KEYS.has(key)) continue // whitelist: fora nunca viaja
        setUserPreference(key, prefValue)
        prefApplied = true
      }
      if (prefApplied) {
        localStorage.setItem(PREFS_META_KEY, String(item.updated_at_ms))
        applied = true
      }
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

/** Registra o instante do push local das preferências (LWW da namespace prefs). */
export function markLocalPrefsPushed(atMs: number = Date.now()): void {
  localStorage.setItem(PREFS_META_KEY, String(atMs))
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
