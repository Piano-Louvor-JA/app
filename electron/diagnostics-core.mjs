// Lógica pura do diagnóstico SrCaldeira — sem dependência do Electron.
// Separado de diagnostics.mjs para ser testável em node puro (vitest).
// Rede fica no main process; renderer recebe apenas dados serializáveis.

import dns from 'node:dns/promises'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'

export const TIMEOUT_MS = 8_000
export const API_HOSTS = [
  'api.pianolouvorja.com.br',
  'api.louvorja.com.br',
  'api.louvorja.workers.dev',
]
export const ENDPOINTS = ['config', 'pt_categories']
export const ESSENTIAL_FILES = [
  'pt_categories',
  'pt_hymnal',
  'pt_hymnal_1996',
  'pt_musics',
  'pt_bible_book',
  'pt_bible_version',
]

export function elapsed(start) {
  return Date.now() - start
}

export function rawError(error, timedOut = false) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'unknown')
  const code = error && typeof error === 'object' ? String(error.code ?? '') : ''
  const upper = `${code} ${message}`.toUpperCase()
  let classe = 'OTHER'
  if (timedOut) classe = 'TIMEOUT_LOCAL'
  else if (upper.includes('ENOTFOUND')) classe = 'ENOTFOUND'
  else if (upper.includes('ECONNREFUSED')) classe = 'ECONNREFUSED'
  else if (upper.includes('ETIMEDOUT')) classe = 'ETIMEDOUT'
  else if (upper.includes('EHOSTUNREACH')) classe = 'EHOSTUNREACH'
  else if (upper.includes('ECONNRESET')) classe = 'ECONNRESET'
  // A validação de certificado fica LIGADA (rejectUnauthorized: true): um AV/proxy
  // que intercepta TLS com CA própria DEVE aparecer como CERT_ERROR, não como sucesso.
  else if (upper.includes('CERT_') || upper.includes('CERTIFICATE') || upper.includes(' SSL') || upper.includes(' TLS')) classe = 'CERT_ERROR'
  return { classe, bruto: message }
}

export function timeoutPromise(promise, ms = TIMEOUT_MS) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`timeout local (${ms}ms)`), { code: 'DIAGNOSTICS_TIMEOUT' })), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

export function socketProbe(connect, host, port = 443) {
  return new Promise((resolve) => {
    const start = Date.now()
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.destroy() } catch { /* noop */ }
      resolve({ ms: elapsed(start), ...result })
    }
    const socket = connect()
    const timer = setTimeout(() => finish({ ok: false, erro: rawError(new Error('timeout local'), true) }), TIMEOUT_MS)
    socket.once('secureConnect', () => finish({ ok: true }))
    socket.once('connect', () => {
      if (!(socket instanceof tls.TLSSocket)) finish({ ok: true })
    })
    socket.once('error', (error) => finish({ ok: false, erro: rawError(error) }))
  })
}

export function tlsConnectStrict(host, port = 443) {
  // rejectUnauthorized NÃO é desligado: handshake só completa com certificado válido.
  const isIp = net.isIP(host) !== 0
  return tls.connect({ host, port, servername: isIp ? undefined : host })
}

export async function dnsProbe(host) {
  const start = Date.now()
  try {
    const addresses = await timeoutPromise(dns.lookup(host, { all: true }))
    return { ok: true, ms: elapsed(start), ips: addresses.map(({ address }) => address) }
  } catch (error) {
    return { ok: false, ms: elapsed(start), ips: [], erro: rawError(error, error?.code === 'DIAGNOSTICS_TIMEOUT') }
  }
}

export async function httpProbe(host, endpoint, token) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const url = `https://${host}/json_db/${endpoint}?${date}`
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: token ? { 'Api-Token': token } : {},
      signal: controller.signal,
    })
    const body = await response.arrayBuffer()
    const result = { url, status: response.status, ok: response.ok, ttfbMs: elapsed(start), bytes: body.byteLength, erro: null }
    if (!response.ok) {
      const classe = response.status === 403 ? 'HTTP_403' : response.status === 429 ? 'HTTP_429' : response.status >= 500 ? 'HTTP_5XX' : 'OTHER'
      result.erro = { classe, bruto: `HTTP ${response.status}` }
    }
    return result
  } catch (error) {
    return { url, status: null, ok: false, ttfbMs: elapsed(start), bytes: 0, erro: rawError(error, controller.signal.aborted) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Reprodução REAL do bootstrap do app: config → pt_categories na MESMA base
 * em cascata, um passo por endpoint, registrando tentativa por host.
 */
export async function reproduceBootstrap(token) {
  const passos = []
  for (const endpoint of ENDPOINTS) {
    const start = Date.now()
    const tentativas = []
    let ok = false
    for (const host of API_HOSTS) {
      const probe = await httpProbe(host, endpoint, token)
      tentativas.push({ host, ok: probe.ok, status: probe.status, ms: probe.ttfbMs, erro: probe.erro })
      if (probe.ok) { ok = true; break }
    }
    passos.push({
      passo: endpoint,
      ok,
      ms: elapsed(start),
      base: ok ? `https://${tentativas.find((t) => t.ok).host}` : null,
      tentativas,
      erroBruto: ok ? null : tentativas.at(-1)?.erro?.bruto ?? 'OTHER',
      erroMapeado: ok ? null : 'starting.status.errorDownload',
    })
  }
  return passos
}

export function readHostsOverrides(hostsPath = defaultHostsPath()) {
  try {
    const text = readFileSync(hostsPath, 'utf8')
    const out = []
    for (const raw of text.split(/\r?\n/)) {
      const fields = raw.replace(/#.*/, '').trim().split(/\s+/)
      if (fields.length < 2) continue
      const [ip, ...names] = fields
      for (const hostname of names) {
        const h = hostname.toLowerCase()
        if (API_HOSTS.some((domain) => h === domain || h.endsWith(`.${domain}`))) out.push({ ip, hostname: h })
      }
    }
    return out
  } catch (error) {
    return [{ erro: rawError(error) }]
  }
}

function defaultHostsPath() {
  return process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts'
}

/**
 * Proxy do ambiente SANITIZADO: URLs de proxy frequentemente embutem
 * user:senha — credenciais NUNCA vão pro JSON compartilhável.
 */
function stripCredentials(raw) {
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    const out = url.toString()
    // URL ambígua (ex.: "user:pass@host:3128" vira scheme "user:") pode
    // preservar as credenciais no toString — nesse caso redact inteiro.
    if (out.includes('@') && /:[^@/\s]+@/.test(out)) return '[redacted]'
    return out
  } catch {
    return '[redacted]'
  }
}

export function sanitizeProxyUrl(raw) {
  if (!raw || typeof raw !== 'string') return raw ?? null
  const looksLikeCredentials = /:\/\/[^/@\s]+:[^/@\s]+@/.test(raw) || /[^:/\s]+:[^@/\s]+@[^/\s]+/.test(raw)
  if (looksLikeCredentials) return stripCredentials(raw)
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return raw
  }
}

export function sanitizeProxyEnv(env = {}) {
  const out = {}
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
    if (env[key]) out[key] = sanitizeProxyUrl(env[key])
  }
  return out
}

export function maskToken(token) {
  return token ? `${token.slice(0, 4)}…(${token.length} chars)` : null
}

export function computeVerdict({ general, apis, proxy, hosts, installation }) {
  if (!general['1.1.1.1:443']?.ok && !general['google.com:443']?.ok) return 'sem-internet'
  const errors = apis.flatMap((api) => [api.dns?.erro, api.tcp?.erro, api.tls?.erro, ...api.http.map((h) => h.erro)].filter(Boolean))
  const classes = errors.map((e) => e.classe)
  const proxyValues = Object.values(proxy?.resolveProxyPorOrigem ?? proxy ?? {})
  const proxyDetectado = proxyValues.some((value) => value && !String(value).startsWith('DIRECT'))
  if (classes.includes('ENOTFOUND')) return 'dns'
  if (classes.includes('CERT_ERROR') && proxyDetectado) return 'tls-interceptado'
  if (classes.includes('HTTP_403') || classes.includes('HTTP_429')) return 'token'
  if (classes.some((c) => ['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'TIMEOUT_LOCAL'].includes(c)) || hosts.length) return 'firewall-seletivo'
  if (proxyDetectado) return 'proxy'
  if (installation.existe && Object.values(installation.sysdata).some((value) => value === null)) return 'estado-app'
  return 'ok'
}

export function folderSize(dir) {
  try {
    let total = 0
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      total += entry.isDirectory() ? folderSize(file) : statSync(file).size
    }
    return total
  } catch { return 0 }
}

export function reportText(report) {
  const lines = [
    'LouvorJA Diagnóstico — SrCaldeira',
    `Data: ${report.meta.dataISO}`,
    `Duração: ${report.meta.duracaoMs} ms`,
    `Veredito heurístico: ${report.vereditoHeuristico}`,
    '',
    'APIs:',
    ...report.rede.apis.map((api) => `${api.host}: DNS ${api.dns.ok ? 'OK' : api.dns.erro?.classe}; TCP ${api.tcp.ok ? 'OK' : api.tcp.erro?.classe}; TLS ${api.tls.ok ? 'OK' : api.tls.erro?.classe}; HTTP ${api.http.map((item) => item.status ?? item.erro?.classe).join(', ')}`),
    '',
    'Reprodução do bootstrap:',
    ...report.rede.reproducaoBootstrap.map((p) => `${p.passo}: ${p.ok ? `OK em ${p.base} (${p.ms}ms)` : `FALHOU (${p.erroBruto}) após ${p.tentativas.length} host(s)`}`),
    '',
    `Arquivo JSON completo: ${report.meta.arquivoJson}`,
  ]
  return lines.join('\n')
}

export function generalProbes() {
  return {
    '1.1.1.1:443': socketProbe(() => net.connect({ host: '1.1.1.1', port: 443 })),
    'google.com:443': socketProbe(() => tls.connect({ host: 'google.com', port: 443, servername: 'google.com' })),
  }
}
