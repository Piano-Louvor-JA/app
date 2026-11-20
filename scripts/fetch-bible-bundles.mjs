#!/usr/bin/env node
/**
 * Bíblia offline no instalador (app .planning/bible-offline, Fase 3).
 *
 * Baixa da API os bundles de todas as versões (`GET /v1/bible/bundles` +
 * `/v1/bible/bundles/{id}`), confere o sha256 de cada um e grava em
 * `resources/bible/<versionId>.json.gz` + `manifest.json`. O electron-builder
 * empacota a pasta via `extraResources` (→ `resources/bible` no app).
 *
 * Roda como hook `beforePack` do electron-builder (cobre todos os workflows,
 * inclusive os que chamam `npx electron-builder` direto) e também por CLI:
 *   node scripts/fetch-bible-bundles.mjs
 *
 * Env:
 * - BIBLE_BUNDLE_API_URL: base da API (padrão: primária do perfil de build;
 *   produção só em perfil release).
 * - BIBLE_BUNDLES_REQUIRED=1|0: falhar se faltar versão (padrão: só release).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

import { isProductionUrl, isReleaseProfile, resolveBuildProfile, resolveEffectiveApi } from '../electron/profile.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_OUT_DIR = path.join(ROOT, 'resources', 'bible')
const MANIFEST_FILE = 'manifest.json'
const BUNDLE_FILE_RE = /^(\d+)\.json\.gz$/

/** @param {Record<string, string | undefined>} env */
export function resolveBibleBundleApi(env = process.env) {
  const explicit = env.BIBLE_BUNDLE_API_URL?.trim().replace(/\/+$/, '')
  if (explicit) {
    if (!isReleaseProfile(resolveBuildProfile(env)) && isProductionUrl(explicit)) {
      throw new Error('[bible-bundles] BIBLE_BUNDLE_API_URL de produção é proibida fora do perfil release.')
    }
    return explicit
  }
  return resolveEffectiveApi(env).primary
}

/** @param {Record<string, string | undefined>} env */
export function isBibleBundleRequired(env = process.env) {
  const flag = env.BIBLE_BUNDLES_REQUIRED?.trim()
  if (flag === '1' || flag === 'true') return true
  if (flag === '0' || flag === 'false') return false
  return isReleaseProfile(resolveBuildProfile(env))
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function readLocalManifest(outDir) {
  try {
    const data = JSON.parse(readFileSync(path.join(outDir, MANIFEST_FILE), 'utf8'))
    return Array.isArray(data?.versions) ? data.versions : []
  } catch {
    return []
  }
}

function localBundleSha(outDir, versionId) {
  try {
    return sha256(gunzipSync(readFileSync(path.join(outDir, `${versionId}.json.gz`))))
  } catch {
    return null
  }
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

function writeManifest(outDir, versions) {
  const manifest = { schema: 1, generatedAt: new Date().toISOString(), versions }
  writeAtomic(path.join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`)
}

function manifestEntry(remote, bytes) {
  return {
    versionId: remote.versionId,
    language: remote.language,
    name: remote.name,
    abbreviation: remote.abbreviation,
    sha256: remote.sha256,
    bytes,
  }
}

/**
 * @param {{
 *   apiBase: string,
 *   outDir?: string,
 *   required: boolean,
 *   fetchImpl?: typeof fetch,
 *   logger?: { log: (...a: unknown[]) => void, warn: (...a: unknown[]) => void },
 *   clientVersion?: string,
 * }} options
 */
export async function fetchBibleBundles({
  apiBase,
  outDir = DEFAULT_OUT_DIR,
  required,
  fetchImpl = fetch,
  logger = console,
  clientVersion = '',
}) {
  mkdirSync(outDir, { recursive: true })
  const headers = {
    'X-Client-Platform': 'desktop-build',
    ...(clientVersion ? { 'X-Client-Version': clientVersion } : {}),
  }

  let remote
  try {
    const res = await fetchImpl(`${apiBase}/v1/bible/bundles`, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (body?.schema !== 1 || !Array.isArray(body.versions)) throw new Error('formato inesperado')
    remote = body.versions
  } catch (error) {
    const message = `[bible-bundles] manifesto indisponível em ${apiBase}: ${error instanceof Error ? error.message : error}`
    if (required) throw new Error(message)
    const kept = readLocalManifest(outDir).filter(({ versionId }) => existsSync(path.join(outDir, `${versionId}.json.gz`)))
    logger.warn(`${message} — seguindo com ${kept.length} versão(ões) já baixada(s); o app busca o resto sob demanda.`)
    writeManifest(outDir, kept)
    return { versions: kept.length, downloaded: 0, reused: kept.length, skipped: [] }
  }

  const incomplete = remote.filter((v) => !v.complete || !v.sha256)
  if (required && incomplete.length > 0) {
    throw new Error(
      `[bible-bundles] versões com cache incompleto na API: ${incomplete.map((v) => `${v.versionId} (faltam ${v.missing})`).join(', ')}`,
    )
  }
  for (const v of incomplete) logger.warn(`[bible-bundles] versão ${v.versionId} incompleta na API (faltam ${v.missing}) — fora do instalador`)

  const complete = remote.filter((v) => v.complete && v.sha256)
  if (required && complete.length === 0) {
    throw new Error('[bible-bundles] a API não tem nenhuma versão completa da Bíblia')
  }

  const entries = []
  let downloaded = 0
  let reused = 0
  for (const version of complete) {
    const file = path.join(outDir, `${version.versionId}.json.gz`)
    if (localBundleSha(outDir, version.versionId) === version.sha256) {
      entries.push(manifestEntry(version, version.bytes))
      reused += 1
      continue
    }

    const res = await fetchImpl(`${apiBase}/v1/bible/bundles/${version.versionId}`, {
      headers: { ...headers, 'Accept-Encoding': 'gzip' },
    })
    if (!res.ok) throw new Error(`[bible-bundles] versão ${version.versionId}: HTTP ${res.status}`)
    // fetch já descompacta o Content-Encoding: estes são os bytes do JSON.
    const bytes = Buffer.from(await res.arrayBuffer())
    const actual = sha256(bytes)
    if (actual !== version.sha256) {
      throw new Error(`[bible-bundles] versão ${version.versionId}: sha256 ${actual} difere do manifesto ${version.sha256}`)
    }
    writeAtomic(file, gzipSync(bytes, { level: 9 }))
    entries.push(manifestEntry(version, bytes.length))
    downloaded += 1
    logger.log(`[bible-bundles] versão ${version.versionId} (${version.abbreviation}) baixada: ${bytes.length} bytes`)
  }

  const keep = new Set(entries.map((e) => String(e.versionId)))
  for (const name of readdirSync(outDir)) {
    const match = BUNDLE_FILE_RE.exec(name)
    if (match && !keep.has(match[1])) rmSync(path.join(outDir, name), { force: true })
  }

  writeManifest(outDir, entries)
  const skipped = incomplete.map((v) => v.versionId)
  logger.log(`[bible-bundles] ${entries.length} versão(ões) prontas (${downloaded} baixadas, ${reused} reaproveitadas)`)
  return { versions: entries.length, downloaded, reused, skipped }
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version ?? ''
  } catch {
    return ''
  }
}

/** Uma execução por processo: beforePack roda uma vez por arch/target. */
let pending = null
export function prepareBibleBundles(env = process.env) {
  pending ??= fetchBibleBundles({
    apiBase: resolveBibleBundleApi(env),
    required: isBibleBundleRequired(env),
    clientVersion: packageVersion(),
  })
  return pending
}

/** Hook `beforePack` do electron-builder. */
export async function beforePack() {
  await prepareBibleBundles()
}

export default beforePack

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareBibleBundles().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
