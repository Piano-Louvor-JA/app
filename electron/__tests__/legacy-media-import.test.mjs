// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  legacyMediaConfigCandidates,
  looksLikeLegacyMediaConfig,
  listMediaFilesUnder,
  scanLegacyMediaConfig,
  planLegacyMediaImport,
  detectLegacyMediaConfig,
  detectLegacyLanguage,
  analyzeLegacyMediaImport,
  resolveLegacyMediaConfigFromSelection,
  importLegacyMediaItems,
  createImportControl,
  IMAGE_EXTS,
  AUDIO_EXTS,
} from '../legacy-media-import.mjs'

function fakeIo(def) {
  /** @type {Map<string, { dirs: string[], files: Record<string, number> }>} */
  const flat = new Map()
  const register = (path, node) => {
    if (!flat.has(path)) flat.set(path, { dirs: [], files: {} })
    const entry = flat.get(path)
    for (const [name, sub] of Object.entries(node.dirs ?? {})) {
      entry.dirs.push(name)
      const child = path === '/' ? `/${name}` : `${path}/${name}`
      register(child, sub)
    }
    Object.assign(entry.files, node.files ?? {})
  }
  register('/', { dirs: def, files: {} })

  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  const splitPath = (p) => {
    const idx = p.lastIndexOf('/')
    return [p.slice(0, idx) || '/', p.slice(idx + 1)]
  }

  const exists = (p) => {
    const n = norm(p)
    if (flat.has(n)) return true
    const [dir, file] = splitPath(n)
    const node = flat.get(dir)
    return Boolean(node && (node.dirs.includes(file) || file in node.files))
  }
  const readdir = (p) => {
    const node = flat.get(norm(p))
    if (!node) throw new Error('ENOENT')
    return [...node.dirs, ...Object.keys(node.files)]
  }
  const stat = (p) => {
    const n = norm(p)
    if (flat.has(n)) return { isDirectory: () => true, size: 0 }
    const [dir, file] = splitPath(n)
    const node = flat.get(dir)
    if (!node) throw new Error('ENOENT')
    if (node.dirs.includes(file)) return { isDirectory: () => true, size: 0 }
    if (!(file in node.files)) throw new Error('ENOENT')
    return { isDirectory: () => false, size: node.files[file] }
  }
  const join = (...parts) => {
    const [head, ...rest] = parts
    if (rest.length === 0) return head
    return `${head.replace(/\/$/, '')}/${rest.join('/')}`
  }
  return { exists, readdir, stat, join }
}

describe('legacy-media-import', () => {
  it('lista candidatos com Louvor JA (espaço) antes de LouvorJA', () => {
    const list = legacyMediaConfigCandidates({
      programFiles: 'C:\\Program Files',
      programFilesX86: 'C:\\Program Files (x86)',
    })
    const firstX86 = list.find((p) => p.includes('Program Files (x86)'))
    expect(firstX86).toContain('Louvor JA')
    expect(list.some((p) => p.includes('LouvorJA') && p.endsWith('config'))).toBe(true)
  })

  it('reconhece pasta config com capas/imagens/musicas', () => {
    const io = fakeIo({
      config: {
        dirs: {
          capas: { dirs: {}, files: { '1992.bmp': 10 } },
          imagens: { dirs: {}, files: { 'adoradores_001.jpg': 5 } },
          musicas: {
            dirs: {
              '1992 - Brilha Jesus': { dirs: {}, files: { '01.mp3': 20 } },
            },
            files: {},
          },
        },
        files: {},
      },
    })
    expect(looksLikeLegacyMediaConfig('/config', io.exists, io.stat, io.join)).toBe(true)
  })

  it('escaneia flat capas/imagens e prefixa pt/ nas músicas de álbum', () => {
    const io = fakeIo({
      config: {
        dirs: {
          capas: { dirs: {}, files: { '1992.bmp': 100, 'adoradores.jpg': 80 } },
          imagens: {
            dirs: {},
            files: { 'adoradores_001.jpg': 50, 'readme.txt': 1 },
          },
          musicas: {
            dirs: {
              '1992 - Brilha Jesus': {
                dirs: {},
                files: { 'Nosso Sol.mp3': 200, 'capa.jpg': 9 },
              },
              Adoradores: { dirs: {}, files: { '01.mp3': 150 } },
            },
            files: {},
          },
        },
        files: { 'database.db': 999 },
      },
    })

    const scanned = scanLegacyMediaConfig('/config', { ...io, lang: 'pt' })
    expect(scanned.counts).toEqual({ covers: 2, slides: 1, music: 2 })
    expect(scanned.items.find((i) => i.relativePath === '1992.bmp')?.mediaType).toBe(
      'covers',
    )
    expect(
      scanned.items.find((i) => i.relativePath === 'adoradores_001.jpg')?.mediaType,
    ).toBe('slides')
    expect(
      scanned.items.some(
        (i) => i.relativePath === 'pt/1992 - Brilha Jesus/Nosso Sol.mp3',
      ),
    ).toBe(true)
    expect(
      scanned.items.some((i) => i.relativePath === 'pt/Adoradores/01.mp3'),
    ).toBe(true)
    // jpg dentro de álbum não entra como music
    expect(scanned.items.some((i) => i.relativePath.includes('capa.jpg'))).toBe(false)
  })

  it('usa es/ quando lang=es', () => {
    const io = fakeIo({
      config: {
        dirs: {
          musicas: {
            dirs: { Album: { dirs: {}, files: { 'a.mp3': 1 } } },
            files: {},
          },
        },
        files: {},
      },
    })
    const scanned = scanLegacyMediaConfig('/config', { ...io, lang: 'es' })
    expect(scanned.items[0].relativePath).toBe('es/Album/a.mp3')
  })

  it('detecta idioma via configPT/configES no AppData', () => {
    const io = fakeIo({
      AppData: {
        dirs: {
          Roaming: {
            dirs: {
              LouvorJA: { dirs: {}, files: { configES: 0 } },
            },
            files: {},
          },
        },
        files: {},
      },
    })
    expect(
      detectLegacyLanguage({
        appDataLouvorJa: '/AppData/Roaming/LouvorJA',
        exists: io.exists,
        join: io.join,
      }),
    ).toBe('es')
  })

  it('planeja só o que falta no destino com prefixo de idioma', () => {
    const items = [
      {
        mediaType: /** @type {const} */ ('music'),
        relativePath: 'pt/Album/a.mp3',
        absolutePath: '/src/a.mp3',
        bytes: 10,
      },
      {
        mediaType: /** @type {const} */ ('covers'),
        relativePath: '1992.bmp',
        absolutePath: '/src/1992.bmp',
        bytes: 5,
      },
    ]
    const plan = planLegacyMediaImport(items, {
      resolveDest: (type, rel) => `/dest/${type}/${rel}`,
      exists: (p) => p === '/dest/covers/1992.bmp',
    })
    expect(plan.present).toHaveLength(1)
    expect(plan.missing[0].relativePath).toBe('pt/Album/a.mp3')
  })

  it('analyze encontra config e aplica lang', () => {
    const io = fakeIo({
      legacy: {
        dirs: {
          config: {
            dirs: {
              capas: { dirs: {}, files: { 'x.bmp': 1 } },
              musicas: {
                dirs: { A: { dirs: {}, files: { 'a.mp3': 10 } } },
                files: {},
              },
            },
            files: {},
          },
        },
        files: {},
      },
    })

    const result = analyzeLegacyMediaImport({
      platform: 'linux',
      candidates: ['/legacy/config'],
      lang: 'pt',
      exists: io.exists,
      stat: io.stat,
      join: io.join,
      io,
      planOpts: {
        resolveDest: (_t, rel) => `/piano/${rel}`,
        exists: () => false,
      },
    })

    expect(result.found).toBe(true)
    expect(result.lang).toBe('pt')
    expect(result.missing).toBe(2)
    expect(result.itemsToImport.some((i) => i.relativePath === 'pt/A/a.mp3')).toBe(
      true,
    )
  })

  it('detect retorna not found fora do Windows sem candidates', () => {
    expect(detectLegacyMediaConfig({ platform: 'linux' }).found).toBe(false)
  })

  it('resolve seleção: pasta config, raiz do app, subpasta de mídia e aninhada', () => {
    const io = fakeIo({
      'Program Files (x86)': {
        dirs: {
          'Louvor JA': {
            dirs: {
              config: {
                dirs: {
                  capas: { dirs: {}, files: { 'a.bmp': 1 } },
                  imagens: { dirs: {}, files: {} },
                  musicas: { dirs: {}, files: {} },
                },
                files: {},
              },
            },
            files: {},
          },
        },
        files: {},
      },
      backup: {
        dirs: {
          copia: {
            dirs: {
              config: {
                dirs: {
                  musicas: {
                    dirs: { A: { dirs: {}, files: { 'a.mp3': 1 } } },
                    files: {},
                  },
                },
                files: {},
              },
            },
            files: {},
          },
        },
        files: {},
      },
    })

    expect(
      resolveLegacyMediaConfigFromSelection(
        '/Program Files (x86)/Louvor JA/config',
        io,
      ),
    ).toBe('/Program Files (x86)/Louvor JA/config')
    expect(
      resolveLegacyMediaConfigFromSelection('/Program Files (x86)/Louvor JA', io),
    ).toBe('/Program Files (x86)/Louvor JA/config')
    expect(
      resolveLegacyMediaConfigFromSelection(
        '/Program Files (x86)/Louvor JA/config/capas',
        io,
      ),
    ).toBe('/Program Files (x86)/Louvor JA/config')
    expect(resolveLegacyMediaConfigFromSelection('/backup', io)).toBe(
      '/backup/copia/config',
    )
    expect(resolveLegacyMediaConfigFromSelection('/backup/inexistente', io)).toBe(
      null,
    )
  })

  it('listMediaFilesUnder filtra por conjunto de extensões', () => {
    const io = fakeIo({
      musicas: {
        dirs: {},
        files: { 'ok.mp3': 1, 'no.jpg': 1, 'db.sqlite': 1 },
      },
    })
    expect(listMediaFilesUnder('/musicas', AUDIO_EXTS, io).map((f) => f.relativePath)).toEqual([
      'ok.mp3',
    ])
    expect(listMediaFilesUnder('/musicas', IMAGE_EXTS, io).map((f) => f.relativePath)).toEqual([
      'no.jpg',
    ])
  })
})

describe('legacy-media-import no Linux (pasta extraída do arquivo do site)', () => {
  it('encontra e planeja as mídias da pasta escolhida, em disco de verdade', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const root = mkdtempSync(join(tmpdir(), 'midias-louvorja-'))
    try {
      const config = join(root, 'Louvor JA', 'config')
      mkdirSync(join(config, 'capas'), { recursive: true })
      mkdirSync(join(config, 'imagens'), { recursive: true })
      mkdirSync(join(config, 'musicas', 'Hinario Adventista'), { recursive: true })
      writeFileSync(join(config, 'capas', 'capa.jpg'), 'x')
      writeFileSync(join(config, 'imagens', 'fundo.jpg'), 'xx')
      writeFileSync(join(config, 'musicas', 'Hinario Adventista', '001.mp3'), 'xxx')

      // O usuário escolhe a pasta extraída (a raiz do arquivo).
      const resolved = resolveLegacyMediaConfigFromSelection(root)
      expect(resolved).toBe(config)

      const report = analyzeLegacyMediaImport({
        platform: 'linux',
        candidates: [resolved],
        registryConfigProbe: () => null,
        lang: 'pt',
        planOpts: { exists: () => false, resolveDest: (type, rel) => `/destino/${type}/${rel}` },
      })
      expect(report.found).toBe(true)
      expect(report.counts).toEqual({ covers: 1, music: 1, slides: 1 })
      expect(report.itemsToImport.map((i) => i.relativePath).sort()).toEqual([
        'capa.jpg',
        'fundo.jpg',
        'pt/Hinario Adventista/001.mp3',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('legacy-media-import: pasta do PIANO baixada do site (Media/covers|images|music)', () => {
  async function makePianoDownload() {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const root = join(mkdtempSync(join(tmpdir(), 'piano-site-')), 'LouvorJA-PIANO')
    // Muitas pastas do Electron antes da Media (cache, sessão…), com subpastas.
    for (let i = 0; i < 40; i += 1) mkdirSync(join(root, `Cache${i}`, 'a', 'b'), { recursive: true })
    const media = join(root, 'Media')
    mkdirSync(join(media, 'covers'), { recursive: true })
    mkdirSync(join(media, 'images'), { recursive: true })
    mkdirSync(join(media, 'music', 'pt', '2006 - Sou de Jesus'), { recursive: true })
    mkdirSync(join(media, 'fontes', 'roboto'), { recursive: true })
    mkdirSync(join(media, 'modulos', 'sorteios'), { recursive: true })
    writeFileSync(join(media, 'covers', '2024.bmp'), 'x')
    writeFileSync(join(media, 'images', 'hasd_268B.jpg'), 'xx')
    writeFileSync(join(media, 'music', 'pt', '90108i.mp3'), 'xxx')
    writeFileSync(join(media, 'music', 'pt', '2006 - Sou de Jesus', '01.mp3'), 'xxxx')
    writeFileSync(join(media, 'fontes', 'roboto', 'face-0.woff2'), 'f')
    writeFileSync(join(media, 'modulos', 'sorteios', 'efeito.mp3'), 'm')
    return { root, media }
  }

  const planOpts = { exists: () => false, resolveDest: (type, rel) => `/destino/${type}/${rel}` }

  it('escolher a pasta baixada ou a própria Media acha as mídias', async () => {
    const { root, media } = await makePianoDownload()
    expect(resolveLegacyMediaConfigFromSelection(root)).toBe(media)
    expect(resolveLegacyMediaConfigFromSelection(media)).toBe(media)
    // Também escolhendo uma subpasta de mídia (ex.: Media/music).
    const { join } = await import('node:path')
    expect(resolveLegacyMediaConfigFromSelection(join(media, 'music'))).toBe(media)
  })

  it('importa capas, imagens e músicas no formato do PIANO (mantém pt/), sem fontes nem módulos', async () => {
    const { root } = await makePianoDownload()
    const report = analyzeLegacyMediaImport({
      platform: 'linux',
      candidates: [resolveLegacyMediaConfigFromSelection(root)],
      registryConfigProbe: () => null,
      lang: 'es',
      planOpts,
    })
    expect(report.found).toBe(true)
    expect(report.counts).toEqual({ covers: 1, music: 2, slides: 1 })
    expect(report.itemsToImport.map((i) => `${i.mediaType}:${i.relativePath}`).sort()).toEqual([
      'covers:2024.bmp',
      'music:pt/2006 - Sou de Jesus/01.mp3',
      'music:pt/90108i.mp3',
      'slides:hasd_268B.jpg',
    ])
  })

  it('música do PIANO sem pasta de idioma recebe o idioma', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const media = join(mkdtempSync(join(tmpdir(), 'piano-media-')), 'Media')
    mkdirSync(join(media, 'covers'), { recursive: true })
    mkdirSync(join(media, 'music', 'Album'), { recursive: true })
    writeFileSync(join(media, 'covers', 'c.jpg'), 'x')
    writeFileSync(join(media, 'music', 'Album', 'x.mp3'), 'x')
    const report = analyzeLegacyMediaImport({ platform: 'linux', candidates: [media], lang: 'pt', planOpts })
    expect(report.itemsToImport.find((i) => i.mediaType === 'music')?.relativePath).toBe('pt/Album/x.mp3')
  })

  it('uma pasta qualquer com só "images" não é confundida com mídia', async () => {
    const { mkdtempSync, mkdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'qualquer-'))
    mkdirSync(join(dir, 'images'))
    expect(resolveLegacyMediaConfigFromSelection(dir)).toBeNull()
  })
})

describe('importLegacyMediaItems: pausar, continuar e parar', () => {
  const items = ['a', 'b', 'c', 'd'].map((name) => ({
    mediaType: 'covers',
    relativePath: `${name}.jpg`,
    absolutePath: `/origem/${name}.jpg`,
    bytes: 1,
  }))

  it('copia tudo sem travar o processo (assíncrono) e informa o progresso', async () => {
    const copied = []
    const copy = async (_type, rel) => {
      copied.push(rel)
      return { ok: true, skipped: false }
    }
    const progress = []
    const result = await importLegacyMediaItems(items, (p) => progress.push(p.current), { copy })
    expect(result).toEqual({ imported: 4, skipped: 0, failed: 0, total: 4, cancelled: false })
    expect(copied).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
    expect(progress).toEqual([1, 2, 3, 4])
    const live = []
    await importLegacyMediaItems(items, (p) => live.push([p.imported, p.skipped]), { copy })
    // Contagem ao vivo (antes de cada arquivo).
    expect(live).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
  })

  it('pausado, espera entre um arquivo e outro; continuar retoma de onde parou', async () => {
    const control = createImportControl()
    const copied = []
    const copy = async (_type, rel) => {
      copied.push(rel)
      if (rel === 'b.jpg') control.pause()
      return { ok: true, skipped: false }
    }
    const running = importLegacyMediaItems(items, undefined, { copy, control })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(control.state).toBe('paused')
    expect(copied).toEqual(['a.jpg', 'b.jpg'])

    control.resume()
    const result = await running
    expect(copied).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
    expect(result.cancelled).toBe(false)
  })

  it('parar (mesmo pausado) encerra sem copiar o resto; o que já foi copiado fica', async () => {
    const control = createImportControl()
    const copied = []
    const copy = async (_type, rel) => {
      copied.push(rel)
      if (rel === 'b.jpg') control.pause()
      return { ok: true, skipped: false }
    }
    const running = importLegacyMediaItems(items, undefined, { copy, control })
    await new Promise((resolve) => setTimeout(resolve, 20))
    control.cancel()
    const result = await running
    expect(copied).toEqual(['a.jpg', 'b.jpg'])
    expect(result).toEqual({ imported: 2, skipped: 0, failed: 0, total: 4, cancelled: true })
    expect(control.state).toBe('cancelled')
  })

  it('falha e já existente entram na contagem', async () => {
    const copy = async (_type, rel) =>
      rel === 'a.jpg' ? { ok: true, skipped: true } : rel === 'b.jpg' ? { ok: false, skipped: false } : { ok: true, skipped: false }
    const result = await importLegacyMediaItems(items, undefined, { copy })
    expect(result).toEqual({ imported: 2, skipped: 1, failed: 1, total: 4, cancelled: false })
  })
})
