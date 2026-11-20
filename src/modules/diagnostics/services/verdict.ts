/**
 * Veredito heurístico local (seção 8 da spec SrCaldeira) — HIPÓTESE de triage,
 * não conclusão. Consome o resultado das etapas do diagnóstico.
 */

import type { DiagErrorClass } from './error-classifier'
import type { HostsOverride } from './hosts-parser'

export type Veredito =
  | 'dns'
  | 'firewall-seletivo'
  | 'proxy'
  | 'tls-interceptado'
  | 'token'
  | 'estado-app'
  | 'sem-internet'
  | 'ok'

export type VereditoInput = {
  /** Classe de erro dominante na cascata de APIs (ou null se tudo ok). */
  classeApi: DiagErrorClass | null
  /** google.com / 1.1.1.1 responderam? */
  internetGeralOk: boolean
  hostsOverrides: HostsOverride[]
  proxyDetectado: boolean
  certError: boolean
  statusHttp: number | null
  /** Diagnóstico ok mas o app real falha (flag bootstrapComplete incompleta). */
  appEstadoInconsistente: boolean
}

export function computeVeredito(input: VereditoInput): Veredito {
  if (!input.internetGeralOk) return 'sem-internet'
  if (input.classeApi === 'ENOTFOUND') return 'dns'
  if (input.certError && input.proxyDetectado) return 'tls-interceptado'
  if (input.classeApi === 'HTTP_403' || input.classeApi === 'HTTP_429')
    return 'token'
  if (input.classeApi === 'ECONNREFUSED' || input.classeApi === 'EHOSTUNREACH')
    return 'firewall-seletivo'
  if (input.classeApi === 'ETIMEDOUT' || input.classeApi === 'TIMEOUT_LOCAL')
    return 'firewall-seletivo'
  if (input.proxyDetectado) return 'proxy'
  if (input.appEstadoInconsistente) return 'estado-app'
  return 'ok'
}
