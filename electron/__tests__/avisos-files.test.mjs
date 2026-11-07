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
  AVISOS_EXTENSIONS,
  AVISOS_REL_DIR,
  copyAvisoFolder,
  importAvisoFiles,
  isSafeAvisoId,
  removeAvisoFiles,
  removeAvisoFolder,
  resolveAvisoPaths,
} from '../avisos-files.mjs'

let root
let media

function source(name, content = name) {
  const file = path.join(root, 'pendrive', name)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}

function avisoDir(id) {
  return path.join(media, 'modulos', 'avisos', id)
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'avisos-files-'))
  media = path.join(root, 'Media')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('isSafeAvisoId', () => {
  it.each([
    ['3f2a-11ee-b9d1', true],
    ['abc', true],
    ['', false],
    ['../x', false],
    ['a/b', false],
    ['a'.repeat(65), false],
    [42, false],
  ])('%s → %s', (id, expected) => {
    expect(isSafeAvisoId(id)).toBe(expected)
  })
})

describe('importAvisoFiles', () => {
  it('copia várias imagens para a pasta do aviso, na ordem, com o nome original', () => {
    const result = importAvisoFiles(media, 'a1', [source('foto 1.JPG'), source('foto2.png')], 'images')
    expect(result.ok).toBe(true)
    expect(result.rejected).toEqual([])
    expect(result.files.map((f) => f.name)).toEqual(['foto 1.JPG', 'foto2.png'])
    for (const file of result.files) {
      expect(file.relativePath.startsWith(`${AVISOS_REL_DIR}/a1/`)).toBe(true)
      expect(existsSync(path.join(media, ...file.relativePath.split('/')))).toBe(true)
    }
    expect(readFileSync(path.join(media, ...result.files[0].relativePath.split('/')), 'utf8')).toBe('foto 1.JPG')
    expect(new Set(result.files.map((f) => f.relativePath)).size).toBe(2)
  })

  it('o arquivo copiado continua lá depois que o original some (pendrive removido)', () => {
    const original = source('aviso.png')
    const { files } = importAvisoFiles(media, 'a1', [original], 'images')
    rmSync(path.join(root, 'pendrive'), { recursive: true })
    expect(resolveAvisoPaths(media, [files[0].relativePath])[0].exists).toBe(true)
  })

  it('recusa formato errado para o tipo e arquivo inexistente, sem parar os outros', () => {
    const result = importAvisoFiles(
      media,
      'a1',
      [source('ok.webp'), source('filme.mp4'), path.join(root, 'nao-existe.png')],
      'images',
    )
    expect(result.files.map((f) => f.name)).toEqual(['ok.webp'])
    expect(result.rejected).toEqual([
      { name: 'filme.mp4', reason: 'unsupported_format' },
      { name: 'nao-existe.png', reason: 'not_found' },
    ])
  })

  it('falha na cópia não deixa arquivo pela metade', () => {
    fsSpy.copyFileSync.mockImplementationOnce(() => {
      throw new Error('disco cheio')
    })
    const result = importAvisoFiles(media, 'a1', [source('a.png')], 'images')
    expect(result.files).toEqual([])
    expect(result.rejected).toEqual([{ name: 'a.png', reason: 'copy_failed' }])
    expect(readdirSync(avisoDir('a1'))).toEqual([])
  })

  it('aceita vídeo e apresentação (inclusive PDF) só nos tipos certos', () => {
    expect(importAvisoFiles(media, 'v1', [source('chamada.mp4')], 'video').files).toHaveLength(1)
    expect(importAvisoFiles(media, 'p1', [source('relatorio.pptx')], 'presentation').files).toHaveLength(1)
    expect(importAvisoFiles(media, 'p2', [source('relatorio.pdf')], 'presentation').files).toHaveLength(1)
    expect(importAvisoFiles(media, 'v2', [source('slides.pptx')], 'video').files).toHaveLength(0)
    expect(AVISOS_EXTENSIONS.presentation).toContain('pdf')
  })

  it('id inseguro ou tipo desconhecido é recusado sem criar nada', () => {
    expect(importAvisoFiles(media, '../fora', [source('a.png')], 'images')).toEqual({ ok: false, error: 'invalid_id' })
    expect(importAvisoFiles(media, 'a1', [source('a.png')], 'text')).toEqual({ ok: false, error: 'invalid_kind' })
    expect(existsSync(path.join(media, 'modulos'))).toBe(false)
  })
})

describe('copyAvisoFolder', () => {
  it('copia a pasta para o novo aviso e devolve o mapa de caminhos', () => {
    const { files } = importAvisoFiles(media, 'a1', [source('a.png'), source('b.png')], 'images')
    const result = copyAvisoFolder(media, 'a1', 'a2')
    expect(result.ok).toBe(true)
    for (const file of files) {
      const copied = result.paths[file.relativePath]
      expect(copied).toBe(file.relativePath.replace('/a1/', '/a2/'))
      expect(existsSync(path.join(media, ...copied.split('/')))).toBe(true)
    }
  })

  it('aviso sem pasta copia nada e dá certo', () => {
    expect(copyAvisoFolder(media, 'vazio', 'novo')).toEqual({ ok: true, paths: {} })
  })

  it('ids inseguros são recusados', () => {
    expect(copyAvisoFolder(media, '..', 'x')).toEqual({ ok: false, error: 'invalid_id' })
  })
})

describe('remoção', () => {
  it('removeAvisoFolder apaga a pasta do aviso e só ela', () => {
    importAvisoFiles(media, 'a1', [source('a.png')], 'images')
    importAvisoFiles(media, 'a2', [source('b.png')], 'images')
    expect(removeAvisoFolder(media, 'a1')).toEqual({ ok: true })
    expect(existsSync(avisoDir('a1'))).toBe(false)
    expect(existsSync(avisoDir('a2'))).toBe(true)
    expect(removeAvisoFolder(media, '../..')).toEqual({ ok: false, error: 'invalid_id' })
  })

  it('removeAvisoFiles apaga só arquivos dentro da pasta de avisos', () => {
    const { files } = importAvisoFiles(media, 'a1', [source('a.png'), source('b.png')], 'images')
    const outside = source('fora.png')
    const result = removeAvisoFiles(media, [files[0].relativePath, '../pendrive/fora.png', 'modulos/avisos/../../x'])
    expect(result).toEqual({ ok: true, removed: 1 })
    expect(existsSync(path.join(media, ...files[0].relativePath.split('/')))).toBe(false)
    expect(existsSync(path.join(media, ...files[1].relativePath.split('/')))).toBe(true)
    expect(existsSync(outside)).toBe(true)
  })
})

describe('resolveAvisoPaths', () => {
  it('devolve o caminho absoluto e se existe; caminho fora da pasta não resolve', () => {
    const { files } = importAvisoFiles(media, 'a1', [source('a.png')], 'images')
    const [ok, missing, outside] = resolveAvisoPaths(media, [
      files[0].relativePath,
      `${AVISOS_REL_DIR}/a1/sumiu.png`,
      '../segredo.txt',
    ])
    expect(ok).toEqual({ relativePath: files[0].relativePath, absolutePath: path.join(media, ...files[0].relativePath.split('/')), exists: true })
    expect(missing.exists).toBe(false)
    expect(outside).toEqual({ relativePath: '../segredo.txt', absolutePath: null, exists: false })
  })
})
