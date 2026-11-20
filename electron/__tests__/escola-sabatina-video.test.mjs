// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsSpy = vi.hoisted(() => ({ copyFileSync: null }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  fsSpy.copyFileSync = vi.fn(actual.copyFileSync)
  return { ...actual, copyFileSync: (...args) => fsSpy.copyFileSync(...args) }
})

import {
  ESCOLA_SABATINA_VIDEO_EXTENSIONS,
  clearEscolaSabatinaVideo,
  importEscolaSabatinaVideo,
} from '../escola-sabatina-video.mjs'

let root
let media
let videoDir

function source(name, content = name) {
  const file = path.join(root, 'origem', name)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'escola-sabatina-video-'))
  media = path.join(root, 'Media')
  videoDir = path.join(media, 'modulos', 'escola-sabatina', 'video')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('vídeo personalizado da Escola Sabatina', () => {
  it('copia o vídeo para Media/modulos/escola-sabatina/video', () => {
    const result = importEscolaSabatinaVideo(media, source('Abertura ES.mp4', 'video-1'))

    expect(result.ok).toBe(true)
    expect(result.originalName).toBe('Abertura ES.mp4')
    expect(result.relativePath).toBe(`modulos/escola-sabatina/video/${result.fileName}`)
    expect(result.fileName).toMatch(/^video-\d+\.mp4$/)
    expect(readFileSync(path.join(videoDir, result.fileName), 'utf8')).toBe('video-1')
  })

  it('guarda um vídeo só: trocar apaga o anterior', () => {
    const first = importEscolaSabatinaVideo(media, source('a.mp4', 'antigo'))
    writeFileSync(path.join(videoDir, 'sobra.webm'), 'lixo')
    const second = importEscolaSabatinaVideo(media, source('b.WEBM', 'novo'))

    expect(second.ok).toBe(true)
    expect(second.fileName).toMatch(/\.webm$/)
    expect(readdirSync(videoDir)).toEqual([second.fileName])
    expect(existsSync(path.join(videoDir, first.fileName))).toBe(false)
  })

  it('não usa o mesmo nome do vídeo anterior, para a projeção não ficar com o arquivo velho em cache', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = importEscolaSabatinaVideo(media, source('a.mp4'))
    const second = importEscolaSabatinaVideo(media, source('b.mp4'))
    now.mockRestore()

    expect(second.fileName).not.toBe(first.fileName)
    expect(readdirSync(videoDir)).toEqual([second.fileName])
  })

  it('recusa formato que não é vídeo e mantém o vídeo atual', () => {
    const kept = importEscolaSabatinaVideo(media, source('a.mp4'))
    const result = importEscolaSabatinaVideo(media, source('musica.mp3'))

    expect(result).toEqual({ ok: false, error: 'unsupported_format' })
    expect(readdirSync(videoDir)).toEqual([kept.fileName])
  })

  it('aceita os formatos que o Chromium toca', () => {
    expect(ESCOLA_SABATINA_VIDEO_EXTENSIONS).toEqual(['mp4', 'm4v', 'webm', 'mov', 'ogv'])
  })

  it('arquivo de origem inexistente não apaga o vídeo atual', () => {
    const kept = importEscolaSabatinaVideo(media, source('a.mp4'))
    const result = importEscolaSabatinaVideo(media, path.join(root, 'sumiu.mp4'))

    expect(result).toEqual({ ok: false, error: 'not_found' })
    expect(readdirSync(videoDir)).toEqual([kept.fileName])
  })

  it('falha na cópia não apaga o vídeo atual', () => {
    const kept = importEscolaSabatinaVideo(media, source('a.mp4'))
    fsSpy.copyFileSync.mockImplementationOnce(() => { throw new Error('disco cheio') })
    const result = importEscolaSabatinaVideo(media, source('b.mp4'))

    expect(result).toEqual({ ok: false, error: 'copy_failed' })
    expect(readdirSync(videoDir)).toEqual([kept.fileName])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('falha ao copiar'), expect.anything())
  })

  it('limpar apaga o vídeo e aceita pasta que ainda não existe', () => {
    expect(clearEscolaSabatinaVideo(media)).toEqual({ ok: true })

    importEscolaSabatinaVideo(media, source('a.mp4'))
    expect(clearEscolaSabatinaVideo(media)).toEqual({ ok: true })
    expect(readdirSync(videoDir)).toEqual([])
  })
})
