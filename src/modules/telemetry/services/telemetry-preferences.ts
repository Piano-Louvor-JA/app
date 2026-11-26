import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

/**
 * Telemetria de dispositivos online (app/.planning/telemetria-dispositivos,
 * Fase 3). O envio é sempre ligado (sem opção de desativar). O id é local
 * por instalação e não sincroniza com a conta (fora de SYNCABLE_PREF_KEYS).
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function newUuidV4(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  /* v8 ignore start -- Electron/Chromium sempre tem randomUUID */
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  /* v8 ignore stop */
}

/** UUID anônimo desta instalação: criado uma vez, sem ligação com conta. */
export function getOrCreateInstallId(): string {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.telemetryInstallId, null)
  if (typeof stored === 'string' && UUID_V4.test(stored)) return stored
  const id = newUuidV4()
  setUserPreference(USER_PREFERENCE_KEYS.telemetryInstallId, id)
  return id
}
