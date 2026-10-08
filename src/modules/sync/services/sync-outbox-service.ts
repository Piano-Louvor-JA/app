import { getAuthSession } from '@modules/media/services/auth-client'
import { getUserPreference, registerPrefsChangedHook } from '@shared/services/user-preferences'
import {
  applyOperatorState,
  markLocalLiturgyPushed,
  markLocalPrefsPushed,
  markLocalScheduledPushed,
  SYNCABLE_PREF_KEYS,
} from './operator-state-apply'

/**
 * sync v2 fase 2 (app#336): outbox do estado do operador.
 *
 * Toda mutação do estado sincronizável grava AQUI primeiro (persistente,
 * sobrevive a reload/kill/sem rede) e um flush em batch envia pra
 * POST /v1/custom/sync com o Bearer da sessão real.
 *
 * Regras (offline-first inegociável):
 * - enqueue NUNCA toca rede
 * - coalescing por namespace+key (última escrita vence na fila)
 * - flush sem sessão real (placeholder id_user=0) NÃO envia — fica na fila
 * - falha de rede devolve os itens pra fila (nada se perde)
 */

const OUTBOX_KEY = 'pianolouvorja:sync:outbox'

export interface OutboxEntry {
  client_uuid: string
  namespace: string
  key: string
  value_json: string
  updated_at: number
  deleted_at: number | null
}

type OutboxStorage = Record<string, OutboxEntry>

function readOutbox(): OutboxStorage {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '{}') as OutboxStorage
  } catch {
    return {}
  }
}

function writeOutbox(box: OutboxStorage): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(box))
  } catch {
    // quota — estado continua em memória da sessão
  }
}

export function outboxCount(): number {
  return Object.keys(readOutbox()).length
}

export function clearOutbox(): void {
  localStorage.removeItem(OUTBOX_KEY)
}

function coalesceKey(namespace: string, key: string): string {
  return `${namespace}::${key}`
}

function uuid(): string {
  return crypto.randomUUID()
}

/** Enfileira uma mutação do estado do operador. NUNCA toca rede. */
export function enqueueOperatorState(
  namespace: string,
  key: string,
  value: unknown,
): void {
  const box = readOutbox()
  const k = coalesceKey(namespace, key)
  const existing = box[k]
  box[k] = {
    client_uuid: existing?.client_uuid ?? uuid(),
    namespace,
    key,
    value_json: JSON.stringify(value),
    updated_at: Date.now(),
    deleted_at: null,
  }
  writeOutbox(box)
}

let outboxFlushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Agenda o flush em bg (debounce 2s): agrupa mutações rápidas num único
 * POST. Compartilhado por todos os produtores de outbox (liturgia,
 * agendados, prefs...).
 */
export function scheduleOutboxFlush(delayMs = 2_000): void {
  if (outboxFlushTimer) clearTimeout(outboxFlushTimer)
  outboxFlushTimer = setTimeout(() => {
    outboxFlushTimer = null
    void flushOutbox().catch(() => {})
  }, delayMs)
}

/** Sessão real = token presente (placeholder id_user=0 também tem token — a API rejeita 401). */
function hasRealSession(): boolean {
  const session = getAuthSession()
  return Boolean(session?.token)
}

/**
 * Flush: envia a fila em um batch. Retorna o operator_state do servidor
 * (pull) quando houver, ou null se nada foi enviado (sem sessão / fila
 * vazia / falha — itens permanecem na fila).
 */
export type OperatorStateItem = {
  client_uuid: string
  namespace: string
  key: string
  value_json: string
  updated_at_ms: number
  deleted_at: number | null
}

export async function flushOutbox(): Promise<OperatorStateItem[] | null> {
  const box = readOutbox()
  const entries = Object.values(box)
  if (entries.length === 0) return null
  if (!hasRealSession()) return null

  const session = getAuthSession()
  const base = (
    import.meta.env.VITE_URL_DATABASE as string | undefined
  )?.replace(/\/+$/, '').replace(/\/json_db$/, '') ?? ''

  let response: Response
  try {
    response = await fetch(`${base}/v1/custom/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session!.token}`,
      },
      body: JSON.stringify({
        collections: [],
        operator_state: entries,
      }),
    })
  } catch {
    return null // rede — itens permanecem
  }

  if (!response.ok) {
    // 401 = sessão inválida (placeholder) → fica pra re-login; outros erros idem
    return null
  }

  const json = (await response.json()) as {
    operator_state?: Array<{
      client_uuid: string
      namespace: string
      key: string
      value_json: string
      updated_at_ms: number
      deleted_at: number | null
    }>
  }

  // enviado com sucesso: limpa SOMENTE os itens que foram no batch
  const sent = new Set(entries.map((e) => e.client_uuid))
  const rest = readOutbox()
  for (const [k, entry] of Object.entries(rest)) {
    if (sent.has(entry.client_uuid)) delete rest[k]
  }
  writeOutbox(rest)

  // registra o instante do push (base do LWW) e aplica o pull do servidor
  const newestLocal = entries.reduce(
    (max, e) => Math.max(max, e.updated_at),
    Date.now(),
  )
  // LWW por namespace: cada produtor marca o SEU relógio (se veio no batch)
  const names = new Set(entries.map((e) => `${e.namespace}::${e.key}`))
  if (names.has('liturgy::week')) markLocalLiturgyPushed(newestLocal)
  if (names.has('scheduled::items')) markLocalScheduledPushed(newestLocal)
  if (names.has('prefs::values')) markLocalPrefsPushed(newestLocal)
  const serverItems = json.operator_state ?? []
  applyOperatorState(serverItems)

  return serverItems
}

/** app#336 fase 2: flush quando a rede volta (offline-first — nada fica pra trás). */
export function startOutboxTriggers(): () => void {
  const onOnline = () => {
    void flushOutbox().catch(() => {})
  }
  window.addEventListener('online', onOnline)

  // app#349 peça 2: preferências do operador — hook global gravado pelo
  // user-preferences; só keys da whitelist vão pro outbox (lote 'prefs::values').
  registerPrefsChangedHook((key) => {
    if (!SYNCABLE_PREF_KEYS.has(key)) return
    enqueueOperatorState('prefs', 'values', {
      [key]: getUserPreference(key),
    })
    scheduleOutboxFlush()
  })

  // pull no boot (rede disponível): puxa o estado da conta
  onOnline()
  return () => window.removeEventListener('online', onOnline)
}
