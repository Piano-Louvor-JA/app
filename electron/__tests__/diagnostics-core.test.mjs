// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  API_HOSTS,
  ENDPOINTS,
  computeVerdict,
  maskToken,
  rawError,
  readHostsOverrides,
  reproduceBootstrap,
  sanitizeProxyEnv,
  sanitizeProxyUrl,
  socketProbe,
  tlsConnectStrict,
} from '../diagnostics-core.mjs'

describe('classificação de erro bruto', () => {
  it('preserva classe de cada família de erro', () => {
    const cases = [
      [Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }), 'ENOTFOUND'],
      [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'ECONNREFUSED'],
      [Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }), 'ETIMEDOUT'],
      [Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' }), 'EHOSTUNREACH'],
      [Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), 'ECONNRESET'],
      [Object.assign(new Error('unable to verify the first certificate'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }), 'CERT_ERROR'],
      [new Error('generic'), 'OTHER'],
    ]
    for (const [error, expected] of cases) {
      expect(rawError(error).classe).toBe(expected)
      expect(rawError(error).bruto).toContain(error.message)
    }
  })

  it('timeout local mapeia para TIMEOUT_LOCAL', () => {
    expect(rawError(new Error('timeout local (8000ms)'), true).classe).toBe('TIMEOUT_LOCAL')
  })
})

describe('TLS estrito (certificado inválido deve falhar, não passar)', () => {
  let server
  let port

  beforeAll(async () => {
    const { execFileSync } = await import('node:child_process')
    const dir = mkdtempSync(path.join(tmpdir(), 'diag-cert-'))
    const key = path.join(dir, 'key.pem')
    const cert = path.join(dir, 'cert.pem')
    // Certificado autoassinado com CN que NÃO é localhost: rejeitado pela validação normal.
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert, '-days', '1', '-nodes', '-subj', '/CN=interceptado.example'])
    server = tls.createServer({ key: require('node:fs').readFileSync(key), cert: require('node:fs').readFileSync(cert) }, () => {})
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = server.address().port
  })

  afterAll(() => {
    server?.close()
  })

  it('probe de socket com validação normal reporta CERT_ERROR em cert inválido', async () => {
    const result = await socketProbe(() => tls.connect({ host: '127.0.0.1', port, servername: 'interceptado.example', rejectUnauthorized: true }))
    expect(result.ok).toBe(false)
    expect(result.erro.classe).toBe('CERT_ERROR')
  })

  it('tlsConnectStrict não desliga validação de certificado', async () => {
    // Soquete real contra o próprio servidor de cert inválido: tem que falhar
    // com CERT_ERROR exatamente como um host da API com TLS interceptado.
    const result = await socketProbe(() => tlsConnectStrict('127.0.0.1', port))
    expect(result.ok).toBe(false)
    expect(result.erro.classe).toBe('CERT_ERROR')
  })
})

describe('sanitização de proxy (privacidade)', () => {
  it('remove credenciais user:password da URL de proxy', () => {
    const out = sanitizeProxyUrl('http://alice:secret@proxy:8080')
    expect(out).not.toContain('alice')
    expect(out).not.toContain('secret')
    expect(out).toContain('proxy:8080')
  })

  it('sanitiza env completo sem serializar segredo', () => {
    const env = { HTTP_PROXY: 'http://alice:secret@proxy:8080', HTTPS_PROXY: 'http://bob:pw2@proxy:8081', PATH: '/usr/bin' }
    const json = JSON.stringify(sanitizeProxyEnv(env))
    expect(json).not.toContain('alice')
    expect(json).not.toContain('secret')
    expect(json).not.toContain('bob')
    expect(json).not.toContain('pw2')
    expect(json).toContain('proxy:8080')
  })

  it('string não-URL com credenciais é redacted', () => {
    expect(sanitizeProxyUrl('user:pass@host:3128')).toBe('[redacted]')
  })
})

describe('reprodução do bootstrap (config → pt_categories em cascata)', () => {
  const base = API_HOSTS[0]

  function fakeFetch(routes) {
    return async (url) => {
      const hit = routes.find(([prefix]) => url.startsWith(prefix))
      if (!hit) throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }
    }
  }

  it('primeiro passo ok registra passo, base e ms', async () => {
    const steps = await withFetch(fakeFetch([[`https://${base}/json_db/config`, true]]), async () => {
      const out = await reproduceBootstrap('')
      expect(out.length).toBe(ENDPOINTS.length)
      expect(out[0].passo).toBe('config')
      expect(out[0].ok).toBe(true)
      expect(out[0].base).toBe(`https://${base}`)
      expect(typeof out[0].ms).toBe('number')
    })
  })

  it('todos os passos falhando registram erro bruto por host tentado + mapeado', async () => {
    await withFetch(async () => { throw Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443'), { code: 'ECONNREFUSED' }) }, async () => {
      const out = await reproduceBootstrap('')
      expect(out.length).toBe(ENDPOINTS.length)
      for (const failed of out) {
        expect(failed.base).toBeNull()
        expect(failed.erroMapeado).toBe('starting.status.errorDownload')
        expect(failed.tentativas.length).toBe(API_HOSTS.length)
        expect(failed.tentativas.every((t) => t.erro?.classe === 'ECONNREFUSED')).toBe(true)
        expect(failed.erroBruto).toContain('ECONNREFUSED')
      }
    })
  })
})

describe('veredito e hosts', () => {
  it('veredito heurístico cobre os cenários principais', () => {
    const okGeneral = { '1.1.1.1:443': { ok: true } }
    const installation = { existe: true, sysdata: { pt_categories: 1 } }
    const apis = [{ dns: { ok: true, erro: null }, tcp: { ok: true, erro: null }, tls: { ok: true, erro: null }, http: [{ erro: null }] }]
    expect(computeVerdict({ general: okGeneral, apis, proxy: {}, hosts: [], installation })).toBe('ok')
    expect(computeVerdict({ general: { '1.1.1.1:443': { ok: false }, 'google.com:443': { ok: false } }, apis, proxy: {}, hosts: [], installation })).toBe('sem-internet')
    const refused = [{ ...apis[0], tcp: { ok: false, erro: { classe: 'ECONNREFUSED' } } }]
    expect(computeVerdict({ general: okGeneral, apis: refused, proxy: {}, hosts: [], installation })).toBe('firewall-seletivo')
    const forbidden = [{ ...apis[0], http: [{ erro: { classe: 'HTTP_403' } }] }]
    expect(computeVerdict({ general: okGeneral, apis: forbidden, proxy: {}, hosts: [], installation })).toBe('token')
    expect(computeVerdict({ general: okGeneral, apis, proxy: { 'https://x': 'PROXY 1.2.3.4:8080' }, hosts: [], installation })).toBe('proxy')
    const cert = [{ ...apis[0], tls: { ok: false, erro: { classe: 'CERT_ERROR' } } }]
    expect(computeVerdict({ general: okGeneral, apis: cert, proxy: { 'https://x': 'PROXY 1.2.3.4:8080' }, hosts: [], installation })).toBe('tls-interceptado')
  })

  it('parser de hosts filtra apenas domínios da API', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'diag-hosts-'))
    const file = path.join(dir, 'hosts')
    writeFileSync(file, `127.0.0.1 localhost\n10.0.0.1 api.pianolouvorja.com.br # comentário\n10.0.0.2 unrelated.example\n`)
    const out = readHostsOverrides(file)
    expect(out).toEqual([{ ip: '10.0.0.1', hostname: 'api.pianolouvorja.com.br' }])
  })

  it('hosts inacessível reporta erro sem crash', () => {
    const out = readHostsOverrides(path.join(tmpdir(), 'definitely-missing-hosts-file'))
    expect(out.length).toBe(1)
    expect(out[0].erro.classe).toBe('OTHER')
  })
})

describe('token mascarado', () => {
  it('nunca serializa o token inteiro', () => {
    expect(maskToken('abcd1234567890')).toBe('abcd…(14 chars)')
    expect(maskToken('')).toBeNull()
    expect(JSON.stringify({ tokenMascarado: maskToken('segredo-super-longo') })).not.toContain('segredo-super-longo'.slice(4))
  })
})

async function withFetch(impl, run) {
  const original = globalThis.fetch
  globalThis.fetch = impl
  try { return await run() } finally { globalThis.fetch = original }
}
