// diagnostics:* — build de diagnóstico SrCaldeira.
// Rede fica no main process: Chromium/Electron fornece proxy do sistema; renderer
// recebe apenas dados serializáveis. O serviço nunca escreve em LouvorJA-PIANO.

import crypto from 'node:crypto'
import { existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { app, ipcMain, session, shell, screen } from 'electron'
import { API_HOSTS, ESSENTIAL_FILES, TIMEOUT_MS, computeVerdict, dnsProbe, elapsed, folderSize, generalProbes, httpProbe, maskToken, rawError, readHostsOverrides, reproduceBootstrap, reportText, sanitizeProxyEnv, socketProbe, tlsConnectStrict } from './diagnostics-core.mjs'
import { collectLogs, crashHistory, diskFreeMb, dnsSanity, essentialHeaders, memorySnapshot, storageHealth, userDataWriteProbe, windowsAntivirus } from './diagnostics-v2-collectors.mjs'

let diagnosticToken = ''
export function setDiagnosticsToken(token) {
  diagnosticToken = typeof token === 'string' ? token : ''
}
function monitoresAbertos() {
  try { return screen.getAllDisplays().length } catch { return null }
}

function inspectRealInstallation() {
  // getPath('appData') é o AppData real em qualquer SO (%APPDATA% no Windows,
  // ~/.config no Linux) — independe do userData do app rodando (portable/dev).
  const appData = app.getPath('appData')
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
    headersEssenciais: essentialHeaders(sysdata, ESSENTIAL_FILES),
    escritaUserData: userDataWriteProbe(root),
  }
}

/**
 * GET de mídia REAL (endpoint /file/, host de arquivos): primeiros ~64KB de um
 * arquivo conhecido, buffer em memória — nada é salvo no disco do usuário.
 * Diferencia "API JSON ok mas CDN de arquivos bloqueada".
 */
async function mediaFileProbe(host, token) {
  const url = `https://${host}/file/pt_categories`
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { ...(token ? { 'Api-Token': token } : {}), Range: 'bytes=0-65535', 'X-Client-Platform': 'desktop', 'X-Client-Version': app.getVersion() },
      signal: controller.signal,
    })
    const body = await response.arrayBuffer()
    const result = { url, status: response.status, ok: response.ok, bytes: body.byteLength, ms: elapsed(start), erro: null }
    if (!response.ok) {
      const classe = response.status === 403 ? 'HTTP_403' : response.status === 404 ? 'HTTP_404' : response.status === 429 ? 'HTTP_429' : response.status >= 500 ? 'HTTP_5XX' : 'OTHER'
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
  // v2 — probe de mídia real no host de arquivos (mesmo host do primeiro API ok).
  const mediaHost = API_HOSTS[0]
  const mediaProbe = await mediaFileProbe(mediaHost, token)
  // v2 — triage geral: storage, crashes, RAM, disco, AV, logs, DNS sanity, GPU.
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
  // Windows: registry uninstall (leitura); outros SOs: markers conhecidos.
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
  // headers truncados: essencial existe mas < 512 bytes (página de bloqueio/HTML ou truncado).
  const headersTruncados = Object.entries(installation.headersEssenciais).some(([, v]) => v && typeof v === 'object' && 'bytes' in v && v.bytes < 512)
  const gpuBloqueada = Boolean(gpuFeatures && Object.values(gpuFeatures).some((s) => typeof s === 'string' && ['disabled', 'blocked', 'error'].includes(s.toLowerCase())))
  const extra = { storage, crashes, memoria, antivirus, dnsSuspeito, escritaUserData: installation.escritaUserData, headersTruncados, gpuBloqueada }
  const reproduction = await reproduceBootstrap(token)
  const report = {
    meta: { campanha: 'SrCaldeira', versao: app.getVersion(), dataISO: new Date().toISOString(), dataLocal: new Date().toLocaleString('pt-BR', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), duracaoMs: elapsed(started), tokenMascarado: maskToken(token) },
    ambiente: { os: process.platform, osRelease: os.release(), arch: process.arch, electron: process.versions.electron, chrome: process.versions.chrome, locale: app.getLocale(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, online: general['1.1.1.1:443'].ok || general['google.com:443'].ok },
    rede: { proxy: { resolveProxyPorOrigem: proxy, env: sanitizeProxyEnv(process.env) }, hostsOverrides, conectividadeGeral: general, apis, reproducaoBootstrap: reproduction, mediaReal: mediaProbe, dnsSuspeito },
    instalacaoReal: installation,
    triage: { storage, crashes, memoria, discoLivreMb, antivirus, logs, gpuFeatures, monitores: monitoresAbertos(), versaoInstalacaoReal },
  }
  report.vereditoHeuristico = computeVerdict({ general, apis, proxy, hosts: hostsOverrides, installation, extra })
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
  // DSN Sentry/Glitchtip via build secret. Sem DSN, falha deliberada com
  // fallback local; o botão nunca bloqueia o arquivo já salvo.
  ipcMain.handle('diagnostics:send', async (_event, report) => {
    const dsn = process.env.DIAGNOSTICS_GLITCHTIP_DSN
    if (!dsn) return { ok: false, reason: 'DSN de diagnóstico não configurado; compartilhe o arquivo salvo.' }
    try {
      // DSN Sentry: https://<public_key>@<host>/<project_id>
      const parsed = new URL(dsn)
      const publicKey = decodeURIComponent(parsed.username)
      const projectId = parsed.pathname.replace(/\//g, '')
      if (!publicKey || !projectId) return { ok: false, reason: 'DSN malformado; compartilhe o arquivo salvo.' }
      const storeUrl = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`
      const event = {
        event_id: crypto.randomUUID().replace(/-/g, ''),
        timestamp: new Date().toISOString(),
        platform: 'javascript',
        environment: 'diagnostico',
        message: `Diagnóstico LouvorJA PIANO — campanha ${report?.meta?.campanha ?? 'indefinida'}`,
        tags: { campanha: String(report?.meta?.campanha ?? 'indefinida'), versao: String(report?.meta?.versao ?? '') },
        extra: { report },
      }
      const response = await fetch(storeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'desktop',
          'X-Client-Version': app.getVersion(),
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=louvorja-diagnostics/1.0`,
        },
        body: JSON.stringify(event),
      })
      return response.ok ? { ok: true } : { ok: false, reason: `HTTP ${response.status}` }
    } catch (error) { return { ok: false, reason: rawError(error).classe } }
  })
}
