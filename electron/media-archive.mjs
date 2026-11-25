/**
 * Importa as mídias direto do arquivo compactado baixado do site
 * (LouvorJA-PIANO.tar.gz), sem extrair tudo antes: lê o .tar.gz em fluxo e
 * grava só capas, imagens e músicas que ainda não existem. O resto do
 * arquivo (cache do Electron, cookies, tokens, fontes, módulos) é pulado.
 *
 * Aceita a pasta de dados do PIANO (…/Media/covers|images|music/…) e a
 * pasta config do Louvor JA antigo (…/config/capas|imagens|musicas/…).
 */
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createGunzip } from 'node:zlib'

import { AUDIO_EXTS, IMAGE_EXTS, createImportControl } from './legacy-media-import.mjs'
import { resolveMediaDirectory } from './paths.mjs'

const ARCHIVE_RE = /\.(tar\.gz|tgz|tar)$/i
const GZIP_RE = /\.(tar\.gz|tgz)$/i

/** O caminho escolhido é um arquivo compactado de mídias (.tar.gz/.tgz/.tar). */
export function isMediaArchive(path) {
  return typeof path === 'string' && ARCHIVE_RE.test(path.trim())
}

const PIANO_FOLDERS = { covers: 'covers', images: 'slides', music: 'music' }
const LEGACY_FOLDERS = { capas: 'covers', imagens: 'slides', musicas: 'music' }

function extOf(name) {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Caminho dentro do arquivo → { mediaType, relativePath } no workspace, ou
 * null quando não é mídia. Música sempre fica sob a pasta de idioma.
 * @param {string} path
 * @param {'pt' | 'es'} lang
 */
export function mediaTargetOfArchivePath(path, lang) {
  const segs = String(path).replace(/\\/g, '/').split('/').filter(Boolean)
  for (let i = 1; i < segs.length - 1; i += 1) {
    const parent = segs[i - 1].toLowerCase()
    const folder = segs[i].toLowerCase()
    const mediaType =
      parent === 'media' ? PIANO_FOLDERS[folder] : parent === 'config' ? LEGACY_FOLDERS[folder] : undefined
    if (!mediaType) continue
    const rest = segs.slice(i + 1)
    const allowed = mediaType === 'music' ? AUDIO_EXTS : IMAGE_EXTS
    if (!allowed.has(extOf(rest[rest.length - 1]))) return null
    const hasLang = rest.length > 1 && (rest[0] === 'pt' || rest[0] === 'es')
    const relativePath =
      mediaType === 'music' && !hasLang ? [lang, ...rest].join('/') : rest.join('/')
    return { mediaType, relativePath }
  }
  return null
}

/* ---------- leitura do tar ---------- */

function cstr(buf, start, length) {
  const slice = buf.subarray(start, start + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end < 0 ? slice.length : end).toString('utf8')
}

function parseSize(buf) {
  const field = buf.subarray(124, 136)
  // Base-256 (GNU) para arquivos acima de 8 GB.
  if (field[0] & 0x80) {
    let size = 0
    for (let i = 1; i < field.length; i += 1) size = size * 256 + field[i]
    return size
  }
  const text = cstr(buf, 124, 12).trim()
  return text ? parseInt(text, 8) : 0
}

function parseHeader(buf) {
  let name = cstr(buf, 0, 100)
  const magic = buf.toString('latin1', 257, 263)
  // POSIX ustar usa o prefixo; o GNU guarda outra coisa nesse espaço.
  if (magic === 'ustar\0') {
    const prefix = cstr(buf, 345, 155)
    if (prefix) name = `${prefix}/${name}`
  }
  return { name, size: parseSize(buf), type: String.fromCharCode(buf[156] || 48) }
}

/** Registros pax ("NN chave=valor\n"): só o `path` interessa. */
function paxPath(data) {
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space < 0) break
    const length = parseInt(data.toString('utf8', offset, space), 10)
    if (!length) break
    const record = data.toString('utf8', space + 1, offset + length - 1)
    const eq = record.indexOf('=')
    if (eq > 0 && record.slice(0, eq) === 'path') return record.slice(eq + 1)
    offset += length
  }
  return null
}

/**
 * Lê o arquivo e grava as mídias que faltam. Pausar/continuar/parar valem
 * entre um arquivo e outro; cada mídia é gravada como `.part` e renomeada
 * no fim — parar ou falhar nunca deixa arquivo pela metade.
 * @param {string} filePath
 * @param {(p: { current: number, total: number, relativePath: string, mediaType: string, unit: 'bytes' }) => void} [onProgress]
 * @param {{
 *   control?: ReturnType<typeof createImportControl>,
 *   resolveDest?: (mediaType: string, relativePath: string) => string,
 *   lang?: 'pt' | 'es',
 * }} [opts]
 */
export async function importMediaArchive(filePath, onProgress, opts = {}) {
  const control = opts.control ?? createImportControl()
  const resolveDest =
    opts.resolveDest ?? ((mediaType, relativePath) => join(resolveMediaDirectory(mediaType), relativePath))
  const lang = opts.lang === 'es' ? 'es' : 'pt'
  const total = (await stat(filePath)).size

  // Blocos de 1 MB: descompactar fica ~2x mais rápido que o padrão (64 KB/16 KB).
  const input = createReadStream(filePath, { highWaterMark: 1024 * 1024 })
  let read = 0
  input.on('data', (chunk) => {
    read += chunk.length
  })
  /** @type {NodeJS.ReadableStream & { destroy(err?: Error): void }} */
  let stream = input
  if (GZIP_RE.test(filePath)) {
    const gunzip = createGunzip({ chunkSize: 1024 * 1024 })
    input.on('error', (error) => gunzip.destroy(error))
    stream = input.pipe(gunzip)
  }

  const counts = { imported: 0, skipped: 0, failed: 0 }
  // Progresso com a contagem ao vivo; no máximo a cada `progressEveryMs`
  // (também nos trechos sem mídia, para a barra não parar).
  const progressEveryMs = opts.progressEveryMs ?? 250
  let lastProgressAt = 0
  let lastTarget = { relativePath: '', mediaType: 'music' }
  const report = (force = false) => {
    if (opts.dryRun || !onProgress) return
    const now = Date.now()
    if (!force && now - lastProgressAt < progressEveryMs) return
    lastProgressAt = now
    onProgress({
      current: read,
      total,
      relativePath: lastTarget.relativePath,
      mediaType: lastTarget.mediaType,
      unit: 'bytes',
      imported: counts.imported,
      skipped: counts.skipped,
    })
  }
  let cancelled = false
  let foundMedia = false
  let header = Buffer.alloc(0)
  let remaining = 0
  let pad = 0
  /** @type {string | null} nome longo (pax/GNU) que vale para a próxima entrada */
  let pendingPath = null
  /** @type {null | { kind: 'skip' } | { kind: 'collect', type: string, parts: Buffer[] } | { kind: 'file', handle: import('node:fs/promises').FileHandle, dest: string, failed: boolean }} */
  let current = null

  const discardFile = async () => {
    if (current?.kind !== 'file') return
    await current.handle.close().catch(() => {})
    await unlink(`${current.dest}.part`).catch(() => {})
  }

  const finishEntry = async () => {
    const entry = current
    current = null
    if (!entry) return
    if (entry.kind === 'collect') {
      const data = Buffer.concat(entry.parts)
      pendingPath =
        entry.type === 'L' ? data.toString('utf8').replace(/\0[\s\S]*$/, '') : paxPath(data) ?? pendingPath
      return
    }
    if (entry.kind !== 'file') return
    try {
      await entry.handle.close()
      if (entry.failed) throw new Error('write-failed')
      await rename(`${entry.dest}.part`, entry.dest)
      counts.imported += 1
    } catch {
      await unlink(`${entry.dest}.part`).catch(() => {})
      counts.failed += 1
    }
  }

  /** Começa uma entrada a partir do cabeçalho; false = parar. */
  const startEntry = async (entry) => {
    remaining = entry.size
    pad = (512 - (entry.size % 512)) % 512
    if (entry.type === 'x' || entry.type === 'L') {
      current = { kind: 'collect', type: entry.type, parts: [] }
      return true
    }
    const path = pendingPath ?? entry.name
    pendingPath = null
    const isFile = entry.type === '0' || entry.type === '7'
    const target = isFile ? mediaTargetOfArchivePath(path, lang) : null
    if (!target) {
      current = { kind: 'skip' }
      return true
    }
    if (opts.dryRun) {
      foundMedia = true
      return false
    }
    if (!(await control.checkpoint())) return false
    lastTarget = target
    report()
    const dest = resolveDest(target.mediaType, target.relativePath)
    if (existsSync(dest)) {
      counts.skipped += 1
      current = { kind: 'skip' }
      return true
    }
    try {
      await mkdir(dirname(dest), { recursive: true })
      current = { kind: 'file', handle: await open(`${dest}.part`, 'w'), dest, failed: false }
    } catch {
      counts.failed += 1
      current = { kind: 'skip' }
    }
    return true
  }

  try {
    outer: for await (const chunk of stream) {
      if (opts.maxBytes && read > opts.maxBytes) break
      report()
      let offset = 0
      while (offset < chunk.length) {
        if (remaining > 0) {
          const n = Math.min(remaining, chunk.length - offset)
          const part = chunk.subarray(offset, offset + n)
          if (current?.kind === 'collect') current.parts.push(Buffer.from(part))
          else if (current?.kind === 'file' && !current.failed) {
            try {
              await current.handle.write(part)
            } catch {
              current.failed = true
            }
          }
          offset += n
          remaining -= n
          if (remaining === 0) await finishEntry()
          continue
        }
        if (pad > 0) {
          const n = Math.min(pad, chunk.length - offset)
          offset += n
          pad -= n
          continue
        }
        const n = Math.min(512 - header.length, chunk.length - offset)
        header = Buffer.concat([header, chunk.subarray(offset, offset + n)])
        offset += n
        if (header.length < 512) continue
        const block = header
        header = Buffer.alloc(0)
        if (block.every((byte) => byte === 0)) break outer // fim do arquivo
        if (!(await startEntry(parseHeader(block)))) {
          cancelled = true
          break outer
        }
        if (remaining === 0) await finishEntry()
      }
    }
  } finally {
    await discardFile()
    input.destroy()
    if (stream !== input) stream.destroy()
  }

  if (opts.dryRun) return { ...counts, total: 0, cancelled: false, foundMedia }
  if (!cancelled) {
    read = total
    lastTarget = { relativePath: '', mediaType: 'music' }
    report(true)
  }
  const done = counts.imported + counts.skipped + counts.failed
  return { ...counts, total: done, cancelled }
}

/**
 * Confere se o arquivo tem mídias, parando na primeira encontrada (sem
 * gravar nada). Lê no máximo `maxBytes` do arquivo compactado.
 * @param {string} filePath
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<{ found: boolean, totalBytes: number }>}
 */
export async function peekMediaArchive(filePath, opts = {}) {
  try {
    const totalBytes = (await stat(filePath)).size
    const result = await importMediaArchive(filePath, undefined, {
      dryRun: true,
      maxBytes: opts.maxBytes ?? 2 * 1024 * 1024 * 1024,
      resolveDest: () => '',
    })
    return { found: Boolean(result.foundMedia), totalBytes }
  } catch {
    return { found: false, totalBytes: 0 }
  }
}
