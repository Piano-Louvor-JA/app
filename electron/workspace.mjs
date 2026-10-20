import { randomUUID } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const MEDIA_DOWNLOAD_STALL_TIMEOUT_MS = 15_000
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
  let apiUrl = requestedUrl
  let bytes = 0
  let partPath = ''
  let status = null
  const controller = new AbortController()
  let timer = null
  const failure = (error) => ({
    ok: false,
    url: error?.url || apiUrl,
    status: typeof error?.status === 'number' ? error.status : status,
    bytes: typeof error?.bytes === 'number' ? error.bytes : bytes,
    error: error instanceof Error ? error.message : String(error ?? 'media download failed'),
  })
  const resetStallTimer = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => controller.abort(new Error(`media download stall (${MEDIA_DOWNLOAD_STALL_TIMEOUT_MS / 1000}s sem dados)`)), MEDIA_DOWNLOAD_STALL_TIMEOUT_MS)
  }

  try {
    const destFolder = resolveMediaDirectory(mediaType)
    const decodedFilename = decodeURIComponent(filename)
    const filePath = path.join(destFolder, decodedFilename)
    partPath = `${filePath}.${randomUUID()}.part`
    mkdirSync(path.dirname(filePath), { recursive: true })
    apiUrl = resolveMediaFetchUrl(requestedUrl, buildApiMediaUrl(mediaType, decodedFilename), API_BASE_URL)
    resetStallTimer()
    const response = await net.fetch(apiUrl, { signal: controller.signal })
    status = response.status
    if (!response.ok) {
      if (response.body) {
        for await (const chunk of Readable.fromWeb(response.body)) {
          bytes += chunk.length
          resetStallTimer()
        }
      }
      return { ok: false, url: response.url || apiUrl, status, bytes, error: `HTTP ${status}` }
    }
    if (!response.body) throw new Error('media download response body unavailable')

    const stream = Readable.fromWeb(response.body)
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length
        resetStallTimer()
        callback(null, chunk)
      },
    })

    await pipeline(stream, progress, createWriteStream(partPath), { signal: controller.signal })
    renameSync(partPath, filePath)
    return true
  } catch (error) {
    const cause = controller.signal.aborted ? controller.signal.reason : error
    console.warn('[media] download falhou/stall:', cause?.message || cause)
    try {
      if (partPath && existsSync(partPath)) unlinkSync(partPath)
    } catch (cleanupError) {
      console.warn('[media] falha ao limpar .part:', cleanupError?.message || cleanupError)
    }
    return failure(cause)
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
