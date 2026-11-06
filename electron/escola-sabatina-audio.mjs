import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/** Pastas por idioma das narrações oficiais (Media/modulos/escola-sabatina/<lang>). */
export const ESCOLA_SABATINA_LANGS = ['pt', 'es', 'en', 'fr']

export const ESCOLA_SABATINA_AUDIO_FILES = ['abertura.mp3', '5minutos.mp3', '1minuto.mp3']

/**
 * Pasta empacotada (extraResources) ou `resources/` no dev.
 * @returns {string}
 */
export function resolveBundledEscolaSabatinaDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'midia', 'modulos', 'escola-sabatina')
  }

  return path.join(app.getAppPath(), 'resources', 'midia', 'modulos', 'escola-sabatina')
}

/**
 * Copia para Media/modulos/escola-sabatina/<lang> as narrações que ainda não
 * existirem. Nunca sobrescreve arquivo já presente.
 * @param {string} mediaRoot
 */
export function ensureEscolaSabatinaAudio(mediaRoot) {
  const bundledDir = resolveBundledEscolaSabatinaDir()

  for (const lang of ESCOLA_SABATINA_LANGS) {
    const destDir = path.join(mediaRoot, 'modulos', 'escola-sabatina', lang)
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }

    for (const fileName of ESCOLA_SABATINA_AUDIO_FILES) {
      const dest = path.join(destDir, fileName)
      if (existsSync(dest)) continue

      const src = path.join(bundledDir, lang, fileName)
      if (!existsSync(src)) {
        console.warn('[escola-sabatina-audio] áudio empacotado não encontrado:', src)
        continue
      }
      try {
        copyFileSync(src, dest)
      } catch (error) {
        console.warn(`[escola-sabatina-audio] falha ao copiar ${lang}/${fileName}`, error)
      }
    }
  }
}
