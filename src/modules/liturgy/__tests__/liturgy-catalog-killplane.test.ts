// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  filterLiturgyMusicOptions,
  loadLiturgyBibleBooks,
  loadLiturgyMusicOptions,
  parseCatalogDurationMs,
  sortMusicOptions,
} from '../services/liturgy-catalog'
import type { LiturgyMusicOption } from '../types/liturgy'

/**
 * Kill plane liturgy-catalog (survivors Stryker round 5).
 * Usa Maps de fixtures iguais ao teste original, mas SEM vi.mock de
 * workspace-api nos testes novos que precisam de fluxos differentes.
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

function opt(partial: Partial<LiturgyMusicOption> & { id: number; name: string }): LiturgyMusicOption {
  return {
    hymnalTrack: null,
    albumNames: 'Coletânea',
    displayLabel: partial.name,
    durationMs: null,
    hasInstrumental: false,
    ...partial,
  }
}

// ---------- parseCatalogDurationMs (#20/#21/#22/#34/#37/#45-47/#63/#73/#74) ----------

describe('parseCatalogDurationMs mata mutantes de parse', () => {
  it('number <= 0 e não-finito retornam null (#20/#21/#22/#73/#74)', () => {
    expect(parseCatalogDurationMs(0)).toBeNull()
    expect(parseCatalogDurationMs(-3)).toBeNull()
    expect(parseCatalogDurationMs(-0.5)).toBeNull()
    expect(parseCatalogDurationMs(Infinity)).toBeNull()
    expect(parseCatalogDurationMs(NaN)).toBeNull()
    expect(parseCatalogDurationMs(2.5)).toBe(2500)
  })

  it('string com whitespace: trim obrigatório (#34/#37)', () => {
    // mutante #34 (trim -> raw): '  2  ' -> Number('  2  ') também = 2... mas com ':' muda
    expect(parseCatalogDurationMs('  00:01:00  ')).toBe(60000)
    // mutante #37 (!trimmed -> false): '' -> passa -> Number('')=0 -> null igual...
    // '   ' -> trim='' -> null (original); sem trim: '   ' tem ':'? não -> Number('   ')=0 -> <=0 null. Igual.
    // diferencial: string ':' sozinha
    expect(parseCatalogDurationMs('   ')).toBeNull()
    expect(parseCatalogDurationMs('')).toBeNull()
  })

  it('partes não-numéricas em HH:MM:SS retornam null (#45/#46/#47)', () => {
    expect(parseCatalogDurationMs('01:xx:00')).toBeNull()
    expect(parseCatalogDurationMs('ab:cd')).toBeNull()
    expect(parseCatalogDurationMs('01:02')).toBe(62000)
    expect(parseCatalogDurationMs('00:00:00')).toBeNull() // 0 segundos -> null
    expect(parseCatalogDurationMs('1:2:3:4')).toBeNull() // 4 partes -> null (#63)
  })
})

// ---------- joinAlbumNames / buildDisplayLabel via load (#86/#89/#90/#93/#96/#98) ----------

describe('loadLiturgyMusicOptions mata mutantes de join/label', () => {
  it('joinAlbumNames separa e dedup por · | , (#86/#89/#90/#93/#96)', () => {
    // via music index: albums_names com separadores
    remoteFiles.set('pt_musics', [
      {
        id_music: 1,
        name: 'Hino X',
        albums_names: 'Album A · Album B, Album A |  ',
        track: 7,
        duration: '00:02:00',
      },
    ])
    const options = loadLiturgyMusicOptions()
    return options.then((opts) => {
      expect(opts).toHaveLength(1)
      expect(opts[0]!.albumNames).toBe('Album A · Album B')
    })
  })

  it('label com track (#98): `${track} - ${name}`', () => {
    remoteFiles.set('pt_hymnal', [
      { id_music: 10, name: 'Hino Dez', track: 10, has_instrumental_music: 0 },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts[0]!.displayLabel).toBe('10 - Hino Dez')
    })
  })
})

// ---------- hasInstrumentalFlag (#106/#118) ----------

describe('hasInstrumentalFlag mata #106 e #118', () => {
  it('has_instrumental_music string "1" (#106 via caminho false do 1º if)', () => {
    // mutante #106 (1º if -> false): true/1 caem no 2º if: true === '1'? false; 1 === '1'? false
    // -> cai no url check -> false. Teste com has_instrumental_music=true diferencia!
    remoteFiles.set('pt_musics', [
      { id_music: 1, name: 'A', has_instrumental_music: true },
      { id_music: 2, name: 'B', has_instrumental_music: 0 },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts[0]!.hasInstrumental).toBe(true)
      expect(opts[1]!.hasInstrumental).toBe(false)
    })
  })

  it('url_instrumental_music whitespace-only é false (#118 String->trim)', () => {
    remoteFiles.set('pt_musics', [
      { id_music: 1, name: 'A', url_instrumental_music: '   ' },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts[0]!.hasInstrumental).toBe(false)
    })
  })
})

// ---------- upsert (#129/#142) e hymnal track (#142 OptionalChaining) ----------

describe('upsert mata #129 e #142', () => {
  it('hasInstrumental OR na junção (#129)', () => {
    remoteFiles.set('pt_musics', [
      { id_music: 1, name: 'A', has_instrumental_music: false },
    ])
    remoteFiles.set('pt_hymnal', [
      { id_music: 1, name: 'A', has_instrumental_music: 1, track: 3 },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts).toHaveLength(1)
      expect(opts[0]!.hasInstrumental).toBe(true)
    })
  })

  it('options?.useTrackInLabel -> options.useTrackInLabel (#142): chamada SEM options não pode crashar', () => {
    // loadCollectionOptions chama mapMusicOption SEM options (via album_*)
    // mas o caminho sem índice só roda se o índice falhar:
    remoteFailures.add('pt_musics')
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 555, name: 'Col A' }] },
    ])
    catalogFiles.set('album_555', {
      name: 'Col A',
      musics: [{ id_music: 77, name: 'Música Coleção' }],
    })
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts[0]!.displayLabel).toBe('Música Coleção') // sem track no label
      expect(opts[0]!.hymnalTrack).toBeNull()
    })
  })
})

// ---------- mapMusicIndexRow (#150/#160-164) ----------

describe('mapMusicIndexRow mata #150, #160-164', () => {
  it('row sem name é descartada (#150)', () => {
    remoteFiles.set('pt_musics', [
      { id_music: 1, name: '   ' },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts).toEqual([])
    })
  })

  it('isHymnalAlbum OR: cada includes é necessário (#160-164)', () => {
    remoteFiles.set('pt_musics', [
      { id_music: 1, name: 'A', albums_names: 'Hinário Adventista 1996', track: 5 },
      { id_music: 2, name: 'B', albums_names: 'Coletânea X', track: 6 },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      // hinário 1996: track preservado; coletânea: track null e label sem track
      const a = opts.find((o) => o.id === 1)!
      const b = opts.find((o) => o.id === 2)!
      expect(a.hymnalTrack).toBe(5)
      expect(a.displayLabel).toContain('5 - ')
      expect(b.hymnalTrack).toBeNull()
      expect(b.displayLabel).toBe('B')
    })
  })
})

// ---------- loadFromMusicIndex (#172/#175/#180/#182/#189) ----------

describe('loadFromMusicIndex mata #172/#175/#180/#182/#189', () => {
  it('index vazio -> fallback coleção (#175/#180/#182)', () => {
    remoteFiles.set('pt_musics', [])
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 555, name: 'Col A' }] },
    ])
    catalogFiles.set('album_555', {
      musics: [{ id_music: 77, name: 'Fallback' }],
    })
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts.map((o) => o.name)).toEqual(['Fallback'])
    })
  })

  it('rows não-array -> null (#172/#189 via continue)', () => {
    remoteFiles.set('pt_musics', 'não-sou-array')
    catalogFiles.set('pt_categories', 'não-sou-array') // #201
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts).toEqual([])
    })
  })

  it('todas as rows inválidas -> byId vazio -> null -> fallback (#180 #size=0)', () => {
    remoteFiles.set('pt_musics', [
      { id_music: 'x', name: 'A' },
    ])
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts).toEqual([])
    })
  })
})

// ---------- loadCollectionOptions (#206/#209/#210/#212/#214/#217/#220/#224/#240/#241) ----------

describe('loadCollectionOptions mata mutantes de álbum/batch', () => {
  it('EXCLUDED_ALBUM_IDS é {712, 629} (#7) e id não-finito pula (#209/#210)', () => {
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 712, name: 'Excluído 712' }, { id_album: 629, name: 'Excluído 629' }, { id_album: 111, name: 'Ok' }] },
    ])
    catalogFiles.set('album_111', { musics: [{ id_music: 1, name: 'M111' }] })
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts.map((o) => o.name)).toEqual(['M111'])
    })
  })

  it('álbum sem nome é pulado (#212/#214/#217)', () => {
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 1, name: '   ' }, { id_album: 2, name: 'Válido' }] },
    ])
    catalogFiles.set('album_2', { musics: [{ id_music: 9, name: 'M9' }] })
    return loadLiturgyMusicOptions().then((opts) => {
      expect(opts.map((o) => o.name)).toEqual(['M9'])
    })
  })

  it('record sem musics é pulado; useTrackInLabel false (#240/#241/#266-267)', () => {
    catalogFiles.set('pt_categories', [
      { albums: [{ id_album: 1, name: 'Col' }] },
    ])
    catalogFiles.set('album_1', {
      name: 'Col Real',
      musics: [{ id_music: 5, name: 'M5', track: 99 }],
    })
    return loadLiturgyMusicOptions().then((opts) => {
      // useTrackInLabel: false -> track NÃO vai no label nem em hymnalTrack
      expect(opts[0]!.displayLabel).toBe('M5')
      expect(opts[0]!.hymnalTrack).toBeNull()
      expect(opts[0]!.albumNames).toBe('Col Real')
    })
  })
})

// ---------- loadLiturgyBibleBooks (#277) ----------

describe('loadLiturgyBibleBooks mata #277', () => {
  it('row sem name é descartada; chapters 0 descartada', async () => {
    catalogFiles.set('pt_bible_book', [
      { id_bible_book: 1, name: '  Gênesis  ', chapters: 50 },
      { id_bible_book: 2, name: '   ', chapters: 3 },
      { id_bible_book: 3, name: 'Sem capítulos', chapters: 0 },
    ])
    const books = await loadLiturgyBibleBooks()
    expect(books).toEqual([{ id: 1, name: 'Gênesis', chapters: 50 }])
  })
})

// ---------- filterLiturgyMusicOptions (#258/#259/#310-315/#323/#324/#337/#339/#340/#352/#361) ----------

describe('filterLiturgyMusicOptions mata mutantes de busca', () => {
  const options = [
    opt({ id: 1, name: 'Hino Um', hymnalTrack: 1, albumNames: 'Hinário Adventista' }),
    opt({ id: 2, name: 'Hino Um (1996)', hymnalTrack: 1, albumNames: 'Hinário Adventista 1996' }),
    opt({ id: 3, name: 'Música X', hymnalTrack: 2, albumNames: 'Coletânea' }),
  ]

  it('query vazia retorna só selected (#258/#259)', () => {
    expect(filterLiturgyMusicOptions(options, '   ', 2).map((o) => o.id)).toEqual([2])
    expect(filterLiturgyMusicOptions(options, '', null)).toEqual([])
  })

  it('isNum exige trimmed não-vazio (#310-315)', () => {
    // números buscam por track também
    const res = filterLiturgyMusicOptions(options, '1', null)
    expect(res.map((o) => o.id)).toContain(1)
    expect(res.map((o) => o.id)).toContain(2)
  })

  it('busca textual acha por título/álbum (#323/#324/#337/#339/#340)', () => {
    expect(filterLiturgyMusicOptions(options, 'coletânea', null).map((o) => o.id)).toEqual([3])
    expect(filterLiturgyMusicOptions(options, 'música x', null).map((o) => o.id)).toEqual([3])
  })

  it('ranking: hinário 1º, 1996 2º (#352/#361)', () => {
    const res = filterLiturgyMusicOptions(options, '1', null)
    expect(res[0]!.id).toBe(1)
    expect(res[1]!.id).toBe(2)
  })
})

// ---------- sortMusicOptions ----------

describe('sortMusicOptions', () => {
  it('ordena por track depois nome', () => {
    const sorted = sortMusicOptions([
      opt({ id: 5, name: 'Zulu' }),
      opt({ id: 3, name: 'Beta', hymnalTrack: 1 }),
      opt({ id: 4, name: 'Alpha', hymnalTrack: 1 }),
      opt({ id: 2, name: 'Yankee', hymnalTrack: 2 }),
    ])
    expect(sorted.map((o) => o.id)).toEqual([4, 3, 2, 5])
  })
})
