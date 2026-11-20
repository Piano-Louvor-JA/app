// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import type {
  LiturgyBibleBookOption,
  LiturgyItem,
  LiturgyItemDraft,
  LiturgyMusicOption,
} from '../types/liturgy'
import {
  buildLiturgyItemFromDraft,
  draftFromLiturgyItem,
  findCategoryInsertIndex,
  isLiturgyItemDraftValid,
  isValidLiturgyUrl,
  reconcileMusicItemTitles,
  reorderLiturgyItems,
} from '../services/liturgy-item-helpers'

/**
 * Kill plane round 5 — mutantes sobreviventes do relatório Stryker
 * (liturgy-item-helpers.ts, 103 survived). Cada teste mira mutantes
 * específicos, marcados nos comentários.
 */

let idSeq = 0
const nid = (prefix: string) => `${prefix}-${(idSeq += 1)}`

function cat(overrides: Partial<LiturgyItem> = {}): LiturgyItem {
  return {
    id: nid('cat'),
    type: 'category',
    name: 'Cat',
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '',
    categoryId: null,
    startTime: '09:00',
    endTime: '10:00',
    ...overrides,
  } as LiturgyItem
}

function child(overrides: Partial<LiturgyItem> = {}): LiturgyItem {
  return {
    id: nid('item'),
    type: 'music',
    name: 'Item',
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '',
    categoryId: null,
    ...overrides,
  } as LiturgyItem
}

function draft(overrides: Partial<LiturgyItemDraft> = {}): LiturgyItemDraft {
  return {
    type: 'music',
    name: 'Nome',
    subtitle: '',
    durationMs: 0,
    accentColor: '',
    categoryId: 'cat',
    startTime: '',
    endTime: '',
    musicId: 5,
    musicMode: 'audio',
    verseBookId: null,
    verseChapter: null,
    verseNumbers: '',
    filePath: '',
    filePaths: [],
    playerId: 'default',
    url: '',
    presentationEngine: 'auto',
    ...overrides,
  } as LiturgyItemDraft
}

const MUSIC = [
  { id: 5, name: 'Hino', displayLabel: 'Hino Novo', albumNames: 'Album X', hymnalTrack: null, durationMs: 0, hasInstrumental: false },
] as unknown as LiturgyMusicOption[]
const BOOKS = [{ id: 7, name: 'Gênesis', chapters: 50 }] as unknown as LiturgyBibleBookOption[]

// ---------- findCategoryInsertIndex (#28) ----------

describe('findCategoryInsertIndex mata #28 (predicate -> true)', () => {
  it('predicate só casa a categoria certa, não o primeiro item', () => {
    const items = [child({ id: 'm1' }), cat({ id: 'c1' }), child({ categoryId: 'c1' })]
    // original: categoryIndex=1, sem filhos contíguos depois? child em idx2 é filho -> insertAt=3
    expect(findCategoryInsertIndex(items, 'c1')).toBe(3)
  })
})

// ---------- reorder (#91/#92/#93 toBe, #152 dest) ----------

describe('reorderLiturgyItems mata guards e dest (#91-93, #152)', () => {
  it('from === to retorna a MESMA referência (#91/#92/#93)', () => {
    const items = [child(), child(), cat()]
    expect(reorderLiturgyItems(items, 2, 2)).toBe(items)
  })

  it('mover categoria para frente reposiciona bloco inteiro (#152)', () => {
    const items = [
      cat({ id: 'c1' }),
      child({ id: 'a1', categoryId: 'c1' }),
      child({ id: 'a2', categoryId: 'c1' }),
      cat({ id: 'c2' }),
      child({ id: 'b1', categoryId: 'c2' }),
    ]
    // mover c1 (0..2) para depois de c2 (índice 3..4)
    const next = reorderLiturgyItems(items, 0, 4)
    expect(next.map((i) => i.id)).toEqual(['c2', 'b1', 'c1', 'a1', 'a2'])
  })
})

// ---------- isLiturgyItemDraftValid (#321) ----------

describe('isLiturgyItemDraftValid mata #321', () => {
  it('music sem musicId é inválida mesmo com categoryId (#321)', () => {
    expect(isLiturgyItemDraftValid(draft({ musicId: null }))).toBe(false)
  })
})

// ---------- buildLiturgyItemFromDraft ----------

describe('buildLiturgyItemFromDraft mata #394, #396, #398, #407, #411, #415', () => {
  it('done default é false (#394)', () => {
    const item = buildLiturgyItemFromDraft(draft(), { musicList: MUSIC, bibleBooks: BOOKS })
    expect(item.done).toBe(false)
  })

  it('category tem durationMs 0 e categoryId null (#396/#398/#407)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'category', categoryId: 'deveria-ignorar', durationMs: 5000, startTime: '09:00', endTime: '10:00' }),
      { musicList: [], bibleBooks: [] },
    )
    expect(item.durationMs).toBe(0)
    expect(item.categoryId).toBeNull()
  })

  it('non-category tem startTime/endTime null mesmo com draft preenchido (#411/#415)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'video', filePath: '/v.mp4', startTime: '09:00', endTime: '10:00' }),
      { musicList: [], bibleBooks: [] },
    )
    expect(item.startTime).toBeNull()
    expect(item.endTime).toBeNull()
  })
})

describe('buildLiturgyItemFromDraft mata MethodExpression trim (#389/#392/#365)', () => {
  it('name/subtitle trimados (#389/#392)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'other_files', name: '  Nome  ', subtitle: '  Det  ' }),
      { musicList: MUSIC, bibleBooks: [] },
    )
    expect(item.name).toBe('Nome')
    expect(item.subtitle).toBe('Det')
  })

  it('whitespace-only filePath em vídeo é inválido (#365 validação) e trimado no item (#477/#479)', () => {
    expect(isLiturgyItemDraftValid(draft({ type: 'video', filePath: '   ' }))).toBe(false)
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'video', filePath: '  /v.mp4  ' }),
      { musicList: [], bibleBooks: [] },
    )
    expect(item.filePath).toBe('/v.mp4')
  })
})

describe('buildLiturgyItemFromDraft mata #447 (verse -> true)', () => {
  it('tipo não-verse não ganha subtitle de versículo mesmo com verseBookId (#447)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ verseBookId: 7, verseChapter: 3, verseNumbers: '16' }),
      { musicList: MUSIC, bibleBooks: BOOKS },
    )
    // music com musicList: subtitle = albumNames, NÃO "Gênesis 3:16"
    expect(item.subtitle).toBe('Album X')
  })
})

describe('buildLiturgyItemFromDraft mata blocos file/site (#465/#468/#489/#502/#508/#546/#552)', () => {
  it('music não ganha filePath (#465)', () => {
    const item = buildLiturgyItemFromDraft(draft(), { musicList: MUSIC, bibleBooks: [] })
    expect('filePath' in item).toBe(false)
  })

  it('video não é tratado como images (#468/#523): sem filePaths', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'video', filePath: '/v.mp4' }),
      { musicList: [], bibleBooks: [] },
    )
    expect('filePaths' in item).toBe(false)
  })

  it('video não ganha presentationEngine (#489)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'video', filePath: '/v.mp4', presentationEngine: 'pdfjs' }),
      { musicList: [], bibleBooks: [] },
    )
    expect('presentationEngine' in item).toBe(false)
  })

  it('category não ganha playerId (#502) e video com playerId persiste (#508-510)', () => {
    const catItem = buildLiturgyItemFromDraft(
      draft({ type: 'category', startTime: '09:00', endTime: '10:00', playerId: 'custom' }),
      { musicList: [], bibleBooks: [] },
    )
    expect('playerId' in catItem).toBe(false)

    const video = buildLiturgyItemFromDraft(
      draft({ type: 'video', filePath: '/v.mp4', playerId: 'custom' }),
      { musicList: [], bibleBooks: [] },
    )
    expect(video.playerId).toBe('custom')
  })

  it('music não ganha url (#546) e site ganha url trimada (#552-554)', () => {
    const music = buildLiturgyItemFromDraft(draft({ url: '  http://x.com  ' }), { musicList: MUSIC, bibleBooks: [] })
    expect('url' in music).toBe(false)

    const site = buildLiturgyItemFromDraft(
      draft({ type: 'site', url: '  http://x.com  ' }),
      { musicList: [], bibleBooks: [] },
    )
    expect(site.url).toBe('http://x.com')
  })
})

// ---------- draftFromLiturgyItem (#568/#575/#590-593/#595/#601/#608/#611/#616/#617) ----------

describe('draftFromLiturgyItem mata mutantes de conversão', () => {
  it('music: name vem de complementaryTitle trimado; subtitle de notes trimado (#568/#575)', () => {
    const item = child({
      type: 'music',
      name: 'Hino',
      complementaryTitle: '  Título Livre  ',
      notes: '  Nota  ',
    })
    const d = draftFromLiturgyItem(item)
    expect(d.name).toBe('Título Livre')
    expect(d.subtitle).toBe('Nota')
  })

  it('category: categoryId null mesmo com categoryId suja (#590)', () => {
    const item = cat({ categoryId: 'suja' })
    const d = draftFromLiturgyItem(item)
    expect(d.categoryId).toBeNull()
  })

  it('non-category preserva categoryId (#591-593)', () => {
    const item = child({ categoryId: 'keep' })
    const d = draftFromLiturgyItem(item)
    expect(d.categoryId).toBe('keep')
  })

  it('non-category com startTime sujo continua startTime "" (#595/#601)', () => {
    const item = child({ startTime: '09:00' } as Partial<LiturgyItem>)
    const d = draftFromLiturgyItem(item)
    expect(d.startTime).toBe('')
    expect(d.endTime).toBe('')
  })

  it('music sem musicMode vira audio (#611); filePath preservado (#616); vazio vira "" (#617)', () => {
    const d1 = draftFromLiturgyItem(child({ type: 'music' }))
    expect(d1.musicMode).toBe('audio')
    const d2 = draftFromLiturgyItem(child({ filePath: '/f.mp4' }))
    expect(d2.filePath).toBe('/f.mp4')
    const d3 = draftFromLiturgyItem(child())
    expect(d3.filePath).toBe('')
  })
})

// ---------- reconcileMusicItemTitles (#645/#654/#673/#691) ----------

describe('reconcileMusicItemTitles mata #645/#654/#673/#691', () => {
  it('item music com musicId fora da lista é retornado intacto (#645)', () => {
    const items = [child({ type: 'music', musicId: 999, name: 'X' })]
    const next = reconcileMusicItemTitles(items, MUSIC)
    expect(next[0]!.name).toBe('X')
    expect(next[0]!.subtitle).toBe('')
  })

  it('complementaryTitle whitespace-only é tratado como vazio (#654)', () => {
    const items = [
      child({
        type: 'music',
        musicId: 5,
        name: 'Nome Antigo',
        complementaryTitle: '   ',
        subtitle: 'Album X',
      }),
    ]
    const next = reconcileMusicItemTitles(items, MUSIC)
    // name atualizado ao label; complementaryTitle recebe name antigo
    expect(next[0]!.name).toBe('Hino Novo')
    expect(next[0]!.complementaryTitle).toBe('Nome Antigo')
  })

  it('subtitle whitespace-trimmed igual ao album NÃO dispara change (#673)', () => {
    const items = [
      child({ type: 'music', musicId: 5, name: 'Hino Novo', subtitle: '  Album X  ', notes: undefined }),
    ]
    const next = reconcileMusicItemTitles(items, MUSIC)
    // subtitle.trim() === albumNames -> sem mudança -> MESMA referência
    expect(next).toBe(items)
  })

  it('notes whitespace-only é limpo quando subtitle já está correta (#691)', () => {
    const items = [
      child({ type: 'music', musicId: 5, name: 'Hino Novo', subtitle: 'Album X', notes: '   ' }),
    ]
    const next = reconcileMusicItemTitles(items, MUSIC)
    expect(next[0]!.notes).toBeUndefined()
    expect(next[0]!.name).toBe('Hino Novo')
  })
})

// ---------- rodada 2: kills finos ----------

describe('findCategoryInsertIndex mata #28 (1º operando -> true) e #46 (break -> false)', () => {
  it('predicate exige type category mesmo com id igual (#28)', () => {
    const items = [child({ id: 'dup' }), cat({ id: 'dup' }), child({ id: 'x', categoryId: 'dup' })]
    // original: category idx 1, filho em 2 contíguo -> 3; mutante: casa child idx0 -> 1
    expect(findCategoryInsertIndex(items, 'dup')).toBe(3)
  })

  it('buraco undefined após categoria quebra o loop (#46)', () => {
    const items = [cat({ id: 'c1' }), undefined as unknown as LiturgyItem]
    expect(findCategoryInsertIndex(items, 'c1')).toBe(1)
  })
})

describe('reorder mata #152 (dest - -> +) e #74 (2º operando findIndex -> true)', () => {
  it('categoria sem filhos movida pra frente: dest exato (#152)', () => {
    const items = [
      cat({ id: 'c1' }),
      cat({ id: 'c2' }),
      child({ id: 'b1', categoryId: 'c2' }),
    ]
    const next = reorderLiturgyItems(items, 0, 2)
    expect(next.map((i) => i.id)).toEqual(['c2', 'b1', 'c1'])
  })

  it('findIndex do pai exige type category mesmo com id duplicado (#74)', () => {
    const items = [
      cat({ id: 'c1' }),
      child({ id: 'a1', categoryId: 'c1' }),
      child({ id: 'dup', categoryId: 'c9' }),
      cat({ id: 'c2' }),
      child({ id: 'b1', categoryId: 'c2' }),
    ]
    // mover c1 (0..1) sobre b1 (4): pai original é cat c2 (idx 3) -> insertAt 5
    // mutante #74 (predicate -> true): acharia o child 'dup' (idx 2) -> insertAt 3
    const next = reorderLiturgyItems(items, 0, 4)
    expect(next.map((i) => i.id)).toEqual(['dup', 'c2', 'b1', 'c1', 'a1'])
  })
})

describe('isValidLiturgyUrl mata #255 (âncora ^ removida)', () => {
  it('https:// no MEIO da string não é protocolo (#255)', () => {
    // 'xhttps://a.com' sem ^: não casa -> prefixa https -> URL inválida (porta) -> false
    expect(isValidLiturgyUrl('xhttps://a.com')).toBe(false)
  })
})

describe('build/draft mata #321 (1º operando music -> true), #407, #502, #508-510, #552, #554, #581, #608', () => {
  it('music com musicId é válida (#321 2º operando)', () => {
    expect(isLiturgyItemDraftValid(draft())).toBe(true)
  })

  it('draft não-music com musicId null continua válido (#321)', () => {
    expect(isLiturgyItemDraftValid(draft({ type: 'video', filePath: '/v.mp4', musicId: null }))).toBe(true)
  })

  it('music preserva categoryId do draft (#407)', () => {
    const item = buildLiturgyItemFromDraft(draft(), { musicList: MUSIC, bibleBooks: [] })
    expect(item.categoryId).toBe('cat')
  })

  it('images não ganha playerId (#502)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'images', filePath: '/i.png', playerId: 'custom' }),
      { musicList: [], bibleBooks: [] },
    )
    expect('playerId' in item).toBe(false)
  })

  it('audio ganha playerId custom (#508-510)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'audio', filePath: '/a.mp3', playerId: 'custom' }),
      { musicList: [], bibleBooks: [] },
    )
    expect(item.playerId).toBe('custom')
  })

  it('online_video ganha url trimada (#552/#554)', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'online_video', url: '  http://y.com  ' }),
      { musicList: [], bibleBooks: [] },
    )
    expect(item.url).toBe('http://y.com')
  })

  it('draftFromLiturgyItem de category: durationMs 0 numérico (#581) e endTime "" (#608)', () => {
    const d = draftFromLiturgyItem(cat({ endTime: 'xx' }))
    expect(d.durationMs).toBe(0)
    expect(d.endTime).toBe('')
    const d2 = draftFromLiturgyItem(child() as LiturgyItem)
    expect(d2.endTime).toBe('')
  })
})


describe('reorder mata resolveDropCategoryIndex via toIndex em filho (#74)', () => {
  it('mover categoria sobre filho de outra categoria insere após o bloco do pai (#74)', () => {
    const items = [
      cat({ id: 'c1' }),
      child({ id: 'a1', categoryId: 'c1' }),
      cat({ id: 'c2' }),
      child({ id: 'b1', categoryId: 'c2' }),
    ]
    // mover c1 (bloco 0..1) sobre o filho b1 (índice 3) -> pai c2 (2), insertAt=4
    const next = reorderLiturgyItems(items, 0, 3)
    expect(next.map((i) => i.id)).toEqual(['c2', 'b1', 'c1', 'a1'])
  })
})
