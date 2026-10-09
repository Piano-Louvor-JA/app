// diagnostics:* — build de diagnóstico SrCaldeira.
// Rede fica no main process: Chromium/Electron fornece proxy do sistema; renderer
// recebe apenas dados serializáveis. O serviço nunca escreve em LouvorJA-PIANO.
// Lógica pura/testável em electron/diagnostics-core.mjs.

import crypto from 'node:crypto'
import net from 'node:net'
import { existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, ipcMain, session, shell } from 'electron'

import {
  API_HOSTS,
  ESSENTIAL_FILES,
  computeVerdict,
  dnsProbe,
  elapsed,
  folderSize,
  generalProbes,
  httpProbe,
  maskToken,
  rawError,
  readHostsOverrides,
  reproduceBootstrap,
  reportText,
  sanitizeProxyEnv,
  socketProbe,
  tlsConnectStrict,
} from './diagnostics-core.mjs'

let diagnosticToken = ''

/**
 * Token de diagnóstico vem do main (setDiagnosticsToken), NUNCA de
 * process.env.VITE_API_TOKEN — `VITE_*` é config de build do renderer e não
 * existe no processo principal do portable. Sem token, sondas seguem sem o
 * header (comportamento reportado como `token: ausente`).
 */
export function setDiagnosticsToken(token) {
  diagnosticToken = typeof token === 'string' ? token : ''
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
  // Reprodução REAL: config → pt_categories na mesma cascata, um passo por endpoint.
  const reproduction = await reproduceBootstrap(token)
  const report = {
    meta: { campanha: 'SrCaldeira', versao: app.getVersion(), dataISO: new Date().toISOString(), duracaoMs: elapsed(started), tokenMascarado: maskToken(token) },
    ambiente: { os: process.platform, osRelease: os.release(), arch: process.arch, electron: process.versions.electron, chrome: process.versions.chrome, locale: app.getLocale(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, online: general['1.1.1.1:443'].ok || general['google.com:443'].ok },
    rede: { proxy: { resolveProxyPorOrigem: proxy, env: sanitizeProxyEnv(process.env) }, hostsOverrides, conectividadeGeral: general, apis, reproducaoBootstrap: reproduction },
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
      // DSN Sentry: https://<public_key>@<host>/<project_id> — NÃO é URL de POST.
      // Endpoint real de ingest: <origin>/api/<project>/store/ com X-Sentry-Auth.
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
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=louvorja-diagnostics/1.0`,
        },
        body: JSON.stringify(event),
      })
      return response.ok ? { ok: true } : { ok: false, reason: `HTTP ${response.status}` }
    } catch (error) { return { ok: false, reason: rawError(error).classe } }
  })
}
