// diagnostics-v2:* — coletas adicionais de triage geral (SOMENTE LEITURA).
// Cada função é isolada: falha de uma não derruba o relatório (caller usa safe()).
// Nunca descriptografa conteúdo de usuário; headers de essenciais = 64 bytes hex.
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { homedir, totalmem, freemem } from 'node:os'
import path from 'node:path'

const CRASH_PREVIEW_BYTES = 20_000
const HEADER_PREVIEW_BYTES = 64
const LOG_BUDGET_BYTES = 20_000
const LOG_TAIL_LINES = 100
const LOCAL_STORAGE_SUSPECT_BYTES = 500 * 1024 * 1024

/** Roda fn e transforma qualquer exceção no valor de erro informado. */
export async function safe(fn, errorValue) {
  try {
    return await fn()
  } catch {
    return errorValue
  }
}

/** Espaço livre do volume que contém dir, em MB. null se statfs indisponível. */
export async function diskFreeMb(dir) {
  return safe(async () => {
    const { statfs } = await import('node:fs/promises')
    const stats = await statfs(dir)
    return Math.round((stats.bavail * stats.bsize) / 1024 / 1024)
  }, null)
}

/**
 * Header dos essenciais do catálogo (primeiros 64 bytes em hex) — detecta
 * arquivo truncado ou página HTML de proxy/bloqueio gravada como binário.
 * NÃO descriptografa conteúdo: só o header bruto dos essenciais.
 */
export function essentialHeaders(sysdataDir, essentialNames) {
  const out = {}
  for (const name of essentialNames) {
    const file = path.join(sysdataDir, `${name}.bin`)
    try {
      if (!existsSync(file)) { out[name] = null; continue }
      const fd = readFileSync(file)
      const head = fd.subarray(0, Math.min(HEADER_PREVIEW_BYTES, fd.length))
      out[name] = { bytes: fd.length, head: head.toString('hex') }
    } catch {
      out[name] = { erro: 'leitura-falhou' }
    }
  }
  return out
}

/** Escrita REAL no userData do app (nunca cria o diretório). */
export function userDataWriteProbe(userDataDir) {
  if (!existsSync(userDataDir)) return { aplicavel: false, ok: null }
  const temp = path.join(userDataDir, `.diag-write-${process.pid}.tmp`)
  try {
    writeFileSync(temp, 'ok')
    unlinkSync(temp)
    return { aplicavel: true, ok: true }
  } catch {
    return { aplicavel: true, ok: false }
  }
}

/** Antivírus registrado no Windows Security Center (nome + productState). */
export function windowsAntivirus() {
  if (process.platform !== 'win32') return null
  return safe(() => new Promise((resolve) => {
    const args = ['/namespace:\\\\root\\SecurityCenter2', 'path', 'AntiVirusProduct', 'get', 'displayName,productState', '/format:list']
    execFile('wmic', args, { timeout: 8_000 }, (error, stdout) => {
      if (error && !stdout) {
        // fallback PowerShell
        const ps = 'Get-CimInstance -Namespace root/SecurityCenter2 -Class AntiVirusProduct | Select-Object displayName,productState | ConvertTo-Json'
        execFile('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 8_000 }, (err2, out2) => {
          resolve(err2 && !out2 ? null : parseAv(out2 ?? ''))
        })
        return
      }
      resolve(parseAv(stdout ?? ''))
    })
  }), null)
}

function parseAv(text) {
  const products = []
  const blocks = String(text).split(/(?:\r?\n\r?\n|},{)/)
  for (const block of blocks) {
    const name = block.match(/displayName["\s:=]+([^\r\n"}]+)/i)?.[1]?.trim()
    const state = block.match(/productState["\s:=]+(\d+)/i)?.[1]
    if (name) products.push({ nome: name, productState: state ? Number(state) : null })
  }
  return products.length ? products : (text.trim() ? [{ nome: 'desconhecido', productState: null, bruto: text.slice(0, 200) }] : null)
}

/** Crashes do Crashpad: contagem, últimos 5, preview sanitizado do mais recente. */
export function crashHistory(userDataDir) {
  const crashDir = path.join(userDataDir, 'Crashpad', 'reports')
  const pendingDir = path.join(userDataDir, 'Crashpad', 'pending')
  try {
    const collect = (dir) => (existsSync(dir) ? readdirSync(dir).map((name) => ({ name, dir })) : [])
    const files = [...collect(crashDir), ...collect(pendingDir)]
    if (!files.length) return { total: 0, recentes: [], preview: null }
    const stats = files
      .map((f) => {
        const full = path.join(f.dir, f.name)
        try { return { full, mtime: statSync(full).mtimeMs } } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
    const newest = stats[0]
    let preview = null
    try {
      const chunk = readFileSync(newest.full).subarray(0, CRASH_PREVIEW_BYTES)
      preview = chunk.toString('utf8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ').slice(0, 2000)
    } catch { /* preview fica null */ }
    return {
      total: stats.length,
      recentes: stats.slice(0, 5).map((s) => ({ arquivo: path.basename(s.full), mtime: new Date(s.mtime).toISOString() })),
      preview,
    }
  } catch {
    return { total: 0, recentes: [], preview: null }
  }
}

/** Tamanhos dos stores do Chromium no userData (Local Storage, IndexedDB…). */
export function storageHealth(userDataDir) {
  try {
    if (!existsSync(userDataDir)) return null
    const storeSize = (rel) => {
      const dir = path.join(userDataDir, rel)
      if (!existsSync(dir)) return null
      let total = 0
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        try {
          total += entry.isDirectory() ? storageSizeDir(full) : statSync(full).size
        } catch { /* arquivo sumido durante leitura: ignora */ }
      }
      return total
    }
    const localStorageBytes = storeSize('Local Storage')
    const ldbDir = path.join(userDataDir, 'Local Storage', 'leveldb')
    const ldbVazio = (() => {
      try {
        return existsSync(ldbDir) && readdirSync(ldbDir).some((f) => f.endsWith('.ldb') && statSync(path.join(ldbDir, f)).size === 0)
      } catch { return false }
    })()
    const singleton = path.join(userDataDir, 'SingletonLock')
    let lockOrfao = false
    try {
      if (existsSync(singleton)) {
        const target = readFileSync(singleton, 'utf8')
        const m = target.match(/(\d+)$/)
        lockOrfao = Boolean(m && Number(m[1]) > 0 && !existsSync(`/proc/${m[1]}`))
      }
    } catch { /* mantém false */ }
    return {
      localStorageBytes,
      indexedDbBytes: storeSize('IndexedDB'),
      sessionStorageBytes: storeSize('Session Storage'),
      cacheBytes: storeSize('Cache') ?? 0,
      localStorageSuspeito: localStorageBytes !== null && localStorageBytes > LOCAL_STORAGE_SUSPECT_BYTES,
      ldbVazio,
      lockOrfao,
    }
  } catch {
    return null
  }
}

function storageSizeDir(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    try {
      total += entry.isDirectory() ? storageSizeDir(full) : statSync(full).size
    } catch { /* arquivo sumido durante leitura: ignora */ }
  }
  return total
}

/** RAM do sistema + uso do processo. */
export function memorySnapshot() {
  return {
    totalMb: Math.round(totalmem() / 1024 / 1024),
    livreMb: Math.round(freemem() / 1024 / 1024),
    processoRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  }
}

/**
 * Heurística de DNS suspeito: mesmo IP em hosts distintos (rebind/parking) ou
 * IP fora das faixas esperadas (Cloudflare para workers.dev). Sinaliza, não conclui.
 */
export function dnsSanity(apis) {
  const ipOwners = new Map()
  for (const api of apis) {
    if (!api.dns?.ok) continue
    for (const ip of api.dns.ips) {
      ipOwners.set(ip, [...(ipOwners.get(ip) ?? []), api.host])
    }
  }
  return apis.map((api) => {
    if (!api.dns?.ok) return { host: api.host, dnsSuspeito: null, motivo: 'DNS não resolveu' }
    const ips = api.dns.ips
    const duplicado = ips.find((ip) => (ipOwners.get(ip) ?? []).some((h) => h !== api.host))
    if (duplicado) return { host: api.host, dnsSuspeito: true, motivo: `IP ${duplicado} compartilhado com outro domínio (possível rebind/parking)` }
    const cloudflare = ips.some((ip) => /^104\.(1[6-9]|2[0-9]|3[01])\./.test(ip) || /^172\.6[4-9]\./.test(ip) || /^172\.[7-9]\d\./.test(ip) || /^172\.1[0-1]\./.test(ip))
    const workersDev = api.host.includes('workers.dev')
    if (workersDev && !cloudflare) return { host: api.host, dnsSuspeito: true, motivo: `workers.dev fora de faixa Cloudflare: ${ips.join(', ')}` }
    return { host: api.host, dnsSuspeito: false, motivo: `IPs ${ips.join(', ')}` }
  })
}

/**
 * Logs do app: últimas ~100 linhas de cada *.log em userData, orçamento 20KB,
 * tokens mascarados. null se não existir log algum (em si é informação).
 */
export function collectLogs(userDataDir, maskTokenValue) {
  try {
    if (!existsSync(userDataDir)) return null
    const logDirs = [userDataDir, path.join(userDataDir, 'logs')]
    const found = []
    for (const dir of logDirs) {
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.log')) continue
        const full = path.join(dir, name)
        try {
          if (!statSync(full).isFile()) continue
          found.push({ full, size: statSync(full).size })
        } catch { /* skip */ }
      }
    }
    if (!found.length) return null
    let budget = LOG_BUDGET_BYTES
    const out = []
    for (const log of found) {
      if (budget <= 0) break
      const text = readFileSync(log.full, 'utf8')
      const tail = text.split(/\r?\n/).slice(-LOG_TAIL_LINES).join('\n')
      const cut = tail.slice(-Math.min(budget, LOG_BUDGET_BYTES))
      budget -= cut.length
      out.push({ arquivo: path.basename(log.full), bytesTotais: log.size, linhas: LOG_TAIL_LINES, conteudo: sanitizeLog(cut, maskTokenValue) })
    }
    return out
  } catch {
    return null
  }
}

function sanitizeLog(text, token) {
  let out = text
  if (token && token.length > 8) out = out.replaceAll(token, '***MASKED***')
  out = out.replace(/(Api-Token["\s:=]+)([A-Za-z0-9._-]{8,})/gi, '$1***MASKED***')
  out = out.replace(/(Bearer\s+)([A-Za-z0-9._-]{8,})/gi, '$1***MASKED***')
  return out
}
