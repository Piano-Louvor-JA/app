/**
 * Integração outbox ↔ ciclo de vida da sessão (B1/B2).
 *
 * - No login: tenta flush da fila pendente (crash/relogin sincroniza).
 * - Periódico: quando online e autenticado, tenta flush a cada 60s.
 * - navigator online event: flush imediato ao reconectar.
 */
import { getAuthSession } from './auth-client'
import { customApiUrl } from './custom-catalog'
import { countPending, flushOutbox } from './outbox'

let timer: ReturnType<typeof setInterval> | null = null
let flushing = false

/** Tenta flush se há sessão e fila não-vazia. Silencioso em falha. */
export async function tryFlush(): Promise<boolean> {
  if (flushing) return false
  const session = getAuthSession()
  if (!session) return false
  if ((await countPending()) === 0) return true // nada a fazer = "ok"
  flushing = true
  try {
    const r = await flushOutbox(customApiUrl(''), {
      authorization: `Bearer ${session.token}`,
    })
    return r.ok
  } finally {
    flushing = false
  }
}

/** Liga o ciclo automático (login/startup). Idempotente. */
export function startOutboxLoop(): void {
  if (timer) return
  // flush imediato (login ou boot com fila pendente)
  void tryFlush()
  timer = setInterval(() => void tryFlush(), 60_000)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void tryFlush())
  }
}

export function stopOutboxLoop(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
