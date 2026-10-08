// diagnostics:* — build de diagnóstico SrCaldeira.
// Rede fica no main process: Chromium/Electron fornece proxy do sistema; renderer
// recebe apenas dados serializáveis. O serviço nunca escreve em LouvorJA-PIANO.

import dns from 'node:dns/promises'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { app, ipcMain, session, shell } from 'electron'

const TIMEOUT_MS = 8_000
const API_HOSTS = [
  'api.pianolouvorja.com.br',
  'api.louvorja.com.br',
  'api.louvorja.workers.dev',
]
const ENDPOINTS = ['config', 'pt_categories']
const ESSENTIAL_FILES = [
  'pt_categories',
  'pt_hymnal',
  'pt_hymnal_1996',
  'pt_musics',
  'pt_bible_book',
  'pt_bible_version',
]

function elapsed(start) {
  return Date.now() - start
}

function rawError(error, timedOut = false) {
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
  else if (upper.includes('CERT_') || upper.includes('CERTIFICATE') || upper.includes(' SSL') || upper.includes(' TLS')) classe = 'CERT_ERROR'
  return { classe, bruto: message }
}

function timeoutPromise(promise, ms = TIMEOUT_MS) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`timeout local (${ms}ms)`), { code: 'DIAGNOSTICS_TIMEOUT' })), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

function socketProbe(connect, host, port = 443) {
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

async function dnsProbe(host) {
  const start = Date.now()
  try {
    const addresses = await timeoutPromise(dns.lookup(host, { all: true }))
    return { ok: true, ms: elapsed(start), ips: addresses.map(({ address }) => address) }
  } catch (error) {
    return { ok: false, ms: elapsed(start), ips: [], erro: rawError(error, error?.code === 'DIAGNOSTICS_TIMEOUT') }
  }
}

async function httpProbe(host, endpoint, token) {
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

function readHostsOverrides() {
  const hostsPath = process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts'
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

function folderSize(dir) {
  try {
    let total = 0
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      total += entry.isDirectory() ? folderSize(file) : statSync(file).size
    }
    return total
  } catch { return 0 }
}

function inspectRealInstallation() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const root = path.join(appData, 'LouvorJA-PIANO')
  const sysdata = path.join(root, '.sysdata')
  const records = {}
  for (const name of ESSENTIAL_FILES) {
    const file = path.join(sysdata, `${name}.bin`)
    records[name] = existsSync(file) ? statSync(file).size : null
  }
  // Arquivo criptografado: reporta presença/tamanho; não desencripta conteúdo do usuário.
  const bootstrap = path.join(sysdata, 'bootstrapComplete.files.bin')
  const temp = path.join(app.getPath('temp'), `louvorja-diagnostics-write-${process.pid}.tmp`)
  let escritaTempOk = false
  try { writeFileSync(temp, 'ok'); unlinkSync(temp); escritaTempOk = true } catch { /* reporta false */ }
  return {
    userData: root,
    existe: existsSync(root),
    sysdata: records,
    bootstrapCompleteFiles: existsSync(bootstrap) ? { presente: true, bytes: statSync(bootstrap).size } : { presente: false },
    mediaMb: Math.round((folderSize(path.join(root, 'Media')) / 1024 / 1024) * 100) / 100,
    escritaTempOk,
    diskFreeMb: null,
  }
}

function maskToken(token) {
  return token ? `${token.slice(0, 4)}…(${token.length} chars)` : null
}

function computeVerdict({ general, apis, proxy, hosts, installation }) {
  if (!general['1.1.1.1:443']?.ok && !general['google.com:443']?.ok) return 'sem-internet'
  const errors = apis.flatMap((api) => [api.dns?.erro, api.tcp?.erro, api.tls?.erro, ...api.http.map((h) => h.erro)].filter(Boolean))
  const classes = errors.map((e) => e.classe)
  if (classes.includes('ENOTFOUND')) return 'dns'
  if (classes.includes('CERT_ERROR') && Object.values(proxy).some((value) => value && !String(value).startsWith('DIRECT'))) return 'tls-interceptado'
  if (classes.includes('HTTP_403') || classes.includes('HTTP_429')) return 'token'
  if (classes.some((c) => ['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'TIMEOUT_LOCAL'].includes(c)) || hosts.length) return 'firewall-seletivo'
  if (Object.values(proxy).some((value) => value && !String(value).startsWith('DIRECT'))) return 'proxy'
  if (installation.existe && Object.values(installation.sysdata).some((value) => value === null)) return 'estado-app'
  return 'ok'
}

function reportText(report) {
  const lines = [
    'LouvorJA Diagnóstico — SrCaldeira',
    `Data: ${report.meta.dataISO}`,
    `Duração: ${report.meta.duracaoMs} ms`,
    `Veredito heurístico: ${report.vereditoHeuristico}`,
    '',
    'APIs:',
    ...report.rede.apis.map((api) => `${api.host}: DNS ${api.dns.ok ? 'OK' : api.dns.erro?.classe}; TCP ${api.tcp.ok ? 'OK' : api.tcp.erro?.classe}; TLS ${api.tls.ok ? 'OK' : api.tls.erro?.classe}; HTTP ${api.http.map((item) => item.status ?? item.erro?.classe).join(', ')}`),
    '',
    `Arquivo JSON completo: ${report.meta.arquivoJson}`,
  ]
  return lines.join('\n')
}

function outputDirectory() {
  const home = os.homedir()
  const candidates = [path.join(home, 'Desktop'), path.join(home, 'Documents'), app.getPath('temp')]
  for (const dir of candidates) {
    try { if (existsSync(dir)) return dir } catch { /* next */ }
  }
  return app.getPath('temp')
}

async function runDiagnostics() {
  const started = Date.now()
  const token = process.env.VITE_API_TOKEN
  const general = {
    '1.1.1.1:443': await socketProbe(() => net.connect({ host: '1.1.1.1', port: 443 })),
    'google.com:443': await socketProbe(() => tls.connect({ host: 'google.com', port: 443, servername: 'google.com', rejectUnauthorized: false })),
  }
  const proxy = {}
  for (const host of API_HOSTS) {
    try { proxy[`https://${host}`] = await session.defaultSession.resolveProxy(`https://${host}`) } catch (error) { proxy[`https://${host}`] = `ERRO: ${rawError(error).classe}` }
  }
  const apis = []
  for (const host of API_HOSTS) {
    const dnsResult = await dnsProbe(host)
    const tcp = await socketProbe(() => net.connect({ host, port: 443 }))
    const tlsResult = await socketProbe(() => tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }))
    const http = []
    for (const endpoint of ENDPOINTS) http.push(await httpProbe(host, endpoint, token))
    apis.push({ host, dns: dnsResult, tcp, tls: tlsResult, http })
  }
  const hostsOverrides = readHostsOverrides()
  const installation = inspectRealInstallation()
  const reproduction = []
  for (const endpoint of ENDPOINTS) {
    const start = Date.now()
    let hit = null
    for (const api of apis) {
      const probe = api.http.find((item) => item.url.includes(`/${endpoint}?`))
      if (probe?.ok) { hit = { base: `https://${api.host}`, ok: true, ms: elapsed(start) }; break }
    }
    reproduction.push(hit ?? { passo: endpoint, base: null, ok: false, ms: elapsed(start), erroBruto: apis[0]?.http.find((h) => h.url.includes(`/${endpoint}?`))?.erro?.classe ?? 'OTHER', erroMapeado: 'starting.status.errorDownload' })
  }
  const report = {
    meta: { campanha: 'SrCaldeira', versao: app.getVersion(), dataISO: new Date().toISOString(), duracaoMs: elapsed(started), tokenMascarado: maskToken(token) },
    ambiente: { os: process.platform, osRelease: os.release(), arch: process.arch, electron: process.versions.electron, chrome: process.versions.chrome, locale: app.getLocale(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, online: general['1.1.1.1:443'].ok || general['google.com:443'].ok },
    rede: { proxy: { resolveProxyPorOrigem: proxy, envHttpProxy: process.env.HTTP_PROXY ?? null, envHttpsProxy: process.env.HTTPS_PROXY ?? null }, hostsOverrides, conectividadeGeral: general, apis, reproducaoBootstrap: reproduction },
    instalacaoReal: installation,
  }
  report.vereditoHeuristico = computeVerdict({ general, apis, proxy, hosts: hostsOverrides, installation })
  const timestamp = report.meta.dataISO.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const dir = outputDirectory()
  const jsonPath = path.join(dir, `louvorja-diagnostico-${timestamp}.json`)
  const txtPath = path.join(dir, `louvorja-diagnostico-${timestamp}.txt`)
  report.meta.arquivoJson = jsonPath
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  writeFileSync(txtPath, reportText(report), 'utf8')
  return { report, jsonPath, txtPath }
}

export function registerDiagnosticsIpc() {
  ipcMain.handle('diagnostics:run', () => runDiagnostics())
  ipcMain.handle('diagnostics:open-folder', async (_event, filePath) => shell.showItemInFolder(String(filePath ?? '')))
  // DSN não existe no código/repo. No dev e sem DSN público, falha deliberadamente
  // com fallback local; o botão nunca bloqueia o arquivo já salvo.
  ipcMain.handle('diagnostics:send', async (_event, report) => {
    const dsn = process.env.DIAGNOSTICS_GLITCHTIP_DSN
    if (!dsn) return { ok: false, reason: 'DSN de diagnóstico não configurado; compartilhe o arquivo salvo.' }
    try {
      const response = await fetch(dsn, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-LouvorJA-Campanha': 'SrCaldeira' }, body: JSON.stringify({ campanha: 'SrCaldeira', report }) })
      return response.ok ? { ok: true } : { ok: false, reason: `HTTP ${response.status}` }
    } catch (error) { return { ok: false, reason: rawError(error).classe } }
  })
}
