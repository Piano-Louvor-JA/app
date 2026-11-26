// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createImportControl } from '../legacy-media-import.mjs'
import { importMediaArchive, isMediaArchive, mediaTargetOfArchivePath } from '../media-archive.mjs'

let hasTar = true
try {
  execFileSync('tar', ['--version'])
} catch {
  hasTar = false
}

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Monta um .tar.gz igual ao do site: pasta de dados do PIANO com cache + Media. */
function makeArchive({ format = 'gnu', longName = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'piano-tar-'))
  dirs.push(work)
  const root = join(work, 'LouvorJA-PIANO')
  mkdirSync(join(root, 'Cache', 'Cache_Data'), { recursive: true })
  writeFileSync(join(root, 'Cache', 'Cache_Data', 'abc_0'), 'cache')
  writeFileSync(join(root, 'remote-tokens.json'), '{"segredo":1}')
  const album = longName
    ? 'Hinário Adventista 2022 - Edição Comemorativa Completa Com Todos Os Hinos Cantados E Playbacks'
    : 'Hinário Adventista 2022'
  mkdirSync(join(root, 'Media', 'music', 'pt', album), { recursive: true })
  mkdirSync(join(root, 'Media', 'covers'), { recursive: true })
  mkdirSync(join(root, 'Media', 'images'), { recursive: true })
  mkdirSync(join(root, 'Media', 'fontes'), { recursive: true })
  writeFileSync(join(root, 'Media', 'music', 'pt', album, 'Eu Sei Por Que Nasci.mp3'), Buffer.alloc(1500, 7))
  writeFileSync(join(root, 'Media', 'music', 'pt', '90108i.mp3'), 'mp3')
  writeFileSync(join(root, 'Media', 'covers', '2024.bmp'), 'bmp')
  writeFileSync(join(root, 'Media', 'images', 'hasd_268B.jpg'), 'jpg')
  writeFileSync(join(root, 'Media', 'fontes', 'face.woff2'), 'font')
  const archive = join(work, 'LouvorJA-PIANO.tar.gz')
  execFileSync('tar', [`--format=${format}`, '-czf', archive, '-C', work, 'LouvorJA-PIANO'])
  const dest = join(work, 'destino')
  return { archive, dest, album }
}

const resolveDestIn = (dest) => (mediaType, relativePath) => join(dest, mediaType, relativePath)

function listFiles(dir, prefix = '') {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  )
}

describe('media-archive: importar o .tar.gz baixado do site', () => {
  it('reconhece o arquivo compactado pelo nome', () => {
    expect(isMediaArchive('/home/x/LouvorJA-PIANO.tar.gz')).toBe(true)
    expect(isMediaArchive('/home/x/LouvorJA-PIANO.TGZ')).toBe(true)
    expect(isMediaArchive('/home/x/LouvorJA-PIANO.tar')).toBe(true)
    expect(isMediaArchive('/home/x/LouvorJA-PIANO')).toBe(false)
    expect(isMediaArchive('/home/x/midia.zip')).toBe(false)
  })

  it('caminho dentro do arquivo → tipo e destino (PIANO e Louvor JA antigo)', () => {
    expect(mediaTargetOfArchivePath('LouvorJA-PIANO/Media/music/pt/Álbum/x.mp3', 'pt')).toEqual({
      mediaType: 'music',
      relativePath: 'pt/Álbum/x.mp3',
    })
    expect(mediaTargetOfArchivePath('LouvorJA-PIANO/Media/covers/2024.bmp', 'pt')).toEqual({
      mediaType: 'covers',
      relativePath: '2024.bmp',
    })
    expect(mediaTargetOfArchivePath('x/Media/images/a.jpg', 'pt')?.mediaType).toBe('slides')
    expect(mediaTargetOfArchivePath('Louvor JA/config/musicas/Album/x.mp3', 'es')).toEqual({
      mediaType: 'music',
      relativePath: 'es/Album/x.mp3',
    })
    // Cache, tokens, fontes, módulos e extensões fora de mídia ficam de fora.
    expect(mediaTargetOfArchivePath('LouvorJA-PIANO/Cache/Cache_Data/abc_0', 'pt')).toBeNull()
    expect(mediaTargetOfArchivePath('LouvorJA-PIANO/remote-tokens.json', 'pt')).toBeNull()
    expect(mediaTargetOfArchivePath('LouvorJA-PIANO/Media/fontes/face.woff2', 'pt')).toBeNull()
    expect(mediaTargetOfArchivePath('LouvorJA-PIANO/Media/music/pt/x.txt', 'pt')).toBeNull()
  })

  it('recusa caminhos de mídia que tentam escapar da pasta de destino', () => {
    expect(mediaTargetOfArchivePath('x/Media/music/pt/../../fora.mp3', 'pt')).toBeNull()
    expect(mediaTargetOfArchivePath('x/Media/covers/../fora.jpg', 'pt')).toBeNull()
    expect(mediaTargetOfArchivePath('x\\Media\\images\\..\\fora.png', 'pt')).toBeNull()
  })

  it.skipIf(!hasTar)('importa só as mídias, com acento, e informa o progresso em bytes', async () => {
    const { archive, dest, album } = makeArchive()
    const progress = []
    const result = await importMediaArchive(archive, (p) => progress.push(p), {
      resolveDest: resolveDestIn(dest),
      lang: 'pt',
      progressEveryMs: 0,
    })
    expect(result).toEqual({ imported: 4, skipped: 0, failed: 0, total: 4, cancelled: false })
    expect(listFiles(dest).sort()).toEqual([
      'covers/2024.bmp',
      `music/pt/${album}/Eu Sei Por Que Nasci.mp3`,
      'music/pt/90108i.mp3',
      'slides/hasd_268B.jpg',
    ].sort())
    expect(readFileSync(join(dest, 'music', 'pt', album, 'Eu Sei Por Que Nasci.mp3'))).toEqual(Buffer.alloc(1500, 7))
    const last = progress.at(-1)
    expect(last.unit).toBe('bytes')
    expect(last.current).toBe(last.total)
    // Contagem ao vivo: gravadas e já existentes.
    expect(last).toMatchObject({ imported: 4, skipped: 0 })
    expect(progress.some((p) => p.relativePath.endsWith('90108i.mp3'))).toBe(true)
  })

  it.skipIf(!hasTar)('nomes longos (pax e GNU) e o que já existe é pulado', async () => {
    for (const format of ['pax', 'gnu']) {
      const { archive, dest, album } = makeArchive({ format, longName: true })
      mkdirSync(join(dest, 'covers'), { recursive: true })
      writeFileSync(join(dest, 'covers', '2024.bmp'), 'já estava')
      const result = await importMediaArchive(archive, undefined, { resolveDest: resolveDestIn(dest), lang: 'pt' })
      expect(result).toMatchObject({ imported: 3, skipped: 1, failed: 0 })
      expect(existsSync(join(dest, 'music', 'pt', album, 'Eu Sei Por Que Nasci.mp3'))).toBe(true)
      expect(readFileSync(join(dest, 'covers', '2024.bmp'), 'utf8')).toBe('já estava')
    }
  })

  it.skipIf(!hasTar)('não sobrescreve um temporário preexistente no destino', async () => {
    const { archive, dest } = makeArchive()
    const oldPart = join(dest, 'covers', '2024.bmp.part')
    mkdirSync(join(dest, 'covers'), { recursive: true })
    writeFileSync(oldPart, 'arquivo de outra operação')

    const result = await importMediaArchive(archive, undefined, { resolveDest: resolveDestIn(dest) })

    expect(result.failed).toBe(0)
    expect(result.imported).toBeGreaterThan(0)
    expect(readFileSync(oldPart, 'utf8')).toBe('arquivo de outra operação')
    expect(listFiles(dest).filter((file) => file.endsWith('.part'))).toEqual(['covers/2024.bmp.part'])
  })

  it.skipIf(!hasTar)('parar no meio: não deixa arquivo pela metade nem sobra temporário', async () => {
    const { archive, dest } = makeArchive()
    const control = createImportControl()
    const result = await importMediaArchive(
      archive,
      (p) => {
        if (p.relativePath.endsWith('.mp3') || p.relativePath.endsWith('.bmp')) control.cancel()
      },
      { resolveDest: resolveDestIn(dest), lang: 'pt', control, progressEveryMs: 0 },
    )
    expect(result.cancelled).toBe(true)
    expect(result.imported).toBeLessThan(4)
    expect(listFiles(dest).some((f) => f.endsWith('.part'))).toBe(false)
  })

  it('arquivo que não é tar.gz válido: falha sem travar', async () => {
    const work = mkdtempSync(join(tmpdir(), 'piano-bad-'))
    dirs.push(work)
    const bad = join(work, 'quebrado.tar.gz')
    writeFileSync(bad, 'isto não é gzip')
    await expect(importMediaArchive(bad, undefined, { resolveDest: resolveDestIn(work), lang: 'pt' })).rejects.toThrow()
  })
})

describe('media-archive: conferir o arquivo antes de importar', () => {
  it.skipIf(!hasTar)('acha mídia sem ler o arquivo inteiro e sem gravar nada', async () => {
    const { archive, dest } = makeArchive()
    const { peekMediaArchive } = await import('../media-archive.mjs')
    const peek = await peekMediaArchive(archive)
    expect(peek.found).toBe(true)
    expect(peek.totalBytes).toBeGreaterThan(0)
    expect(existsSync(dest)).toBe(false)
  })

  it.skipIf(!hasTar)('arquivo sem mídias do PIANO: não encontrado', async () => {
    const work = mkdtempSync(join(tmpdir(), 'piano-nomedia-'))
    dirs.push(work)
    mkdirSync(join(work, 'coisas'))
    writeFileSync(join(work, 'coisas', 'nota.txt'), 'x')
    const archive = join(work, 'outro.tar.gz')
    execFileSync('tar', ['-czf', archive, '-C', work, 'coisas'])
    const { peekMediaArchive } = await import('../media-archive.mjs')
    expect((await peekMediaArchive(archive)).found).toBe(false)
  })

  it('arquivo inválido: não encontrado (sem exceção)', async () => {
    const work = mkdtempSync(join(tmpdir(), 'piano-bad2-'))
    dirs.push(work)
    const bad = join(work, 'quebrado.tar.gz')
    writeFileSync(bad, 'nada')
    const { peekMediaArchive } = await import('../media-archive.mjs')
    expect((await peekMediaArchive(bad)).found).toBe(false)
  })
})

describe('media-archive: contagem ao vivo', () => {
  it.skipIf(!hasTar)('o progresso traz gravadas e já existentes enquanto lê', async () => {
    const { archive, dest } = makeArchive()
    mkdirSync(join(dest, 'covers'), { recursive: true })
    writeFileSync(join(dest, 'covers', '2024.bmp'), 'já estava')
    const progress = []
    await importMediaArchive(archive, (p) => progress.push(p), { resolveDest: resolveDestIn(dest), lang: 'pt', progressEveryMs: 0 })
    expect(progress.at(-1)).toMatchObject({ imported: 3, skipped: 1 })
    // Os números só crescem.
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i].imported).toBeGreaterThanOrEqual(progress[i - 1].imported)
      expect(progress[i].current).toBeGreaterThanOrEqual(progress[i - 1].current)
    }
  })
})
