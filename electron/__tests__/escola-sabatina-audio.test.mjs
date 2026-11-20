// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ app: { isPackaged: false, getAppPath: () => '' } }))
const fsSpy = vi.hoisted(() => ({ copyFileSync: null }))
vi.mock('electron', () => electron)
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  fsSpy.copyFileSync = vi.fn(actual.copyFileSync)
  return { ...actual, copyFileSync: (...args) => fsSpy.copyFileSync(...args) }
})

import {
  ESCOLA_SABATINA_AUDIO_FILES,
  ESCOLA_SABATINA_LANGS,
  ensureEscolaSabatinaAudio,
  resolveBundledEscolaSabatinaDir,
} from '../escola-sabatina-audio.mjs'

let root
let appDir
let media

function seedBundled(baseDir) {
  for (const lang of ESCOLA_SABATINA_LANGS) {
    const dir = path.join(baseDir, lang)
    mkdirSync(dir, { recursive: true })
    for (const file of ESCOLA_SABATINA_AUDIO_FILES) writeFileSync(path.join(dir, file), `${lang}/${file}`)
  }
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'escola-sabatina-'))
  appDir = path.join(root, 'app')
  media = path.join(root, 'Media')
  electron.app.isPackaged = false
  electron.app.getAppPath = () => appDir
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('narrações da Escola Sabatina na pasta de mídia', () => {
  it('copia as 3 faixas dos 4 idiomas para Media/modulos/escola-sabatina/<lang>', () => {
    seedBundled(resolveBundledEscolaSabatinaDir())
    ensureEscolaSabatinaAudio(media)
    for (const lang of ['pt', 'es', 'en', 'fr']) {
      for (const file of ['abertura.mp3', '5minutos.mp3', '1minuto.mp3']) {
        expect(readFileSync(path.join(media, 'modulos', 'escola-sabatina', lang, file), 'utf8')).toBe(`${lang}/${file}`)
      }
    }
  })

  it('não sobrescreve arquivo que já está na pasta de mídia', () => {
    seedBundled(resolveBundledEscolaSabatinaDir())
    const kept = path.join(media, 'modulos', 'escola-sabatina', 'es', 'abertura.mp3')
    mkdirSync(path.dirname(kept), { recursive: true })
    writeFileSync(kept, 'do usuário')
    ensureEscolaSabatinaAudio(media)
    expect(readFileSync(kept, 'utf8')).toBe('do usuário')
  })

  it('no app instalado lê os arquivos de resources/midia', () => {
    electron.app.isPackaged = true
    const resources = path.join(root, 'resources')
    process.resourcesPath = resources
    try {
      expect(resolveBundledEscolaSabatinaDir()).toBe(path.join(resources, 'midia', 'modulos', 'escola-sabatina'))
    } finally {
      delete process.resourcesPath
    }
  })

  it('segue sem quebrar quando falta arquivo empacotado ou a cópia falha', () => {
    ensureEscolaSabatinaAudio(media)
    expect(existsSync(path.join(media, 'modulos', 'escola-sabatina', 'pt'))).toBe(true)
    expect(existsSync(path.join(media, 'modulos', 'escola-sabatina', 'pt', 'abertura.mp3'))).toBe(false)

    seedBundled(resolveBundledEscolaSabatinaDir())
    fsSpy.copyFileSync.mockImplementationOnce(() => { throw new Error('disco cheio') })
    expect(() => ensureEscolaSabatinaAudio(media)).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('falha ao copiar pt/abertura.mp3'), expect.anything())
  })
})
