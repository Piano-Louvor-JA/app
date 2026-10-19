import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { app, net } from 'electron'

import { getBibleStore, getBundledBibleDir, getDownloadedBibleDir } from './bible-store.mjs'
import { API_BASE_URL } from './constants.mjs'

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const MANIFEST_FILE = 'manifest.json'
const STATE_FILE = 'state.json'

/**
 * @typedef {{ versionId: number, sha256: string, bytes?: number, language?: string, name?: string, abbreviation?: string }} LocalEntry
 * @typedef {{ status: 'skipped' | 'up-to-date' | 'updated' | 'error', updated: number[], failed: number[] }} CheckResult
 */

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

/** @returns {Map<number, LocalEntry>} */
function readManifest(dir) {
  const data = readJson(path.join(dir, MANIFEST_FILE))
  const map = new Map()
  for (const entry of Array.isArray(data?.versions) ? data.versions : []) {
    if (Number.isInteger(entry?.versionId) && typeof entry.sha256 === 'string') {
      map.set(entry.versionId, entry)
    }
  }
  return map
}

/**
 * Bíblia offline (Fase 4): compara o manifesto da API com o que está no disco
 * (bundle baixado em userData, senão o do instalador) e baixa só as versões
 * com sha256 diferente. Falha de rede nunca afeta a leitura: o arquivo novo
 * só substitui o antigo depois de conferido.
 *
 * @param {{
 *   getApiBase: () => string,
 *   downloadDir: string,
 *   bundledDir: string,
 *   store: { invalidate: (versionId?: number) => void },
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   clientVersion?: string,
 *   intervalMs?: number,
 * }} options
 */
export function createBibleUpdater({
  getApiBase,
  downloadDir,
  bundledDir,
  store,
  fetchImpl = fetch,
  now = Date.now,
  clientVersion = '',
  intervalMs = CHECK_INTERVAL_MS,
}) {
  /** @type {Promise<CheckResult> | null} */
  let inFlight = null
  const headers = {
    'X-Client-Platform': 'desktop',
    ...(clientVersion ? { 'X-Client-Version': clientVersion } : {}),
  }

  function writeDownloadedManifest(entries) {
    const versions = [...entries.values()].sort((a, b) => a.versionId - b.versionId)
    writeAtomic(
      path.join(downloadDir, MANIFEST_FILE),
      `${JSON.stringify({ schema: 1, versions }, null, 2)}\n`,
    )
  }

  /** sha256 do bundle baixado, só se o arquivo estiver íntegro. */
  function downloadedSha(versionId, entry) {
    if (!entry) return null
    try {
      const actual = sha256(gunzipSync(readFileSync(path.join(downloadDir, `${versionId}.json.gz`))))
      return actual === entry.sha256 ? actual : null
    } catch {
      return null
    }
  }

  async function download(apiBase, remote) {
    const res = await fetchImpl(`${apiBase}/v1/bible/bundles/${remote.versionId}`, {
      headers: { ...headers, 'Accept-Encoding': 'gzip' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // fetch já descompacta o Content-Encoding: bytes do JSON servido.
    const bytes = Buffer.from(await res.arrayBuffer())
    if (sha256(bytes) !== remote.sha256) throw new Error('sha256 não confere')
    writeAtomic(path.join(downloadDir, `${remote.versionId}.json.gz`), gzipSync(bytes, { level: 9 }))
    return bytes.length
  }

  /** @returns {Promise<CheckResult>} */
  async function run(force) {
    const statePath = path.join(downloadDir, STATE_FILE)
    const lastCheck = Number(readJson(statePath)?.checkedAt) || 0
    if (!force && now() - lastCheck < intervalMs) {
      return { status: 'skipped', updated: [], failed: [] }
    }

    const apiBase = getApiBase().replace(/\/+$/, '')
    let remote
    try {
      const res = await fetchImpl(`${apiBase}/v1/bible/bundles`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (body?.schema !== 1 || !Array.isArray(body.versions)) throw new Error('formato inesperado')
      remote = body.versions.filter((v) => v?.complete && typeof v.sha256 === 'string' && Number.isInteger(v.versionId))
    } catch (error) {
      console.warn('[bible-updater] manifesto indisponível', error instanceof Error ? error.message : error)
      return { status: 'error', updated: [], failed: [] }
    }

    mkdirSync(downloadDir, { recursive: true })
    const downloaded = readManifest(downloadDir)
    const bundled = readManifest(bundledDir)
    const updated = []
    const failed = []

    for (const version of remote) {
      const id = version.versionId
      if (downloadedSha(id, downloaded.get(id)) === version.sha256) continue

      if (bundled.get(id)?.sha256 === version.sha256) {
        // Instalador já tem o conteúdo atual: bundle baixado antigo sai.
        if (downloaded.has(id) || existsSync(path.join(downloadDir, `${id}.json.gz`))) {
          rmSync(path.join(downloadDir, `${id}.json.gz`), { force: true })
          downloaded.delete(id)
          writeDownloadedManifest(downloaded)
          store.invalidate(id)
        }
        continue
      }

      try {
        const bytes = await download(apiBase, version)
        downloaded.set(id, {
          versionId: id,
          language: version.language,
          name: version.name,
          abbreviation: version.abbreviation,
          sha256: version.sha256,
          bytes,
        })
        writeDownloadedManifest(downloaded)
        store.invalidate(id)
        updated.push(id)
      } catch (error) {
        console.warn(`[bible-updater] versão ${id} não atualizada`, error instanceof Error ? error.message : error)
        failed.push(id)
      }
    }

    if (failed.length > 0) return { status: 'error', updated, failed }
    writeAtomic(statePath, JSON.stringify({ checkedAt: now() }))
    return { status: updated.length > 0 ? 'updated' : 'up-to-date', updated, failed }
  }

  return {
    /** @param {{ force?: boolean }} [options] */
    check({ force = false } = {}) {
      inFlight ??= run(force).finally(() => {
        inFlight = null
      })
      return inFlight
    },
  }
}

/** @type {ReturnType<typeof createBibleUpdater> | null} */
let defaultUpdater = null

export function getBibleUpdater() {
  defaultUpdater ??= createBibleUpdater({
    getApiBase: () => API_BASE_URL,
    downloadDir: getDownloadedBibleDir(),
    bundledDir: getBundledBibleDir(),
    store: getBibleStore(),
    // net.fetch respeita o proxy do sistema (redes de igreja/empresa).
    fetchImpl: (url, init) => net.fetch(url, init),
    clientVersion: app.getVersion(),
  })
  return defaultUpdater
}
