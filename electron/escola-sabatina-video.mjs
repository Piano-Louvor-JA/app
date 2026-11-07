import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

/** Formatos que o `<video>` do Chromium toca. */
export const ESCOLA_SABATINA_VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'ogv']

/** Relativo à pasta Media (posix). */
export const ESCOLA_SABATINA_VIDEO_REL_DIR = 'modulos/escola-sabatina/video'

/**
 * @param {string} mediaRoot
 * @returns {string}
 */
function videoDir(mediaRoot) {
  return path.join(mediaRoot, ...ESCOLA_SABATINA_VIDEO_REL_DIR.split('/'))
}

/**
 * @param {string} dir
 * @param {string} [keep]
 */
function removeOthers(dir, keep) {
  for (const name of readdirSync(dir)) {
    if (name === keep) continue
    rmSync(path.join(dir, name), { recursive: true, force: true })
  }
}

/**
 * Copia o vídeo escolhido para Media/modulos/escola-sabatina/video e apaga o
 * anterior: a pasta guarda um vídeo só. O nome muda a cada troca para a
 * projeção não reaproveitar o arquivo antigo em cache.
 * @param {string} mediaRoot
 * @param {string} sourcePath
 * @returns {{ ok: true, fileName: string, relativePath: string, originalName: string } | { ok: false, error: 'unsupported_format' | 'not_found' | 'copy_failed' }}
 */
export function importEscolaSabatinaVideo(mediaRoot, sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase()
  if (!ESCOLA_SABATINA_VIDEO_EXTENSIONS.includes(ext.slice(1))) {
    return { ok: false, error: 'unsupported_format' }
  }
  if (!existsSync(sourcePath)) {
    return { ok: false, error: 'not_found' }
  }

  const dir = videoDir(mediaRoot)
  mkdirSync(dir, { recursive: true })

  let stamp = Date.now()
  while (existsSync(path.join(dir, `video-${stamp}${ext}`))) stamp += 1
  const fileName = `video-${stamp}${ext}`

  try {
    copyFileSync(sourcePath, path.join(dir, fileName))
  } catch (error) {
    console.warn('[escola-sabatina-video] falha ao copiar o vídeo', error)
    rmSync(path.join(dir, fileName), { force: true })
    return { ok: false, error: 'copy_failed' }
  }

  removeOthers(dir, fileName)
  return {
    ok: true,
    fileName,
    relativePath: `${ESCOLA_SABATINA_VIDEO_REL_DIR}/${fileName}`,
    originalName: path.basename(sourcePath),
  }
}

/**
 * Apaga o vídeo personalizado.
 * @param {string} mediaRoot
 * @returns {{ ok: true }}
 */
export function clearEscolaSabatinaVideo(mediaRoot) {
  const dir = videoDir(mediaRoot)
  if (existsSync(dir)) removeOthers(dir)
  return { ok: true }
}
