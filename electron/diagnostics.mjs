// diagnostics:* — build de diagnóstico SrCaldeira.
// Rede fica no main process: Chromium/Electron fornece proxy do sistema; renderer
// recebe apenas dados serializáveis. O serviço nunca escreve em LouvorJA-PIANO.

import crypto from 'node:crypto'
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { app, ipcMain, session, shell, screen } from 'electron'
import { API_HOSTS, ESSENTIAL_FILES, ENDPOINTS, TIMEOUT_MS, computeVerdict, dnsProbe, elapsed, folderSize, generalProbes, httpProbe, maskToken, rawError, readHostsOverrides, reproduceBootstrap, reportText, sanitizeProxyEnv, socketProbe, tlsConnectStrict } from './diagnostics-core.mjs'
import { collectLogs, crashHistory, diskFreeMb, dnsSanity, essentialHeaders, memorySnapshot, storageHealth, userDataWriteProbe, windowsAntivirus } from './diagnostics-v2-collectors.mjs'
import { createChildProcessGone, createLatencyAggregator, createNetTransitionLog, createWsTelemetry, sanitizeAudioDevices } from './diagnostics-v3-telemetry.mjs'
import { setLatencyObserver } from './diagnostics-latency-hook.mjs'
import {
  analyzeInterfaces,
  computeRemoteVerdict,
  listenersOnPort,
  probeExcludedPorts,
  probeFirewall,
  probeListeners,
  probeNetworkCategory,
  selfProbe,
} from './remote-diagnostics.mjs'
import { getRemoteStatus } from './remote-server.mjs'
import { sanitizeRendererErrors } from './renderer-errors.mjs'
import { sanitizeDownloadFailures } from './download-failures.mjs'
import { collectEdidMonitors } from './edid.mjs'

let diagnosticToken = ''
export function setDiagnosticsToken(token) {

  diagnosticToken = typeof token === 'string' ? token : ''
}

// diag-v4-umbrella: telemetria volátil de sessão (spec frozen 2026-10-14)
const wsTelemetry = createWsTelemetry()
const latency = createLatencyAggregator()
const netTransitions = createNetTransitionLog()
const childGone = createChildProcessGone()
let audioDevices = null

export function trackWsConnection() { try { wsTelemetry.onConnection() } catch { /* best-effort */ } }
export function trackWsDisconnect(reason) { try { wsTelemetry.onDisconnect(reason) } catch { /* best-effort */ } }
export function trackApiLatency(host, ms) { try { latency.observe(host, ms) } catch { /* best-effort */ } }
export function trackNetTransition(type) { try { netTransitions.record(type) } catch { /* best-effort */ } }

function telemetrySnapshot() {
  const safeSnap = (fn) => { try { return fn() } catch { return null } }
  return {
    palcoWs: safeSnap(() => wsTelemetry.snapshot()),
    redeLatencia: safeSnap(() => latency.snapshot()),
    clockSkewMs: safeSnap(() => sessionClockSkewMs()),
    audioDevices,
    processosFilhos: safeSnap(() => childGone.snapshot()),
    transicoesRede: safeSnap(() => netTransitions.snapshot()),
  }
}

let sessionClockSkewMs = () => null
export function setClockSkewProvider(fn) { sessionClockSkewMs = typeof fn === 'function' ? fn : () => null }

// liga o hook de latência do diagnostics-core ao agregador desta sessão
setLatencyObserver((host, ms) => latency.observe(host, ms))

let rendererErrors = []
let downloadFailures = []

export const DIAGNOSTICS_MAX_JSON_BYTES = 300 * 1024

export function serializeReportWithinBudget(report, budget = DIAGNOSTICS_MAX_JSON_BYTES) {
  const json = (value) => JSON.stringify(value, null, 2)
  const redact = (value) => typeof value === 'string'
    ? value
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
      .replace(/[A-Za-z0-9+/_-]{41,}/g, '[redacted-blob]')
    : value
  const count = (value) => Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0
  let structurallyTruncated = false
  const sanitize = (value, depth = 0) => {
    if (typeof value === 'string') return redact(value).slice(0, 512)
    if (!value || typeof value !== 'object') return value
    if (depth >= 8) {
      structurallyTruncated = true
      return `[truncated-${Array.isArray(value) ? 'array' : 'object'}]`
    }
    if (Array.isArray(value)) {
      const limit = 20
      if (value.length > limit) structurallyTruncated = true
      return value.slice(0, limit).map((item) => sanitize(item, depth + 1)).concat(value.length > limit ? [`[${value.length - limit} omitted]`] : [])
    }
    const entries = Object.entries(value)
    if (entries.length > 100) structurallyTruncated = true
    return Object.fromEntries(entries.slice(0, 100).map(([key, item]) => [key, sanitize(item, depth + 1)]))
  }
  const sanitized = sanitize(report)
  if (structurallyTruncated) return json({
    app: typeof report?.app === 'string' ? redact(report.app).slice(0, 512) : null,
    version: typeof report?.version === 'string' ? redact(report.version).slice(0, 512) : null,
    generatedAt: typeof report?.generatedAt === 'string' ? report.generatedAt.slice(0, 512) : null,
    timestamps: { generatedAt: typeof report?.generatedAt === 'string' ? report.generatedAt.slice(0, 512) : null },
    counts: { logs: count(report?.triage?.logs), rendererErrors: count(report?.triage?.rendererErrors), downloadFailures: count(report?.triage?.downloadFailures), meta: count(report?.meta) },
    truncated: 'structural',
  })
  const size = () => Buffer.byteLength(json(sanitized), 'utf8')
  const removeOldest = (items, clear) => {
    while (size() >= budget && items.length) clear(items.shift())
  }
  const logs = sanitized.triage?.logs
  if (Array.isArray(logs)) removeOldest(logs, () => {})
  const errors = sanitized.triage?.rendererErrors
  if (Array.isArray(errors)) {
    removeOldest(errors, (event) => { event.stack = null })
    removeOldest(errors, () => {})
  }
  const downloads = sanitized.triage?.downloadFailures
  if (Array.isArray(downloads)) removeOldest(downloads, () => {})
  if (size() < budget) return json(sanitized)

  return json({
    app: typeof report?.app === 'string' ? redact(report.app).slice(0, 512) : null,
    version: typeof report?.version === 'string' ? redact(report.version).slice(0, 512) : null,
    generatedAt: typeof report?.generatedAt === 'string' ? report.generatedAt.slice(0, 512) : null,
    timestamps: { generatedAt: typeof report?.generatedAt === 'string' ? report.generatedAt.slice(0, 512) : null },
    counts: {
      logs: count(report?.triage?.logs),
      rendererErrors: count(report?.triage?.rendererErrors),
      downloadFailures: count(report?.triage?.downloadFailures),
      meta: count(report?.meta),
    },
    truncated: 'structural',
  })
}

function monitoresDetalhes() {
  try {
    const primaryId = screen.getPrimaryDisplay().id
    const displays = screen.getAllDisplays()
    let edid = []
    try { edid = collectEdidMonitors() } catch { /* EDID é best-effort */ }
    return displays.map((display, i) => {
      const edidMatch =
        edid.find((m) => display.label && m.connector?.includes(String(display.label))) ??
        edid[i] ??
        null
      const { bounds, workArea } = display
      const overscanSuspeito =
        bounds.width - workArea.width !== 0 || bounds.height - workArea.height !== 0
      return {
        indice: i + 1,
        id: display.id,
        primario: display.id === primaryId,
        bounds: { width: bounds.width, height: bounds.height },
        workArea: { width: workArea.width, height: workArea.height },
        rotacao: display.rotation,
        scaleFactor: display.scaleFactor,
        overscanSuspeito,
        fabricante: edidMatch?.manufacturer ?? null,
        modelo: edidMatch?.name ?? null,
        productCode: edidMatch?.productCode ?? null,
        connector: edidMatch?.connector ?? null,
      }
    })
  } catch { return null }
}

function inspectRealInstallation() {
  const appData = app.getPath('appData')
  const root = path.join(appData, 'LouvorJA-PIANO')
  const sysdata = path.join(root, '.sysdata')
  const records = {}
  for (const name of ESSENTIAL_FILES) {
    const file = path.join(sysdata, `${name}.bin`)
    records[name] = existsSync(file) ? statSync(file).size : null
  }
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
    headersEssenciais: essentialHeaders(sysdata, ESSENTIAL_FILES),
    escritaUserData: userDataWriteProbe(root),
  }
}

function clientHeaders() {
  let version = ''
  try { version = typeof app.getVersion === 'function' ? app.getVersion() : '' } catch { version = '' }
  return {
    'X-Client-Platform': 'desktop',
    ...(version ? { 'X-Client-Version': version } : {}),
  }
}

/**
 * GET de mídia REAL (endpoint /file/, host de arquivos): primeiros ~64KB de um
 * arquivo conhecido, buffer em memória — nada é salvo no disco do usuário.
 * Diferencia "API JSON ok mas CDN de arquivos bloqueada".
 */
export async function mediaFileProbe(host, token) {
  const url = `https://${host}/file/musics/pt/90141.mp3`
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { ...(token ? { 'Api-Token': token } : {}), Range: 'bytes=0-65535', ...clientHeaders() },
      redirect: 'manual',
      signal: controller.signal,
    })
    const body = await response.arrayBuffer()
    const result = { url, status: response.status, ok: response.ok, bytes: body.byteLength, ms: elapsed(start), erro: null }
    if (!response.ok) {
      const classe = response.status >= 300 && response.status < 400
        ? 'HTTP_302_REDIRECT'
        : response.status === 403
          ? 'HTTP_403'
          : response.status === 404
            ? 'HTTP_404'
            : response.status === 429
              ? 'HTTP_429'
              : response.status >= 500
                ? 'HTTP_5XX'
                : 'OTHER'
      result.erro = { classe, bruto: `HTTP ${response.status}` }
    }
    return result
  } catch (error) {
    return { url, status: null, ok: false, bytes: 0, ms: elapsed(start), erro: rawError(error, controller.signal.aborted) }
  } finally {
    clearTimeout(timer)
  }
}

function outputDirectory() {
  const home = os.homedir()
  const candidates = [path.join(home, 'Desktop'), path.join(home, 'Documents'), app.getPath('temp')]
  for (const dir of candidates) {
    try { if (existsSync(dir)) return dir } catch { /* next */ }
  }
  return app.getPath('temp')
}

async function collectControleRemoto() {
  const picked = analyzeInterfaces(os.networkInterfaces())
  const rs = getRemoteStatus()
  const status = rs.status
  const portaAtiva = rs.port
  const self = portaAtiva ? await selfProbe(picked.ipEscolhido, portaAtiva) : null
  const [excluded, firewall, listeners, redePublica] = await Promise.all([
    probeExcludedPorts(),
    probeFirewall(),
    probeListeners(),
    probeNetworkCategory(),
  ])
  const janelasPortasExcluidas = (excluded ?? []).filter(({ start, end }) => end >= 7071 && start <= 7075)
  const { portaRoubada, dono } = listenersOnPort(listeners ?? [], portaAtiva ?? 7071, process.pid)
  const regraFirewall = firewall && 'allow7071' in firewall
    ? { allow7071: firewall.allow7071 }
    : firewall?.allow?.length
      ? { allow7071: true }
      : { allow7071: null }
  return {
    status,
    portaAtiva,
    interfaces: picked.interfaces,
    ipEscolhido: picked.ipEscolhido,
    ipSuspeito: picked.ipSuspeito,
    selfProbe: self,
    janelasPortasExcluidas,
    regraFirewall,
    evidenciaFirewall: firewall,
    caos: {
      portaRoubada,
      donoPorta: dono,
      redePublica,
      vpnAtiva: picked.vpnAtiva,
      subnetsDiferentes: picked.subnetsDiferentes,
      listeners: listeners ?? [],
    },
  }
}

const REMOTE_TIPS = {
  'remote-porta-excluida': 'Windows reservou a porta 7071 (Hyper-V/WSL). Reinicie o PC ou peça suporte para liberar a faixa.',
  'remote-porta-roubada': 'Outro programa usa a porta 7071. Feche-o ou reinicie o PC e abra o LouvorJA primeiro.',
  'remote-ip-adaptador-errado': 'O QR aponta para um IP de rede virtual (WSL/Docker/VPN). Desative VPN/WSL ou conecte o cabo de rede.',
  'remote-firewall': 'Windows Defender está bloqueando. Permita o LouvorJA no firewall (rede privada) ou mude a rede para Privada.',
  'remote-ok': 'Controle remoto: tudo certo na rede.',
}

function verdictWithRemote({ general, apis, proxy, hosts, installation, extra, controleRemoto }) {
  const remoteVerdict = computeRemoteVerdict({
    status: controleRemoto?.status,
    portaAtiva: controleRemoto?.portaAtiva,
    janelasPortasExcluidas: controleRemoto?.janelasPortasExcluidas ?? [],
    selfProbe: controleRemoto?.selfProbe,
    ipSuspeito: controleRemoto?.ipSuspeito,
    portaRoubada: controleRemoto?.caos?.portaRoubada,
    redePublica: controleRemoto?.caos?.redePublica,
    regraInbound: Boolean(controleRemoto?.regraFirewall?.allow7071 ?? controleRemoto?.evidenciaFirewall?.allow?.length),
  })
  if (remoteVerdict && remoteVerdict !== 'remote-ok') return remoteVerdict
  return computeVerdict({ general, apis, proxy, hosts, installation, extra })
}

function reportTextWithPalco(report) {
  const base = reportText(report)
  const extras = []
  const cr = report.controleRemoto
  if (cr) {
    extras.push('', 'Controle remoto:')
    extras.push(`Servidor: ${cr.status ?? 'não iniciado'}${cr.portaAtiva ? ` (porta ${cr.portaAtiva})` : ''}; IP do QR: ${cr.ipEscolhido}${cr.ipSuspeito ? ' (SUSPEITO)' : ''}`)
    if (cr.selfProbe) extras.push(`Teste de conexão local: ${cr.selfProbe.ok ? 'OK' : `FALHOU (${cr.selfProbe.erro})`}`)
    if (cr.janelasPortasExcluidas?.length) extras.push(`Portas reservadas pelo sistema: ${cr.janelasPortasExcluidas.map((j) => `${j.start}-${j.end}`).join(', ')}`)
    if (cr.caos?.portaRoubada) extras.push(`Porta em uso por outro programa: ${cr.caos.donoPorta}`)
    if (cr.caos?.redePublica) extras.push('Rede marcada como PÚBLICA no Windows.')
    if (cr.caos?.vpnAtiva) extras.push('VPN/adapter virtual ativo detectado.')
    if (report.vereditoHeuristico?.startsWith('remote-')) extras.push(`Dica: ${REMOTE_TIPS[report.vereditoHeuristico] ?? ''}`)
  }
  const monitores = Array.isArray(report.triage?.monitores) ? report.triage.monitores : []
  if (monitores.length) {
    extras.push('', 'Monitores/TVs:')
    for (const m of monitores) {
      const modelo = m.modelo ? ` — ${m.modelo}` : m.fabricante ? ` — ${m.fabricante}` : ''
      extras.push(
        `#${m.indice}${m.primario ? ' (principal)' : ''}: ${m.bounds.width}x${m.bounds.height}${m.scaleFactor !== 1 ? ` @${m.scaleFactor}x` : ''}${modelo}` +
          (m.overscanSuspeito ? ' [ATENÇÃO: bordas prováveis — ajuste Picture Size da TV p/ "Just Scan"/"Screen Fit"]' : ''),
      )
    }
  }
  if (!extras.length) return base
  const marker = '\nAPIs:\n'
  const idx = base.indexOf(marker)
  if (idx === -1) return `${base}\n${extras.join('\n')}`
  return `${base.slice(0, idx)}\n${extras.join('\n')}${base.slice(idx)}`
}

async function runDiagnostics() {
  const started = Date.now()
  const token = diagnosticToken
  const general = await generalProbes()
  const proxy = {}
  for (const host of API_HOSTS) {
    try { proxy[`https://${host}`] = await session.defaultSession.resolveProxy(`https://${host}`) } catch (error) { proxy[`https://${host}`] = `ERRO: ${rawError(error).classe}` }
  }
  const apis = []
  for (const host of API_HOSTS) {
    const dnsResult = await dnsProbe(host)
    const tcp = await socketProbe(() => net.connect({ host, port: 443 }))
    const tlsResult = await socketProbe(() => tlsConnectStrict(host))
    const http = []
    for (const endpoint of ENDPOINTS) http.push(await httpProbe(host, endpoint, token))
    apis.push({ host, dns: dnsResult, tcp, tls: tlsResult, http })
  }
  const hostsOverrides = readHostsOverrides()
  const installation = inspectRealInstallation()
  const controleRemoto = await collectControleRemoto()
  const mediaHost = API_HOSTS[0]
  const mediaProbe = await mediaFileProbe(mediaHost, token)
  const storage = storageHealth(installation.userData)
  const crashes = crashHistory(installation.userData)
  const memoria = memorySnapshot()
  const discoLivreMb = installation.existe ? await diskFreeMb(installation.userData) : await diskFreeMb(app.getPath('temp'))
  const antivirus = await windowsAntivirus()
  const logs = collectLogs(installation.userData, token)
  const dnsSuspeito = dnsSanity(apis)
  let gpuFeatures = null
  try { gpuFeatures = app.getGPUFeatureStatus() } catch { /* fora do Electron rodando: null */ }
  let versaoInstalacaoReal = null
  if (process.platform === 'win32') {
    try {
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const run = promisify(execFile)
      const ps = "Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*LouvorJA*' } | Select-Object -First 1 DisplayName,DisplayVersion | ConvertTo-Json"
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 8_000 })
      const parsed = JSON.parse(stdout)
      versaoInstalacaoReal = parsed?.DisplayVersion ?? null
    } catch { versaoInstalacaoReal = null }
  }
  const headersTruncados = Object.entries(installation.headersEssenciais).some(([, v]) => v && typeof v === 'object' && 'bytes' in v && v.bytes < 512)
  const gpuBloqueada = Boolean(gpuFeatures && Object.values(gpuFeatures).some((s) => typeof s === 'string' && ['disabled', 'blocked', 'error'].includes(s.toLowerCase())))
  const extra = { storage, crashes, memoria, antivirus, dnsSuspeito, escritaUserData: installation.escritaUserData, headersTruncados, gpuBloqueada }
  const reproduction = await reproduceBootstrap(token)
  const report = {
    meta: { campanha: `${process.env.LOUVORJA_CAMPAIGN ?? 'SrCaldeira'}-v2`, versao: app.getVersion(), dataISO: new Date().toISOString(), dataLocal: new Date().toLocaleString('pt-BR', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), duracaoMs: elapsed(started), tokenMascarado: maskToken(token) },
    ambiente: { os: process.platform, osRelease: os.release(), arch: process.arch, electron: process.versions.electron, chrome: process.versions.chrome, locale: app.getLocale(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, online: general['1.1.1.1:443'].ok || general['google.com:443'].ok },
    rede: { proxy: { resolveProxyPorOrigem: proxy, env: sanitizeProxyEnv(process.env) }, hostsOverrides, conectividadeGeral: general, apis, reproducaoBootstrap: reproduction, mediaReal: mediaProbe, dnsSuspeito },
    instalacaoReal: installation,
    triage: { storage, crashes, memoria, discoLivreMb, antivirus, logs, gpuFeatures, monitores: monitoresDetalhes(), versaoInstalacaoReal, rendererErrors, downloadFailures },
    telemetria: telemetrySnapshot(),
    controleRemoto,
  }
  report.vereditoHeuristico = verdictWithRemote({ general, apis, proxy, hosts: hostsOverrides, installation, extra, controleRemoto })
  const timestamp = report.meta.dataISO.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const dir = outputDirectory()
  const jsonPath = path.join(dir, `louvorja-diagnostico-${timestamp}.json`)
  const txtPath = path.join(dir, `louvorja-diagnostico-${timestamp}.txt`)
  report.meta.arquivoJson = jsonPath
  const json = serializeReportWithinBudget(report)
  writeFileSync(jsonPath, json, 'utf8')
  writeFileSync(txtPath, reportTextWithPalco(report), 'utf8')
  return { report, json, jsonPath, txtPath }
}

export function resolveDiagnosticsDsn({ resourcesPath, appPath, isPackaged }) {
  const fromEnv = process.env.DIAGNOSTICS_GLITCHTIP_DSN
  if (fromEnv) return fromEnv
  const fromBundle = (() => {
    if (!resourcesPath) return ''
    try { return readFileSync(path.join(resourcesPath, 'diagnostics-dsn.txt'), 'utf8').trim() } catch { return '' }
  })()
  if (fromBundle) return fromBundle
  if (!isPackaged && appPath) {
    try { return readFileSync(path.join(appPath, 'build', 'diagnostics-dsn.txt'), 'utf8').trim() } catch { return '' }
  }
  return ''
}

function currentDiagnosticsDsn() {
  if (process.env.DIAGNOSTICS_GLITCHTIP_DSN) return process.env.DIAGNOSTICS_GLITCHTIP_DSN
  const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : ''
  return resolveDiagnosticsDsn({
    resourcesPath: process.resourcesPath,
    appPath,
    isPackaged: app.isPackaged === true,
  })
}

export function registerDiagnosticsIpc() {
  ipcMain.on('diagnostics:renderer-errors', (_event, snapshot) => {
    rendererErrors = sanitizeRendererErrors(snapshot)
  })
  ipcMain.on('diagnostics:download-failures', (_event, snapshot) => {
    downloadFailures = sanitizeDownloadFailures(snapshot)
  })
  ipcMain.on('diagnostics:audio-devices', (_event, snapshot) => {
    audioDevices = sanitizeAudioDevices(snapshot)
  })
  try {
    app.on('child-process-gone', (_event, details) => childGone.onGone(details))
    app.on('online', () => trackNetTransition('online'))
    app.on('offline', () => trackNetTransition('offline'))
  } catch { /* best-effort */ }
  ipcMain.handle('diagnostics:run', () => runDiagnostics())
  ipcMain.handle('diagnostics:open-folder', async (_event, filePath) => shell.showItemInFolder(String(filePath ?? '')))
  ipcMain.handle('diagnostics:send', async (_event, report) => {
    const dsn = currentDiagnosticsDsn()
    if (!dsn) return { ok: false, reason: 'DSN de diagnóstico não configurado; compartilhe o arquivo salvo.' }
    try {
      const url = new URL(dsn)
      const publicKey = decodeURIComponent(url.username)
      const projectId = url.pathname.replace(/^\//, '').replace(/\/$/, '')
      if (!publicKey || !projectId || url.protocol !== 'https:') {
        return { ok: false, reason: 'DSN malformado; compartilhe o arquivo salvo.' }
      }
      const storeUrl = `${url.origin}/api/${projectId}/store/`
      const campanha = report?.meta?.campanha ?? `${process.env.LOUVORJA_CAMPAIGN ?? 'SrCaldeira'}-v2`
      const event = {
        event_id: crypto.randomUUID().replace(/-/g, ''),
        timestamp: new Date().toISOString(),
        platform: 'javascript',
        environment: 'diagnostico',
        logger: 'louvorja-diagnostics',
        message: `Diagnóstico LouvorJA PIANO — campanha ${campanha}`,
        tags: { campanha, versao: String(report?.meta?.versao ?? app.getVersion()) },
        extra: { report },
      }
      const response = await fetch(storeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...clientHeaders(),
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=louvorja-diagnostics/1.0`,
        },
        body: JSON.stringify(event),
      })
      return response.ok ? { ok: true } : { ok: false, reason: `HTTP ${response.status}` }
    } catch (error) { return { ok: false, reason: rawError(error).classe } }
  })
}
