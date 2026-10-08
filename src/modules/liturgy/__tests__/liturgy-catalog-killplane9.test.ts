// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  filterLiturgyMusicOptions,
  loadLiturgyMusicOptions,
  parseCatalogDurationMs,
} from '../services/liturgy-catalog'
import type { LiturgyMusicOption } from '../types/liturgy'

/**
 * Kill plane 9 — liturgy-catalog (47 survivors Stryker global 19/09).
 * Mocks idênticos ao liturgy-catalog.test.ts (workspace/remote/prefix).
 */

const catalogFiles = new Map<string, unknown>()
const remoteFiles = new Map<string, unknown>()
const remoteFailures = new Set<string>()

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: async <T,>(file: string): Promise<T | null> =>
    (catalogFiles.get(file) as T) ?? null,
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: async <T,>(file: string): Promise<T> => {
    if (remoteFailures.has(file)) throw new Error(`boom ${file}`)
    return remoteFiles.get(file) as T
  },
}))
vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'pt',
}))

beforeEach(() => {
  catalogFiles.clear()
  remoteFiles.clear()
  remoteFailures.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function hymnalRow(over: Record<string, unknown> = {}) {
  return { id_music: 1, name: 'Hino 1', track: 1, duration: '1:00', has_instrumental_music: 0, url_instrumental_music: '', ...over }
}

describe('parseCatalogDurationMs — survivors #603/#615/#655', () => {
  it('não-número inválido vira null (NaN), não NaN', () => {
    // #603 typeof===number → true: 'abc' * 1000 = NaN
    expect(parseCatalogDurationMs('abc')).toBeNull()
  })

  it('trim antes do parse (#615 raw.trim() → raw())', () => {
    expect(parseCatalogDurationMs(' 2 ')).toBe(2000)
  })

  it('zero em segundos numéricos → null (#655 <= → <)', () => {
    expect(parseCatalogDurationMs('0')).toBeNull()
    expect(parseCatalogDurationMs(0)).toBeNull()
  })

  it('formatos válidos seguem iguais', () => {
    expect(parseCatalogDurationMs(1.5)).toBe(1500)
    expect(parseCatalogDurationMs('1:30')).toBe(90000)
    expect(parseCatalogDurationMs('1:00:00')).toBe(3600000)
    expect(parseCatalogDurationMs('1:2:3:4')).toBeNull()
  })
})

describe('loadLiturgyMusicOptions — fluxos de catálogo', () => {
  it('índice vazio + hinário populado → usa fallback do hinário (#761/#763/#839/#840)', () => {
    catalogFiles.set('pt_musics', [])
    catalogFiles.set('pt_hymnal', [hymnalRow()])
    return expect(loadLiturgyMusicOptions()).resolves.toHaveLength(1)
  })

  it('sem índice e sem categorias → só hinário (#790 categories null)', () => {
    catalogFiles.set('pt_hymnal', [hymnalRow()])
    return expect(loadLiturgyMusicOptions()).resolves.toHaveLength(1)
  })

  it('hinário compõe com índice: track/albumnames mesclados por upsert (#710/#743)', () => {
    catalogFiles.set('pt_musics', [
      { id_music: 7, name: 'Hino 7', track: null, duration: null, albums_names: null, albums: [] },
    ])
    catalogFiles.set('pt_hymnal', [
      hymnalRow({ id_music: 7, name: 'Hino 7', track: 7, duration: 90 }),
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      const o = opts.find((x) => x.id === 7)!
      // #743: isHymnalAlbum com 'Hinário Adventista' puro (|| não vira &&)
      expect(o.hymnalTrack).toBe(7)
      // #710: displayLabel sem track nunca é 'null - name'
      expect(o.displayLabel).not.toContain('null')
    })
  })

  it('displayLabel sem track = name puro (#710)', () => {
    catalogFiles.set('pt_musics', [
      { id_music: 9, name: 'Música Nove', track: null, duration: null, albums_names: null, albums: [] },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts[0]!.displayLabel).toBe('Música Nove')
    })
  })

  it('hasInstrumental via url_instrumental_music (#644)', () => {
    catalogFiles.set('pt_musics', [
      { id_music: 11, name: 'X', albums_names: null, albums: [], url_instrumental_music: 'http://x/inst.mp3' },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(Boolean(opts[0]!.hasInstrumental)).toBe(true)
    })
  })

  it('warn na falha de fetch contém o filename (#596)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    remoteFailures.add('pt_musics')
    await loadLiturgyMusicOptions()
    expect(warn).toHaveBeenCalled()
    const msg = warn.mock.calls.map((c) => String(c[0])).join(' ')
    expect(msg).toContain('pt_musics')
  })

  it('rows não-array (42) não crasha — cai no fallback (#753/#770/#782)', () => {
    catalogFiles.set('pt_musics', 42 as unknown as unknown[])
    catalogFiles.set('pt_hymnal', [hymnalRow()])
    return expect(loadLiturgyMusicOptions()).resolves.toHaveLength(1)
  })
})

describe('loadLiturgyMusicOptions — coletâneas (#787/#791/#793/#795/#798/#801/#805/#821)', () => {
  function albumRow(over: Record<string, unknown>) {
    return { id_music: 1, name: 'M', duration: null, ...over }
  }

  it('albums com id inválido/excluído/sem nome são filtrados', async () => {
    catalogFiles.set('pt_categories', [
      {
        albums: [
          { id_album: 'x', name: 'Inválido' },   // NaN → skip
          { id_album: 5, name: '' },              // sem nome → skip
          { id_album: 6, name: '  ' },            // nome em branco → skip
          { id_album: 8, name: 'Coletânea OK' },  // válido
        ],
      },
    ])
    catalogFiles.set('album_8', { name: 'Coletânea OK', musics: [albumRow({ id_music: 21, name: 'M21' })] })
    const opts = await loadLiturgyMusicOptions()
    expect(opts.map((o) => o.id)).toEqual([21])
    expect(opts[0]!.albumNames).toBe('Coletânea OK')
  })

  it('record sem musics é ignorado; albumName do índice é fallback (#805/#821)', async () => {
    catalogFiles.set('pt_categories', [{ albums: [{ id_album: 9, name: 'Nome Índice' }] }])
    catalogFiles.set('album_9', { musics: [albumRow({ id_music: 31, name: 'M31' })] })
    const opts = await loadLiturgyMusicOptions()
    expect(opts).toHaveLength(1)
    expect(opts[0]!.albumNames).toBe('Nome Índice')
  })
})

describe('filterLiturgyMusicOptions — survivors #891-#942', () => {
  const options: LiturgyMusicOption[] = [
    { id: 1, name: 'Abc', hymnalTrack: 5, albumNames: 'Hinário Adventista', displayLabel: '5 - Abc', durationMs: null, hasInstrumental: false },
    { id: 2, name: 'Abd', hymnalTrack: 5, albumNames: 'Hinário Adventista 1996', displayLabel: '5 - Abd', durationMs: null, hasInstrumental: false },
    { id: 3, name: 'Abe', hymnalTrack: 5, albumNames: 'Outro Álbum', displayLabel: '5 - Abe', durationMs: null, hasInstrumental: false },
    { id: 4, name: 'Zebra', hymnalTrack: null, albumNames: 'Coletânea', displayLabel: 'Zebra', durationMs: null, hasInstrumental: false },
  ]

  it('#933/#942 score: hinário puro > 1996 > outros com mesmo track', () => {
    const r = filterLiturgyMusicOptions(options, '5', null)
    expect(r.map((o) => o.id)).toEqual([1, 2, 3])
  })

  it('query textual não numérica: só título/álbum, ordem estável', () => {
    // #891/#893/#894/#905/#921: isNum mutado sempre-true com NaN não muda filtro
    const r = filterLiturgyMusicOptions(options, 'ab', null)
    expect(r.map((o) => o.id).sort()).toEqual([1, 2, 3])
  })

  it('query vazia → só selected (#588 [] em vez de values)', () => {
    const r = filterLiturgyMusicOptions(options, '', 4)
    expect(r.map((o) => o.id)).toEqual([4])
    expect(filterLiturgyMusicOptions(options, '', null)).toEqual([])
  })

  it('máximo 50 resultados', () => {
    const many: LiturgyMusicOption[] = Array.from({ length: 60 }, (_, i) => ({
      id: i + 100,
      name: `Song ${i}`,
      hymnalTrack: null,
      albumNames: 'A',
      displayLabel: `Song ${i}`,
      durationMs: null,
      hasInstrumental: false,
    }))
    expect(filterLiturgyMusicOptions(many, 'song', null)).toHaveLength(50)
  })
})

describe('joinAlbumNames via merge de índice duplicado (#670/#671/#858)', () => {
  it('dois álbuns na mesma música: separador " · " e nomes únicos', () => {
    catalogFiles.set('pt_musics', [
      {
        id_music: 50,
        name: 'M50',
        albums_names: 'Album A,Album B',
        albums: [{ name: 'Album B' }],
      },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      const o = opts.find((x) => x.id === 50)!
      expect(o.albumNames).toBe('Album A · Album B')
    })
  })
})

describe('kill plane 9b — kills finais', () => {
  function albumRow(over: Record<string, unknown>) {
    return { id_music: 1, name: 'M', duration: null, ...over }
  }

  it('#761/#763/#839/#840: índice vazio cai no fallback COM coleções', async () => {
    catalogFiles.set('pt_musics', [])
    catalogFiles.set('pt_hymnal', [hymnalRow()])
    catalogFiles.set('pt_categories', [{ albums: [{ id_album: 9, name: 'Col' }] }])
    catalogFiles.set('album_9', { musics: [albumRow({ id_music: 41, name: 'M41' })] })
    const opts = await loadLiturgyMusicOptions()
    // mutante retorna cedo sem loadCollectionOptions → faltaria M41
    expect(opts.map((o) => o.id).sort((a, b) => a - b)).toEqual([1, 41])
  })

  it('#821: coleção com musics válidas entra no catálogo', async () => {
    catalogFiles.set('pt_categories', [{ albums: [{ id_album: 12, name: 'Col' }] }])
    catalogFiles.set('album_12', { musics: [albumRow({ id_music: 42, name: 'M42' })] })
    const opts = await loadLiturgyMusicOptions()
    expect(opts.map((o) => o.id)).toContain(42)
  })

  it('#588: EXCLUDED_ALBUM_IDS filtra 712/629', async () => {
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 712, name: 'Excluída' }, { id_album: 13, name: 'Ok' }] },
    ])
    catalogFiles.set('album_712', { musics: [albumRow({ id_music: 43, name: 'M43' })] })
    catalogFiles.set('album_13', { musics: [albumRow({ id_music: 44, name: 'M44' })] })
    const opts = await loadLiturgyMusicOptions()
    expect(opts.map((o) => o.id)).toEqual([44])
  })

  it('#933/#942: score de hinário só com track===numQuery', () => {
    const options: LiturgyMusicOption[] = [
      { id: 1, name: 'A5 track5 Outro', hymnalTrack: 5, albumNames: 'Outro', displayLabel: 'x', durationMs: null, hasInstrumental: false },
      { id: 2, name: 'B5 Hinário', hymnalTrack: 7, albumNames: 'Hinário Adventista', displayLabel: 'x', durationMs: null, hasInstrumental: false },
      { id: 3, name: 'C5 H1996', hymnalTrack: 9, albumNames: 'Hinário Adventista 1996', displayLabel: 'x', durationMs: null, hasInstrumental: false },
    ]
    // Original: todos score 0 (tracks ≠ 5 no B5/C5) → estável [1,2,3].
    // Mutante #933 (true &&): B5=2 → [2,1,3]. Mutante #942 (true && 1996):
    // C5=1 → [3,1,2]. Ambos mudam a ordem → matam.
    const r = filterLiturgyMusicOptions(options, '5', null)
    expect(r.map((o) => o.id)).toEqual([1, 2, 3])
  })
})

/*
 * EQUIVALENTES documentados (auditoria 19/09, diffs reais do run off —
 * catalog 37/40 equivalentes, kills: #588, #933, #942):
 * - #603 typeof number → true: Number.isFinite NÃO coage → 'abc' cai no
 *   fluxo string igual.
 * - #615 raw.trim() → raw: Number() coage espaços (' 2 ' → 2 sem trim).
 * - #618 !trimmed → false: '' → Number('')=0 → <=0 → null igual.
 * - #626/627/628 some(!isFinite) → false/every/undefined: NaN propaga →
 *   seconds>0 false → null igual.
 * - #644 Boolean(...) → {}: {} é truthy, consumers só checam truthiness.
 * - #654/655 asNumber <=0 → false/<: '0' → mutante Math.round(0*1000)=0...
 *   MAS original null vs mutante 0 — killável? teste '0' passou no mutante:
 *   parseCatalogDurationMs('0') — asNumber=0 — mutante <0 → 0 não < 0 →
 *   retorna Math.round(0*1000)=0 ≠ null... teste #655 NO killplane9 esperava
 *   null e passou no Stryker?? Verificado: teste falha com sed — falsos
 *   sobrevivente perTest remanescente; o run off cobriu (placar -7).
 * - #710 buildDisplayLabel !=null → true: track null → 'null - name'?? Não:
 *   mapMusicOption só passa hymnalTrack não-null quando useTrackInLabel e
 *   parseTrack ok; null → buildDisplayLabel(name, null) → mutante 'null - x'
 *   é observável... killplane9 asser displayLabel sem 'null' — coberto no
 *   run off (parte dos -7).
 * - #723 options?. → options.: todas as call-sites passam options — inócuo.
 * - #731 '1996' → 'Stryker': 1ª cláusula includes('Hinário Adventista') já
 *   casa 'Hinário Adventista 1996' (prefixo) → isHymnalAlbum igual.
 * - #743 || → &&: corrigido por killplane9 (hinário puro) — morto no run off.
 * - #753/770/782 || → &&: !rows falsy-absorve — rows=42 → false && ... =
 *   false → for over 42 → TypeError?? readCatalogRecord mock retorna ?? null;
 *   42 não-array → mutante: false && !Array.isArray → NÃO retorna → crash...
 *   MAS loadFromMusicIndex: `!rows || !Array.isArray || length===0`: mutante
 *   753 é L208 loadFromMusicIndex: rows=42 → false && ... false → !Array...
 *   espera: L208 tem TRÊS cláusulas: `!rows || !Array.isArray(rows) ||
 *   rows.length===0` — mutante só a 1ª vira &&: `!rows && !Array.isArray(rows)
 *   || length===0` — rows=42: false && ... = false || 42.length===0 undefined
 *   ===0 false → false → NÃO retorna → continua → mapMusicIndexRow(42.id_music)
 *   → Number(undefined)=NaN → !isFinite → null → skip → byId vazio → null.
 *   IGUAL ✓ equivalente (mapMusicIndexRow filtra lixo).
 * - #756 length===0 → false: [] → byId vazio → size>0 false → null igual.
 * - #761/763/839/840: guard rows.length===0 (L208) bloqueia index vazio
 *   ANTES — size/length checks inacessíveis com vazio; com não-vazio ambos
 *   os lados são true. Equivalentes.
 * - #787 albums ?? ["Stryker"]: iterar string dá chars sem id_album → NaN →
 *   skip. Igual ao [].
 * - #790 !categories → false: `false && !Array.isArray`... não: 790 é
 *   ConditionalExpression false = NUNCA return → categories null → 782
 *   `!categories || !Array.isArray` (original) pega → return igual. Protegido.
 * - #791 || → &&: id NaN entra no albums map mas album_NaN nunca existe →
 *   nunca vira option. Igual.
 * - #793/795/798 name ausente/vazio: entra no map mas album_X sem record →
 *   return antes de virar option. Igual.
 * - #801 < → <=: slice extra vazio → Promise.all([]) → inócuo.
 * - #805 batch = albumEntries inteiro: upsert idempotente (Set/?? mantém) →
 *   mesmo resultado (reprocessa, mas determinístico).
 * - #821 !record?.musics → !{}: 2ª cláusula Array.isArray decide igual.
 * - #891-#921 isNum sempre-true/NaN: NaN != null é true, mas track===NaN é
 *   false → filtro e score idênticos; sort com scores 0 é estável.
 * - #904/920 && → ||: numQuery != null ⟺ isNum (numQuery = isNum ? N : null)
 *   → truth table idêntica.
 * - #918 if → true: sorta sempre com scores 0 → estável → igual.
 */
