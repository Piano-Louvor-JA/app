import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import {
  APP_USER_DATA_DIR,
  DB_DOWNLOAD_COMPLETE_FLAG,
  TEMP_DATABASE_FILE,
  WORKSPACE_DIRS,
} from './constants.mjs'

const require = createRequire(import.meta.url)
const yazl = require('yazl')
const yauzl = require('yauzl')

/** Pastas/arquivos do Chromium e marcas internas — não entram no backup. */
export const BACKUP_SKIP_NAMES = new Set([
  '.media-root',
  '.acl-users-modify',
  '.write-probe',
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'ShaderCache',
  'GrShaderCache',
  'Local Storage',
  'Session Storage',
  'IndexedDB',
  'Service Worker',
  'blob_storage',
  'Crashpad',
  'logs',
  'CachedData',
  'VideoDecodeStats',
  'Cookies',
  'Cookies-journal',
  'lockfile',
  'LOCK',
  'DevToolsActivePort',
  'Network',
  'Preferences',
  'Local State',
  'Shared Dictionary',
  'SharedStorage',
  'File System',
  'Partitions',
  'dictionaries',
  'QuotaManager',
  'QuotaManager-journal',
  'TransportSecurity',
  'Trust Tokens',
  'Trust Tokens-journal',
  'DIPS',
  'DIPS-journal',
  'Network Persistent State',
  'Reporting and NEL',
  'SingletonCookie',
  'SingletonLock',
  'SingletonSocket',
])

/** Arquivos do app na raiz da pasta de dados (além de `.sysdata`, `Media` e `bible`). */
export const BACKUP_ROOT_FILES = new Set([
  'window-state.json',
  'palco-slots.json',
  TEMP_DATABASE_FILE,
  DB_DOWNLOAD_COMPLETE_FLAG,
])

/**
 * Nomes de pasta de mídia no disco → pasta padrão no zip (`Media/covers|music|images`).
 * Inclui aliases do legado e de caminhos apontados no meio da árvore.
 */
export const MEDIA_DIR_ALIASES = {
  covers: WORKSPACE_DIRS.covers,
  capas: WORKSPACE_DIRS.covers,
  music: WORKSPACE_DIRS.music,
  musics: WORKSPACE_DIRS.music,
  musicas: WORKSPACE_DIRS.music,
  images: WORKSPACE_DIRS.images,
  imagens: WORKSPACE_DIRS.images,
  slides: WORKSPACE_DIRS.images,
}

const SKIP_WALK_NAMES = new Set([...BACKUP_SKIP_NAMES, 'pptx-cache'])

/** Playlists + `user_data` (liturgia, agendados e preferências). */
export const BACKUP_LOCAL_STORAGE_KEYS = ['user_data', 'louvorja-playlists-v1']

/** Snapshot do localStorage no zip — Chromium Local Storage não entra no backup. */
export const BACKUP_LOCAL_STORAGE_ZIP_PATH = `${WORKSPACE_DIRS.sysdata}/local-storage.json`

/**
 * @param {Date} [now]
 * @param {string} [folderName]
 * @returns {string}
 */
export function buildBackupFileName(now = new Date(), folderName = APP_USER_DATA_DIR) {
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-')
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${folderName}_${stamp}_${time}.zip`
}

/**
 * @param {string} candidate
 * @param {string} root
 * @returns {boolean}
 */
export function isPathInsideRoot(candidate, root) {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const rel = path.relative(resolvedRoot, resolvedCandidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * @param {string} zipPath
 * @returns {string}
 */
export function toZipPath(zipPath) {
  return zipPath.replace(/\\/g, '/').replace(/^\/+/, '')
}

/**
 * Impede zip-slip (../ fora do destino).
 * @param {string} destRoot
 * @param {string} zipPath
 * @returns {string}
 */
export function resolveSafeExtractPath(destRoot, zipPath) {
  const relative = toZipPath(zipPath)
  if (!relative || relative.includes('\0')) {
    throw new Error('invalid-zip-path')
  }
  const parts = relative.split('/').filter((part) => part && part !== '.')
  if (parts.some((part) => part === '..')) {
    throw new Error('zip-slip')
  }
  const dest = path.resolve(destRoot, ...parts)
  if (!isPathInsideRoot(dest, destRoot)) {
    throw new Error('zip-slip')
  }
  return dest
}

/**
 * Se o zip veio com a pasta LouvorJA-PIANO na raiz, remove o prefixo.
 * @param {string} zipPath
 * @param {string} folderName
 * @returns {string}
 */
export function stripBackupRootPrefix(zipPath, folderName = APP_USER_DATA_DIR) {
  const normalized = toZipPath(zipPath)
  const prefix = `${folderName}/`
  if (normalized === folderName || normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length)
  }
  return normalized
}

/**
 * Normaliza o caminho no zip para a árvore padrão (`Media/covers|music|images`).
 * @param {string} zipPath
 * @returns {string}
 */
export function normalizeBackupZipPath(zipPath) {
  const relative = toZipPath(stripBackupRootPrefix(zipPath))
  const parts = relative.split('/').filter((part) => part && part !== '.')
  if (parts[0] === WORKSPACE_DIRS.media && parts[1]) {
    const mapped = MEDIA_DIR_ALIASES[parts[1].toLowerCase()]
    if (mapped) parts[1] = mapped
  }
  return parts.join('/')
}

/**
 * Só `.sysdata`, `Media`, `bible` e arquivos conhecidos do app — nunca o perfil Chromium.
 * @param {string} zipPath
 * @returns {boolean}
 */
export function isRestorableZipPath(zipPath) {
  const normalized = normalizeBackupZipPath(zipPath)
  if (!normalized) return false
  const [top] = normalized.split('/')
  if (
    top === WORKSPACE_DIRS.sysdata ||
    top === WORKSPACE_DIRS.media ||
    top === WORKSPACE_DIRS.bible
  ) {
    return true
  }
  return !normalized.includes('/') && BACKUP_ROOT_FILES.has(normalized)
}

/**
 * Se o caminho aponta para covers/music/images (ou alias), sobe para a pasta Media.
 * @param {string} mediaRoot
 * @returns {string}
 */
export function canonicalizeMediaRoot(mediaRoot) {
  const resolved = path.resolve(mediaRoot)
  const leaf = path.basename(resolved).toLowerCase()
  if (MEDIA_DIR_ALIASES[leaf]) return path.dirname(resolved)
  return resolved
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameDir(a, b) {
  const left = path.resolve(a)
  const right = path.resolve(b)
  if (process.platform === 'win32') return left.toLowerCase() === right.toLowerCase()
  return left === right
}

/**
 * @param {string} abs
 * @param {import('node:fs').Dirent} [dirent]
 * @returns {'dir' | 'file' | 'other'}
 */
function entryKind(abs, dirent) {
  try {
    const st = statSync(abs)
    if (st.isDirectory()) return 'dir'
    if (st.isFile()) return 'file'
    return 'other'
  } catch {
    if (dirent?.isDirectory()) return 'dir'
    if (dirent?.isFile()) return 'file'
    return 'other'
  }
}

/**
 * @param {{ source: string, zipPath: string }[]} entries
 * @param {Set<string>} seen
 * @param {string} source
 * @param {string} zipPath
 */
function pushEntry(entries, seen, source, zipPath) {
  const key = toZipPath(zipPath)
  if (!key || seen.has(key)) return
  seen.add(key)
  entries.push({ source, zipPath: key })
}

/**
 * @param {string} dir
 * @param {string} zipPrefix
 * @param {{ source: string, zipPath: string }[]} entries
 * @param {Set<string>} seen
 */
function walkFiles(dir, zipPrefix, entries, seen) {
  if (!existsSync(dir)) return

  let items
  try {
    items = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const item of items) {
    if (SKIP_WALK_NAMES.has(item.name)) continue
    const abs = path.join(dir, item.name)
    const kind = entryKind(abs, item)
    const zipPath = toZipPath(zipPrefix ? `${zipPrefix}/${item.name}` : item.name)
    if (kind === 'dir') {
      walkFiles(abs, zipPath, entries, seen)
      continue
    }
    if (kind !== 'file') continue
    pushEntry(entries, seen, abs, zipPath)
  }
}

/**
 * Recolhe covers/music/images (e aliases) de uma raiz de mídia para `Media/…`.
 * @param {string} mediaRoot
 * @param {{ source: string, zipPath: string }[]} entries
 * @param {Set<string>} seen
 */
function collectMediaTree(mediaRoot, entries, seen) {
  const root = canonicalizeMediaRoot(mediaRoot)
  if (!existsSync(root)) return

  for (const folder of [WORKSPACE_DIRS.covers, WORKSPACE_DIRS.music, WORKSPACE_DIRS.images]) {
    walkFiles(
      path.join(root, folder),
      `${WORKSPACE_DIRS.media}/${folder}`,
      entries,
      seen,
    )
  }

  // Mídias de módulos (ex.: áudio do sorteio em Media/modulos/sorteios).
  walkFiles(
    path.join(root, WORKSPACE_DIRS.modulos),
    `${WORKSPACE_DIRS.media}/${WORKSPACE_DIRS.modulos}`,
    entries,
    seen,
  )

  let items
  try {
    items = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const item of items) {
    const mapped = MEDIA_DIR_ALIASES[item.name.toLowerCase()]
    if (!mapped || item.name.toLowerCase() === mapped) continue
    const abs = path.join(root, item.name)
    if (entryKind(abs, item) !== 'dir') continue
    walkFiles(abs, `${WORKSPACE_DIRS.media}/${mapped}`, entries, seen)
  }
}

/**
 * Monta a lista de arquivos do backup.
 * Mídia em outro disco entra no zip na pasta padrão: Media/covers, Media/music, Media/images.
 *
 * @param {{
 *   dataRoot: string
 *   mediaRoot: string
 *   mediaFolders?: { covers: string, music: string, images: string }
 * }} opts
 * @returns {{ source: string, zipPath: string }[]}
 */
export function collectBackupEntries({ dataRoot, mediaRoot, mediaFolders }) {
  const entries = []
  const seen = new Set()
  const resolvedData = path.resolve(dataRoot)
  const resolvedMedia = path.resolve(mediaRoot)
  const defaultMedia = path.join(resolvedData, WORKSPACE_DIRS.media)

  walkFiles(path.join(resolvedData, WORKSPACE_DIRS.sysdata), WORKSPACE_DIRS.sysdata, entries, seen)
  // Bíblia atualizada pela API (o texto do instalador não precisa de backup).
  walkFiles(path.join(resolvedData, WORKSPACE_DIRS.bible), WORKSPACE_DIRS.bible, entries, seen)

  if (mediaFolders) {
    walkFiles(
      mediaFolders.covers,
      `${WORKSPACE_DIRS.media}/${WORKSPACE_DIRS.covers}`,
      entries,
      seen,
    )
    walkFiles(
      mediaFolders.music,
      `${WORKSPACE_DIRS.media}/${WORKSPACE_DIRS.music}`,
      entries,
      seen,
    )
    walkFiles(
      mediaFolders.images,
      `${WORKSPACE_DIRS.media}/${WORKSPACE_DIRS.images}`,
      entries,
      seen,
    )
  }

  collectMediaTree(resolvedMedia, entries, seen)

  if (!sameDir(canonicalizeMediaRoot(resolvedMedia), defaultMedia)) {
    collectMediaTree(defaultMedia, entries, seen)
  }

  if (existsSync(resolvedData)) {
    for (const name of BACKUP_ROOT_FILES) {
      const abs = path.join(resolvedData, name)
      try {
        if (existsSync(abs) && statSync(abs).isFile()) {
          pushEntry(entries, seen, abs, name)
        }
      } catch {
        /* ignore */
      }
    }
  }

  return entries
}

/**
 * @param {Record<string, string>} [browserStorage]
 * @param {string} tmpDir
 * @returns {{ source: string, zipPath: string } | null}
 */
export function writeBrowserStorageSnapshot(browserStorage, tmpDir) {
  if (!browserStorage || typeof browserStorage !== 'object') return null
  /** @type {Record<string, string>} */
  const snapshot = {}
  for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
    if (typeof browserStorage[key] === 'string') snapshot[key] = browserStorage[key]
  }
  if (Object.keys(snapshot).length === 0) return null
  mkdirSync(tmpDir, { recursive: true })
  const file = path.join(tmpDir, 'local-storage.json')
  writeFileSync(file, JSON.stringify(snapshot), 'utf8')
  return { source: file, zipPath: BACKUP_LOCAL_STORAGE_ZIP_PATH }
}

/**
 * @param {string} destRoot
 * @returns {Record<string, string> | null}
 */
export function readRestoredBrowserStorage(destRoot) {
  const file = path.join(destRoot, WORKSPACE_DIRS.sysdata, 'local-storage.json')
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    /** @type {Record<string, string>} */
    const snapshot = {}
    for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
      if (typeof parsed[key] === 'string') snapshot[key] = parsed[key]
    }
    return snapshot
  } catch {
    return null
  }
}

/**
 * @param {string[]} [keys]
 * @returns {string}
 */
export function buildLocalStorageSnapshotScript(keys = BACKUP_LOCAL_STORAGE_KEYS) {
  return `(() => {
    const keys = ${JSON.stringify(keys)};
    const out = {};
    for (const key of keys) {
      try {
        const value = localStorage.getItem(key);
        if (value != null) out[key] = value;
      } catch {}
    }
    return out;
  })()`
}

/**
 * @param {Record<string, string> | null} snapshot
 * @returns {string}
 */
export function buildLocalStorageRestoreScript(snapshot) {
  return `(() => {
    const keys = ${JSON.stringify(BACKUP_LOCAL_STORAGE_KEYS)};
    const data = ${JSON.stringify(snapshot && typeof snapshot === 'object' ? snapshot : {})};
    for (const key of keys) {
      try {
        if (Object.prototype.hasOwnProperty.call(data, key) && data[key] != null) {
          localStorage.setItem(key, String(data[key]));
        } else {
          localStorage.removeItem(key);
        }
      } catch {}
    }
    return true;
  })()`
}

/**
 * @param {{ source: string, zipPath: string }[]} entries
 * @param {string} destZip
 * @param {(payload: { current: number, total: number, zipPath: string }) => void} [onProgress]
 * @returns {Promise<void>}
 */
export function writeBackupZip(entries, destZip, onProgress) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(destZip), { recursive: true })
    const zipfile = new yazl.ZipFile()
    zipfile.on('error', reject)
    const output = createWriteStream(destZip)
    zipfile.outputStream.pipe(output)
    output.on('error', reject)
    zipfile.outputStream.on('error', reject)
    output.on('close', resolve)

    const total = entries.length
    entries.forEach((entry, index) => {
      zipfile.addFile(entry.source, entry.zipPath)
      onProgress?.({ current: index + 1, total, zipPath: entry.zipPath })
    })
    zipfile.end()
  })
}

/**
 * @param {string} target
 */
function removePathBestEffort(target) {
  try {
    rmSync(target, { recursive: true, force: true })
    return
  } catch {
    /* Windows: Explorer/Chromium podem manter o arquivo aberto. */
  }
  const tomb = `${target}.${process.pid}.old`
  try {
    rmSync(tomb, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  try {
    renameSync(target, tomb)
  } catch (error) {
    console.warn('[backup] não removeu arquivo em uso', target, error)
    return
  }
  try {
    rmSync(tomb, { recursive: true, force: true })
  } catch {
    /* leftover tomb some na próxima limpeza */
  }
}

/**
 * @param {string} dir
 */
export function emptyDirectoryContents(dir) {
  if (!existsSync(dir)) return
  let names
  try {
    names = readdirSync(dir)
  } catch (error) {
    console.warn('[backup] não listou pasta para esvaziar', dir, error)
    return
  }
  for (const name of names) {
    removePathBestEffort(path.join(dir, name))
  }
}

/**
 * Extrai o zip na pasta de dados padrão (Media/ → pasta padrão).
 *
 * @param {string} zipFile
 * @param {string} destRoot
 * @param {(payload: { current: number, total: number, zipPath: string }) => void} [onProgress]
 * @returns {Promise<void>}
 */
export function restoreBackupZip(zipFile, destRoot, onProgress) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true, autoClose: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(openError ?? new Error('zip-open-failed'))
        return
      }

      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        try {
          zipfile.close()
        } catch {
          /* ignore */
        }
        reject(error)
      }
      const succeed = () => {
        if (settled) return
        settled = true
        resolve()
      }

      mkdirSync(destRoot, { recursive: true })
      emptyDirectoryContents(path.join(destRoot, WORKSPACE_DIRS.sysdata))
      emptyDirectoryContents(path.join(destRoot, WORKSPACE_DIRS.media))
      emptyDirectoryContents(path.join(destRoot, WORKSPACE_DIRS.bible))

      const total = zipfile.entryCount
      let current = 0
      onProgress?.({ current: 0, total, zipPath: '' })

      zipfile.on('error', fail)
      zipfile.on('end', succeed)
      zipfile.on('entry', (entry) => {
        const rawName = String(entry.fileName || '')
        const relative = normalizeBackupZipPath(rawName)
        current += 1
        onProgress?.({ current, total, zipPath: relative })

        if (!isRestorableZipPath(rawName)) {
          zipfile.readEntry()
          return
        }

        if (!relative || relative.endsWith('/')) {
          if (relative) {
            mkdirSync(resolveSafeExtractPath(destRoot, relative), { recursive: true })
          }
          zipfile.readEntry()
          return
        }

        let dest
        try {
          dest = resolveSafeExtractPath(destRoot, relative)
        } catch (error) {
          fail(error)
          return
        }

        mkdirSync(path.dirname(dest), { recursive: true })
        removePathBestEffort(dest)
        zipfile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            fail(streamError ?? new Error('zip-stream-failed'))
            return
          }
          const writeStream = createWriteStream(dest)
          pipeline(readStream, writeStream)
            .then(() => zipfile.readEntry())
            .catch(fail)
        })
      })
      zipfile.readEntry()
    })
  })
}

/**
 * @param {{
 *   dataRoot: string
 *   mediaRoot: string
 *   mediaFolders?: { covers: string, music: string, images: string }
 *   destZip: string
 *   onProgress?: Function
 *   browserStorage?: Record<string, string>
 * }} opts
 */
export async function createAppBackupArchive({
  dataRoot,
  mediaRoot,
  mediaFolders,
  destZip,
  onProgress,
  browserStorage,
}) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'piano-backup-'))
  try {
    const entries = collectBackupEntries({ dataRoot, mediaRoot, mediaFolders })
    const snapshot = writeBrowserStorageSnapshot(browserStorage, tmpDir)
    if (snapshot) {
      const seen = new Set(entries.map((entry) => entry.zipPath))
      if (!seen.has(snapshot.zipPath)) entries.push(snapshot)
    }
    onProgress?.({ current: 0, total: entries.length, zipPath: '' })
    await writeBackupZip(entries, destZip, onProgress)
    return { ok: true, files: entries.length }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

/**
 * @param {{ zipFile: string, destRoot: string, onProgress?: Function }} opts
 */
export async function restoreAppBackupArchive({ zipFile, destRoot, onProgress }) {
  await restoreBackupZip(zipFile, destRoot, onProgress)
}
