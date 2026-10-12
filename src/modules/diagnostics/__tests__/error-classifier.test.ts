import { describe, expect, it } from 'vitest'

import { classifyNetworkError } from '../services/error-classifier'

describe('classifyNetworkError (classe BRUTA — ponto cego do mapBootstrapError)', () => {
  it('ENOTFOUND preservado do código Node', () => {
    const err = Object.assign(new Error('getaddrinfo EAI_AGAIN x'), { code: 'ENOTFOUND' })
    expect(classifyNetworkError(err)).toMatchObject({ classe: 'ENOTFOUND' })
  })

  it('ECONNREFUSED', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443'), { code: 'ECONNREFUSED' })
    expect(classifyNetworkError(err).classe).toBe('ECONNREFUSED')
  })

  it('ETIMEDOUT', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
    expect(classifyNetworkError(err).classe).toBe('ETIMEDOUT')
  })

  it('EHOSTUNREACH', () => {
    const err = Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' })
    expect(classifyNetworkError(err).classe).toBe('EHOSTUNREACH')
  })

  it('ECONNRESET', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    expect(classifyNetworkError(err).classe).toBe('ECONNRESET')
  })

  it('erro de certificado TLS (interceptação) → CERT_ERROR', () => {
    const err = Object.assign(new Error('unable to verify the first certificate'), {
      code: 'CERT_HAS_EXPIRED',
    })
    expect(classifyNetworkError(err).classe).toBe('CERT_ERROR')
  })

  it('mensagem sem code mas com TLS → CERT_ERROR', () => {
    expect(classifyNetworkError(new Error('SSL routines tls_process_server_certificate')).classe).toBe(
      'CERT_ERROR',
    )
  })

  it('status HTTP 403/429/5xx têm classes próprias', () => {
    expect(classifyNetworkError(new Error('x'), { status: 403 }).classe).toBe('HTTP_403')
    expect(classifyNetworkError(new Error('x'), { status: 429 }).classe).toBe('HTTP_429')
    expect(classifyNetworkError(new Error('x'), { status: 502 }).classe).toBe('HTTP_5XX')
  })

  it('timeout local do diagnóstico (≤8s) → TIMEOUT_LOCAL', () => {
    expect(classifyNetworkError(new Error('aborted'), { timedOut: true }).classe).toBe(
      'TIMEOUT_LOCAL',
    )
  })

  it('erro desconhecido → OTHER com bruto preservado', () => {
    const r = classifyNetworkError(new Error('coisa estranha'))
    expect(r.classe).toBe('OTHER')
    expect(r.bruto).toContain('coisa estranha')
  })

  it('bruto preserva a mensagem original (o que o app engole hoje)', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT 200.1.2.3:443'), { code: 'ETIMEDOUT' })
    expect(classifyNetworkError(err).bruto).toBe('Error: connect ETIMEDOUT 200.1.2.3:443')
  })
})
