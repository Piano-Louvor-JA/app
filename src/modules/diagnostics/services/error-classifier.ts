/**
 * Classificador de erro BRUTO de rede — o ponto cego do app (mapBootstrapError
 * engole a classe). Aqui a classe fica intacta pra elevar ao diagnóstico.
 *
 * Porta do comportamento real do Node/Electron: `ENOTFOUND`, `ECONNREFUSED`,
 * `ETIMEDOUT`, `EHOSTUNREACH`, `CERT_*` e status HTTP problemáticos.
 */

export type DiagErrorClass =
  | 'ENOTFOUND'
  | 'ECONNREFUSED'
  | 'ETIMEDOUT'
  | 'EHOSTUNREACH'
  | 'ECONNRESET'
  | 'CERT_ERROR'
  | 'HTTP_403'
  | 'HTTP_429'
  | 'HTTP_5XX'
  | 'TIMEOUT_LOCAL'
  | 'OTHER'

export type ClassifyResult = {
  classe: DiagErrorClass
  /** Mensagem bruta preservada (o que o app real joga fora). */
  bruto: string
}

/**
 * Classifica um erro de uma etapa de rede. `status` quando veio de HTTP;
 * `timedOut` quando o timeout local (≤8s) estourou antes de qualquer resposta.
 */
export function classifyNetworkError(
  error: unknown,
  options: { status?: number; timedOut?: boolean } = {},
): ClassifyResult {
  const bruto =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error ?? 'unknown')

  if (options.timedOut) {
    return { classe: 'TIMEOUT_LOCAL', bruto }
  }

  if (typeof options.status === 'number') {
    if (options.status === 403) return { classe: 'HTTP_403', bruto }
    if (options.status === 429) return { classe: 'HTTP_429', bruto }
    if (options.status >= 500) return { classe: 'HTTP_5XX', bruto }
    return { classe: 'OTHER', bruto }
  }

  const code =
    (error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '') || ''
  const message = bruto.toUpperCase()

  if (code === 'ENOTFOUND' || message.includes('ENOTFOUND'))
    return { classe: 'ENOTFOUND', bruto }
  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED'))
    return { classe: 'ECONNREFUSED', bruto }
  if (code === 'ETIMEDOUT' || message.includes('ETIMEDOUT'))
    return { classe: 'ETIMEDOUT', bruto }
  if (code === 'EHOSTUNREACH' || message.includes('EHOSTUNREACH'))
    return { classe: 'EHOSTUNREACH', bruto }
  if (code === 'ECONNRESET' || message.includes('ECONNRESET'))
    return { classe: 'ECONNRESET', bruto }
  if (
    code.startsWith('CERT_') ||
    message.includes('CERT_') ||
    message.includes('CERTIFICATE') ||
    message.includes('SSL') ||
    message.includes('TLS')
  )
    return { classe: 'CERT_ERROR', bruto }

  return { classe: 'OTHER', bruto }
}
