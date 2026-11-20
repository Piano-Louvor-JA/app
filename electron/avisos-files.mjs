import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

/** Relativo à pasta Media (posix). Cada aviso tem `<AVISOS_REL_DIR>/<id>/`. */
export const AVISOS_REL_DIR = 'modulos/avisos'

/** Formatos aceitos por tipo de aviso. */
export const AVISOS_EXTENSIONS = {
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
  video: ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'],
  presentation: ['pptx', 'ppt', 'ppsx', 'pps', 'odp', 'pdf'],
}

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/

/**
 * @param {unknown} id
 * @returns {id is string}
 */
export function isSafeAvisoId(id) {
  return typeof id === 'string' && SAFE_ID.test(id)
}

/**
 * @param {string} mediaRoot
 * @param {string} id
 */
function avisoDir(mediaRoot, id) {
  return path.join(mediaRoot, ...AVISOS_REL_DIR.split('/'), id)
}

/**
 * Absoluto de um caminho relativo, só se ficar dentro da pasta de avisos.
 * @param {string} mediaRoot
 * @param {unknown} relativePath
 * @returns {string | null}
 */
function safeAbsolute(mediaRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('\\')) return null
  const parts = relativePath.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
  if (!relativePath.startsWith(`${AVISOS_REL_DIR}/`)) return null
  const base = path.join(mediaRoot, ...AVISOS_REL_DIR.split('/'))
  const absolute = path.join(mediaRoot, ...parts)
  return absolute.startsWith(base + path.sep) ? absolute : null
}

/**
 * Copia os arquivos escolhidos para a pasta do aviso. Cada arquivo é tratado
 * sozinho: o que não pôde ser copiado vai em `rejected` e não deixa resto.
 * O nome no disco é gerado (evita colisão e caracteres estranhos); o nome
 * original volta em `name`.
 * @param {string} mediaRoot
 * @param {string} avisoId
 * @param {string[]} sources
 * @param {'images' | 'video' | 'presentation'} kind
 */
export function importAvisoFiles(mediaRoot, avisoId, sources, kind) {
  if (!isSafeAvisoId(avisoId)) return { ok: false, error: 'invalid_id' }
  const allowed = Object.hasOwn(AVISOS_EXTENSIONS, kind) ? AVISOS_EXTENSIONS[kind] : null
  if (!allowed) return { ok: false, error: 'invalid_kind' }

  const dir = avisoDir(mediaRoot, avisoId)
  mkdirSync(dir, { recursive: true })

  /** @type {{ relativePath: string, name: string }[]} */
  const files = []
  /** @type {{ name: string, reason: 'unsupported_format' | 'not_found' | 'copy_failed' }[]} */
  const rejected = []
  let stamp = Date.now()

  for (const sourcePath of sources) {
    const name = path.basename(sourcePath)
    const ext = path.extname(sourcePath).toLowerCase()
    if (!allowed.includes(ext.slice(1))) {
      rejected.push({ name, reason: 'unsupported_format' })
      continue
    }
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      rejected.push({ name, reason: 'not_found' })
      continue
    }
    while (existsSync(path.join(dir, `${stamp}${ext}`))) stamp += 1
    const fileName = `${stamp}${ext}`
    stamp += 1
    try {
      copyFileSync(sourcePath, path.join(dir, fileName))
    } catch (error) {
      console.warn('[avisos-files] falha ao copiar', name, error)
      rmSync(path.join(dir, fileName), { force: true })
      rejected.push({ name, reason: 'copy_failed' })
      continue
    }
    files.push({ relativePath: `${AVISOS_REL_DIR}/${avisoId}/${fileName}`, name })
  }

  return { ok: true, files, rejected }
}

/**
 * Duplicar aviso: copia a pasta inteira e devolve antigo → novo caminho.
 * @param {string} mediaRoot
 * @param {string} fromId
 * @param {string} toId
 */
export function copyAvisoFolder(mediaRoot, fromId, toId) {
  if (!isSafeAvisoId(fromId) || !isSafeAvisoId(toId)) return { ok: false, error: 'invalid_id' }
  const from = avisoDir(mediaRoot, fromId)
  /** @type {Record<string, string>} */
  const paths = {}
  if (!existsSync(from)) return { ok: true, paths }
  try {
    cpSync(from, avisoDir(mediaRoot, toId), { recursive: true })
  } catch (error) {
    console.warn('[avisos-files] falha ao duplicar', fromId, error)
    rmSync(avisoDir(mediaRoot, toId), { recursive: true, force: true })
    return { ok: false, error: 'copy_failed' }
  }
  for (const name of readdirSync(from)) {
    paths[`${AVISOS_REL_DIR}/${fromId}/${name}`] = `${AVISOS_REL_DIR}/${toId}/${name}`
  }
  return { ok: true, paths }
}

/**
 * @param {string} mediaRoot
 * @param {string} avisoId
 */
export function removeAvisoFolder(mediaRoot, avisoId) {
  if (!isSafeAvisoId(avisoId)) return { ok: false, error: 'invalid_id' }
  rmSync(avisoDir(mediaRoot, avisoId), { recursive: true, force: true })
  return { ok: true }
}

/**
 * Apaga arquivos soltos (imagem removida do aviso, vídeo trocado).
 * @param {string} mediaRoot
 * @param {unknown[]} relativePaths
 */
export function removeAvisoFiles(mediaRoot, relativePaths) {
  let removed = 0
  for (const relativePath of relativePaths) {
    const absolute = safeAbsolute(mediaRoot, relativePath)
    if (!absolute || !existsSync(absolute)) continue
    rmSync(absolute, { force: true })
    removed += 1
  }
  return { ok: true, removed }
}

/**
 * @param {string} mediaRoot
 * @param {unknown[]} relativePaths
 * @returns {{ relativePath: unknown, absolutePath: string | null, exists: boolean }[]}
 */
export function resolveAvisoPaths(mediaRoot, relativePaths) {
  return relativePaths.map((relativePath) => {
    const absolutePath = safeAbsolute(mediaRoot, relativePath)
    return { relativePath, absolutePath, exists: absolutePath ? existsSync(absolutePath) : false }
  })
}
