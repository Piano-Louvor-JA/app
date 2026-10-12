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
