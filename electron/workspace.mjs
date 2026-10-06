import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'
import { net } from 'electron'

import { resolveMediaFetchUrl } from './api-base.mjs'
import { API_BASE_URL } from './constants.mjs'
import { obfuscateText, revealText } from './crypto.mjs'
import {
  ensureWorkspaceDirectories,
  getWorkspacePaths,
  resetWorkspaceDirectories,
  resolveMediaDirectory,
} from './paths.mjs'

/**
 * @param {string} filename
 * @returns {unknown | null}
 */
export function readWorkspaceRecord(filename) {
  const { sysdata } = getWorkspacePaths()
  const filePath = path.join(sysdata, `${filename}.bin`)

  if (existsSync(filePath)) {
    const encryptedContent = readFileSync(filePath, 'utf8')
    const decryptedString = revealText(encryptedContent)
    if (decryptedString) {
      return JSON.parse(decryptedString)
    }
  }

  const plainFilePath = path.join(sysdata, filename)
  if (existsSync(plainFilePath)) {
    const content = readFileSync(plainFilePath, 'utf8')
    const data = JSON.parse(content)

    try {
      const encryptedContent = obfuscateText(content)
      if (encryptedContent) {
        writeFileSync(filePath, encryptedContent, 'utf8')
        unlinkSync(plainFilePath)
      }
    } catch (error) {
      console.error('[workspace] erro ao migrar registro plain → .bin', error)
    }

    return data
  }

  return null
}

/**
 * @param {string} filename
 * @param {unknown} data
 */
export function writeWorkspaceRecord(filename, data) {
  const { sysdata } = getWorkspacePaths()
  ensureWorkspaceDirectories()
  const filePath = path.join(sysdata, `${filename}.bin`)
  const encryptedContent = obfuscateText(JSON.stringify(data))
  if (!encryptedContent) return false
  writeFileSync(filePath, encryptedContent, 'utf8')
  return true
}

/**
 * Esvazia e recria o workspace de dados/mídia.
 * @param {{ preserveMedia?: boolean }} [options]
 */
export function clearWorkspaceData(options = {}) {
  const preserveMedia = Boolean(options?.preserveMedia)
  const { sysdata } = getWorkspacePaths()
  const legalRecordNames = ['eula.bin', 'eula']
  const preservedLegalRecords = new Map()

  for (const recordName of legalRecordNames) {
    const recordPath = path.join(sysdata, recordName)
    if (existsSync(recordPath)) {
      preservedLegalRecords.set(recordName, readFileSync(recordPath, 'utf8'))
    }
  }

  if (preserveMedia) {
    if (existsSync(sysdata)) {
      rmSync(sysdata, { recursive: true, force: true })
    }
    ensureWorkspaceDirectories()
  } else {
    resetWorkspaceDirectories()
  }

  for (const [recordName, content] of preservedLegalRecords) {
    writeFileSync(path.join(sysdata, recordName), content, 'utf8')
  }

  return true
}

/**
 * Legado FTP/SQLite removido — first-boot usa sync HTTP (`syncEssentialCatalogFromApi`).
 * Mantido para não quebrar IPC antigo; sempre falha de propósito.
 * @param {(data: { progress: number }) => void} _onProgress
 */
export async function downloadCatalogDatabase(_onProgress) {
  throw new Error(
    'catalog FTP removido — use sync HTTP da API Piano (/json_db)',
  )
}

/**
 * @param {(data: { text: string, progress: number }) => void} _onProgress
 */
export async function extractCatalogDatabase(_onProgress) {
  throw new Error(
    'extração SQLite removida — use sync HTTP da API Piano (/json_db)',
  )
}

/**
 * @param {'covers' | 'music' | 'slides'} mediaType
 * @param {string} filename
 */
function buildApiMediaUrl(mediaType, filename) {
  let urlFolder = 'covers'
  if (mediaType === 'music') urlFolder = 'musics'
  else if (mediaType === 'slides') urlFolder = 'images'

  const cleanFilename = filename.replace(/\\/g, '/')
  return `${API_BASE_URL}/file/${urlFolder}/${encodeURIComponent(cleanFilename).replace(/%2F/g, '/')}`
}

/**
 * @param {string} requestedUrl URL já montada pela tela (VITE_URL_FILES).
 * @param {'covers' | 'music' | 'slides'} mediaType
 * @param {string} filename
 */
export async function downloadMediaFile(requestedUrl, mediaType, filename) {
  const TIMEOUT_MS = 20_000

  /** @returns {Promise<boolean>} */
  const run = async () => {
    // HTTP no mesmo host do catálogo. Sem FTP legado.
    const destFolder = resolveMediaDirectory(mediaType)
    const decodedFilename = decodeURIComponent(filename)
    const filePath = path.join(destFolder, decodedFilename)
    mkdirSync(path.dirname(filePath), { recursive: true })

    const apiUrl = resolveMediaFetchUrl(
      requestedUrl,
      buildApiMediaUrl(mediaType, decodedFilename),
      API_BASE_URL,
    )
    const response = await net.fetch(apiUrl)
    if (!response.ok) return false

    const buffer = Buffer.from(await response.arrayBuffer())
    writeFileSync(filePath, buffer)
    return true
  }

  let timer
  try {
    const work = run()
    // Evita unhandled rejection se o timeout vencer primeiro.
    work.catch(() => {})
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`media download timeout (${TIMEOUT_MS}ms)`))
        }, TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    console.warn('[media] download falhou/timeout:', error?.message || error)
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * @param {'covers' | 'music' | 'slides'} mediaType
 * @param {string} filename
 */
export function checkMediaFile(mediaType, filename) {
  const destFolder = resolveMediaDirectory(mediaType)
  const decodedFilename = decodeURIComponent(filename)
  const filePath = path.join(destFolder, decodedFilename)

  if (!existsSync(filePath)) return false

  const cleanFilename = decodedFilename.replace(/\\/g, '/')
  const mappedType = mediaType === 'slides' ? 'images' : mediaType
  return `local://media/${mappedType}/${cleanFilename}`
}

/**
 * Checagem em lote (um IPC) — evita N round-trips na abertura da Central.
 * @param {'covers' | 'music' | 'slides'} mediaType
 * @param {string[]} filenames
 * @returns {Record<string, string | false>}
 */
export function checkMediaFiles(mediaType, filenames) {
  /** @type {Record<string, string | false>} */
  const result = {}
  if (!Array.isArray(filenames)) return result

  for (const filename of filenames) {
    if (typeof filename !== 'string' || !filename) continue
    result[filename] = checkMediaFile(mediaType, filename)
  }
  return result
}

/**
 * @param {'covers' | 'music' | 'slides'} mediaType
 * @param {string} filename
 */
export function deleteMediaFile(mediaType, filename) {
  const destFolder = resolveMediaDirectory(mediaType)
  const decodedFilename = decodeURIComponent(filename)
  const filePath = path.join(destFolder, decodedFilename)

  if (!existsSync(filePath)) return true

  try {
    unlinkSync(filePath)
    return true
  } catch (error) {
    console.error('[media] erro ao deletar', error)
    return false
  }
}
