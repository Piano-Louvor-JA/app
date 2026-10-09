import { describe, expect, it } from 'vitest'

import { computeVeredito } from '../services/verdict'

const base = {
  classeApi: null,
  internetGeralOk: true,
  hostsOverrides: [],
  proxyDetectado: false,
  certError: false,
  statusHttp: null,
  appEstadoInconsistente: false,
} as const

describe('computeVeredito (árvore de decisão da spec §8 — hipótese de triage)', () => {
  it('1.1.1.1/google mortos → sem-internet (vem antes de tudo)', () => {
    expect(computeVeredito({ ...base, internetGeralOk: false, classeApi: 'ENOTFOUND' })).toBe(
      'sem-internet',
    )
  })

  it('ENOTFOUND só nas APIs → dns', () => {
    expect(computeVeredito({ ...base, classeApi: 'ENOTFOUND' })).toBe('dns')
  })

  it('proxy + CERT_* → tls-interceptado', () => {
    expect(
      computeVeredito({ ...base, classeApi: 'CERT_ERROR', proxyDetectado: true, certError: true }),
    ).toBe('tls-interceptado')
  })

  it('403/429 → token', () => {
    expect(computeVeredito({ ...base, classeApi: 'HTTP_403', statusHttp: 403 })).toBe('token')
    expect(computeVeredito({ ...base, classeApi: 'HTTP_429', statusHttp: 429 })).toBe('token')
  })

  it('ECONNREFUSED/ETIMEDOUT só nos nossos domínios → firewall-seletivo', () => {
    expect(computeVeredito({ ...base, classeApi: 'ECONNREFUSED' })).toBe('firewall-seletivo')
    expect(computeVeredito({ ...base, classeApi: 'ETIMEDOUT' })).toBe('firewall-seletivo')
    expect(computeVeredito({ ...base, classeApi: 'TIMEOUT_LOCAL' })).toBe('firewall-seletivo')
  })

  it('proxy sem CERT → proxy', () => {
    expect(computeVeredito({ ...base, proxyDetectado: true })).toBe('proxy')
  })

  it('tudo ok na rede mas flag do app incompleta → estado-app', () => {
    expect(computeVeredito({ ...base, appEstadoInconsistente: true })).toBe('estado-app')
  })

  it('nada de anormal → ok', () => {
    expect(computeVeredito(base)).toBe('ok')
  })

  it('hosts override + ECONNREFUSED → firewall-seletivo (classe manda, override é evidência)', () => {
    expect(
      computeVeredito({
        ...base,
        classeApi: 'ECONNREFUSED',
        hostsOverrides: [{ ip: '0.0.0.0', hostname: 'api.pianolouvorja.com.br' }],
      }),
    ).toBe('firewall-seletivo')
  })
})
