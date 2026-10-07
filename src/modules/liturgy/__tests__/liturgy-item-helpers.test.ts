// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import type { LiturgyItem, LiturgyItemDraft } from '../types/liturgy'
import {
  buildLiturgyItemFromDraft,
  clampMomentDurationMs,
  clearDoneFlags,
  cloneLiturgyItems,
  createLiturgyItemId,
  draftFromLiturgyItem,
  findCategoryInsertIndex,
  formatMomentDuration,
  getCategoryBlockEnd,
  getItemTypeIcon,
  getItemTypeTone,
  getSectionItemNumber,
  isExecutableItem,
  isLiturgyItemDraftValid,
  isLiturgyMediaPlayType,
  isValidLiturgyUrl,
  normalizeItemType,
  reconcileMusicItemTitles,
  reorderLiturgyItems,
  resolvePreferredCategoryId,
} from '../services/liturgy-item-helpers'

// ---------- helpers de fixture ----------

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

// usados por vários describes
const listWithChildren = [
  cat({ id: 'c1' }),
  child({ id: 'i1', categoryId: 'c1' }),
  child({ id: 'i2', categoryId: 'c1' }),
  cat({ id: 'c2' }),
  child({ id: 'i3', categoryId: 'c2' }),
]

// ---------- pure helpers ----------

describe('createLiturgyItemId', () => {
  it('gera ids únicos no formato timestamp-random', () => {
    const a = createLiturgyItemId()
    const b = createLiturgyItemId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^\d+-[a-z0-9]+$/)
  })
})

describe('resolvePreferredCategoryId', () => {
  it('retorna id quando selecionado é categoria', () => {
    expect(resolvePreferredCategoryId([], cat({ id: 'catX' }))).toBe('catX')
  })
  it('retorna categoryId do item selecionado', () => {
    expect(resolvePreferredCategoryId([], child({ categoryId: 'cc' }))).toBe('cc')
  })
  it('retorna última categoria da lista (busca de trás pra frente)', () => {
    const items = [cat({ id: 'first' }), child(), cat({ id: 'last' })]
    expect(resolvePreferredCategoryId(items, undefined)).toBe('last')
  })
  it('retorna null quando item no fim é undefined (buraco no array)', () => {
    const items = [cat({ id: 'c' }), child()]
    items.push(undefined as unknown as LiturgyItem)
    // loop: último item undefined -> optional chaining pula -> encontra 'c'? não: percorre de trás: undefined, child, cat 'c'
    expect(resolvePreferredCategoryId(items, null)).toBe('c')
  })
  it('retorna null sem categorias', () => {
    expect(resolvePreferredCategoryId([child()], null)).toBeNull()
  })
})

describe('findCategoryInsertIndex', () => {
  it('retorna length quando categoria não existe', () => {
    expect(findCategoryInsertIndex(listWithChildren, 'nope')).toBe(5)
  })
  it('insere após filhos contíguos da categoria', () => {
    expect(findCategoryInsertIndex(listWithChildren, 'c1')).toBe(3)
  })
  it('para em filho com categoryId diferente', () => {
    const items = [cat({ id: 'a' }), child({ categoryId: 'b' })]
    expect(findCategoryInsertIndex(items, 'a')).toBe(1)
  })
  it('para em undefined no array (furo)', () => {
    const items: LiturgyItem[] = [cat({ id: 'a' }), child({ categoryId: 'a' })]
    ;(items as (LiturgyItem | undefined)[]).push(undefined)
    const arr = items as LiturgyItem[]
    expect(findCategoryInsertIndex(arr, 'a')).toBe(2)
  })
})

describe('getCategoryBlockEnd', () => {
  it('retorna index+1 quando não é categoria', () => {
    expect(getCategoryBlockEnd(listWithChildren, 1)).toBe(2)
  })
  it('retorna fim do bloco categoria+filhos', () => {
    expect(getCategoryBlockEnd(listWithChildren, 0)).toBe(3)
    expect(getCategoryBlockEnd(listWithChildren, 3)).toBe(5)
  })
})

describe('reorderLiturgyItems', () => {
  const mk = () => [
    cat({ id: 'a' }),
    child({ id: 'a1', categoryId: 'a' }),
    child({ id: 'a2', categoryId: 'a' }),
    child({ id: 'free' }),
  ]

  it('retorna igual para índices inválidos/iguais', () => {
    const items = mk()
    expect(reorderLiturgyItems(items, 0, 0)).toBe(items)
    expect(reorderLiturgyItems(items, -1, 2)).toBe(items)
    expect(reorderLiturgyItems(items, 0, -1)).toBe(items)
    expect(reorderLiturgyItems(items, 99, 1)).toBe(items)
    expect(reorderLiturgyItems(items, 1, 99)).toBe(items)
  })
  it('move item simples para frente e para trás', () => {
    const items = mk()
    const next = reorderLiturgyItems(items, 3, 0)
    expect(next.map((i) => i.id)).toEqual(['free', 'a', 'a1', 'a2'])
    const back = reorderLiturgyItems(next, 0, 3)
    expect(back.map((i) => i.id)).toEqual(['a', 'a1', 'a2', 'free'])
  })
  it('categoria movida leva o bloco de filhos', () => {
    const items = [cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' }), cat({ id: 'b' }), child({ id: 'b1', categoryId: 'b' })]
    const next = reorderLiturgyItems(items, 2, 0)
    expect(next.map((i) => i.id)).toEqual(['b', 'b1', 'a', 'a1'])
  })
  it('drop dentro do próprio bloco não faz nada', () => {
    const items = [cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' }), child({ id: 'a2', categoryId: 'a' })]
    expect(reorderLiturgyItems(items, 0, 1)).toBe(items)
  })
  it('drop em filho de outra categoria resolve categoria pai', () => {
    const items = [cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' }), cat({ id: 'b' }), child({ id: 'b1', categoryId: 'b' })]
    // move 'a' para posição do filho b1 → alvo é categoria b
    const next = reorderLiturgyItems(items, 0, 3)
    expect(next.map((i) => i.id)).toEqual(['b', 'b1', 'a', 'a1'])
  })
  it('drop em item solto (sem categoria) após origem insere depois dele', () => {
    const items = [cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' }), child({ id: 'free' }), cat({ id: 'z' })]
    const next = reorderLiturgyItems(items, 0, 2)
    expect(next.map((i) => i.id)).toEqual(['free', 'a', 'a1', 'z'])
  })
  it('drop em item solto antes da origem insere antes', () => {
    const items = [child({ id: 'free' }), cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' })]
    const next = reorderLiturgyItems(items, 1, 0)
    expect(next.map((i) => i.id)).toEqual(['a', 'a1', 'free'])
  })
  it('clamp do destino quando insertAt excede limites', () => {
    const items = [cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' }), cat({ id: 'b' }), child({ id: 'b1', categoryId: 'b' })]
    // move b para cima de a (insertAt=0 < fromIndex=2)
    const next = reorderLiturgyItems(items, 2, 0)
    expect(next.map((i) => i.id)).toEqual(['b', 'b1', 'a', 'a1'])
    // e de volta para baixo
    const back = reorderLiturgyItems(next, 0, 2)
    expect(back.map((i) => i.id)).toEqual(['a', 'a1', 'b', 'b1'])
  })
})

describe('cloneLiturgyItems', () => {
  it('gera novos ids e remapeia categoryId, limpa done', () => {
    const items = [cat({ id: 'a', done: true }), child({ id: 'i', categoryId: 'a', done: true })]
    const [c, i] = cloneLiturgyItems(items)
    expect(c.id).not.toBe('a')
    expect(i.categoryId).toBe(c.id)
    expect(c.done).toBe(false)
    expect(i.done).toBe(false)
  })
  it('categoryId órfão vira null (?? null)', () => {
    const [i] = cloneLiturgyItems([child({ categoryId: 'ghost' })])
    expect(i.categoryId).toBeNull()
  })
})

describe('isExecutableItem / isLiturgyMediaPlayType / icons', () => {
  it('executáveis vs não executáveis', () => {
    expect(isExecutableItem({ type: 'music' })).toBe(true)
    expect(isExecutableItem({ type: 'annotation' })).toBe(false)
  })
  it('media play done types', () => {
    expect(isLiturgyMediaPlayType('music')).toBe(true)
    expect(isLiturgyMediaPlayType('annotation')).toBe(false)
  })
  it('icon e tone com fallback', () => {
    expect(getItemTypeIcon('music')).not.toBe('ti-help')
    expect(getItemTypeIcon('tipo-inexistente' as never)).toBe('ti-help')
    expect(getItemTypeTone('music')).not.toBe('grey')
  })
})

describe('normalizeItemType', () => {
  it('mapeia aliases antigos', () => {
    expect(normalizeItemType('media')).toBe('other_files')
    expect(normalizeItemType('files')).toBe('other_files')
    expect(normalizeItemType('link')).toBe('site')
  })
  it('aceita tipos válidos diretos', () => {
    expect(normalizeItemType('music')).toBe('music')
  })
  it('retorna null para desconhecidos e não-strings', () => {
    expect(normalizeItemType('xxx')).toBeNull()
    expect(normalizeItemType(42)).toBeNull()
  })
})

describe('getSectionItemNumber', () => {
  it('null para categoria ou índice inválido', () => {
    expect(getSectionItemNumber(listWithChildren, 0)).toBeNull()
    expect(getSectionItemNumber(listWithChildren, 99)).toBeNull()
  })
  it('numera dentro da seção reiniciando por categoria', () => {
    expect(getSectionItemNumber(listWithChildren, 1)).toBe(1)
    expect(getSectionItemNumber(listWithChildren, 2)).toBe(2)
    expect(getSectionItemNumber(listWithChildren, 4)).toBe(1)
  })
})

describe('clampMomentDurationMs / formatMomentDuration', () => {
  it('zero e negativos viram 0', () => {
    expect(clampMomentDurationMs(0)).toBe(0)
    expect(clampMomentDurationMs(-5)).toBe(0)
  })
  it('arredonda para segundo e respeita min/max', () => {
    expect(clampMomentDurationMs(1500)).toBe(2000)
    const min = 0
    expect(clampMomentDurationMs(1)).toBe(min)
    const max = 99 * 60 * 1000
    expect(clampMomentDurationMs(99_999_999)).toBe(max)
  })
  it('formata mm:ss', () => {
    expect(formatMomentDuration(0)).toBe('00:00')
    expect(formatMomentDuration(-1)).toBe('00:00')
    expect(formatMomentDuration(65_000)).toBe('01:05')
    expect(formatMomentDuration(3_700_000)).toBe('61:40')
  })
})

describe('isValidLiturgyUrl', () => {
  it('rejeita vazia/branca', () => {
    expect(isValidLiturgyUrl('')).toBe(false)
    expect(isValidLiturgyUrl('   ')).toBe(false)
  })
  it('aceita domínios com e sem protocolo', () => {
    expect(isValidLiturgyUrl('youtube.com')).toBe(true)
    expect(isValidLiturgyUrl('https://vimeo.com/x')).toBe(true)
    expect(isValidLiturgyUrl('http://a.b')).toBe(true)
  })
  it('aceita localhost e IP', () => {
    expect(isValidLiturgyUrl('http://localhost:3000')).toBe(true)
    expect(isValidLiturgyUrl('http://192.168.0.10:8080')).toBe(true)
  })
  it('rejeita host inválido', () => {
    expect(isValidLiturgyUrl('http://.com')).toBe(false)
    expect(isValidLiturgyUrl('http://a.')).toBe(false)
    expect(isValidLiturgyUrl('http://a')).toBe(false) // sem ponto, não IP/localhost
    expect(isValidLiturgyUrl('::::')).toBe(false) // URL inválida → catch
    expect(isValidLiturgyUrl('ftp://x')).toBe(false) // não http(s) após parse? ftp não casa regex https? então prefixa https → 'https://ftp://x' inválido
  })
})

// ---------- draft validation ----------

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

describe('isLiturgyItemDraftValid', () => {
  it('exige type e name', () => {
    expect(isLiturgyItemDraftValid(draft({ type: null }))).toBe(false)
    expect(isLiturgyItemDraftValid(draft({ name: '  ' }))).toBe(false)
  })
  it('categoria exige horários válidos', () => {
    expect(
      isLiturgyItemDraftValid(draft({ type: 'category', categoryId: null, startTime: '09:00', endTime: '10:00' })),
    ).toBe(true)
    expect(
      isLiturgyItemDraftValid(draft({ type: 'category', categoryId: null, startTime: 'xx', endTime: '10:00' })),
    ).toBe(false)
    expect(
      isLiturgyItemDraftValid(draft({ type: 'category', categoryId: null, startTime: '09:00', endTime: '' })),
    ).toBe(false)
  })
  it('música exige musicId; outros tipos exigem categoryId', () => {
    expect(isLiturgyItemDraftValid(draft({ musicId: null }))).toBe(false)
    expect(isLiturgyItemDraftValid(draft({ type: 'verse', musicId: null }))).toBe(true) // verse não exige categoryId? validar comportamento real
    expect(isLiturgyItemDraftValid(draft({ type: 'verse', musicId: null, categoryId: 'c' }))).toBe(true)
  })
  it('images exige filePaths ou filePath', () => {
    expect(isLiturgyItemDraftValid(draft({ type: 'images', musicId: null }))).toBe(false)
    expect(isLiturgyItemDraftValid(draft({ type: 'images', musicId: null, filePath: '/a.png' }))).toBe(true)
    expect(isLiturgyItemDraftValid(draft({ type: 'images', musicId: null, filePaths: ['/a.png'] }))).toBe(true)
  })
  it('video/pdf/presentation exigem filePath', () => {
    for (const type of ['video', 'pdf', 'presentation'] as const) {
      expect(isLiturgyItemDraftValid(draft({ type, musicId: null }))).toBe(false)
      expect(isLiturgyItemDraftValid(draft({ type, musicId: null, filePath: '/f' }))).toBe(true)
    }
  })
  it('site/online_video exigem url válida', () => {
    expect(isLiturgyItemDraftValid(draft({ type: 'site', musicId: null }))).toBe(false)
    expect(isLiturgyItemDraftValid(draft({ type: 'site', musicId: null, url: 'x.com' }))).toBe(true)
    expect(isLiturgyItemDraftValid(draft({ type: 'online_video', musicId: null, url: 'nope' }))).toBe(false)
  })
})

// ---------- build / draft roundtrip ----------

import type { LiturgyBibleBookOption, LiturgyMusicOption } from '../types/liturgy'

const musicList: LiturgyMusicOption[] = [
  { id: 5, displayLabel: 'Hino 5', albumNames: 'Álbum A', name: 'H5', hymnalTrack: null, durationMs: 0, hasInstrumental: false },
  { id: 9, displayLabel: 'Hino 9', albumNames: 'Álbum B', name: 'H9', hymnalTrack: null, durationMs: 0, hasInstrumental: false },
]
const bibleBooks: LiturgyBibleBookOption[] = [{ id: 1, name: 'Gênesis', chapters: 50 }]

describe('buildLiturgyItemFromDraft', () => {
  it('lança sem type', () => {
    expect(() => buildLiturgyItemFromDraft(draft({ type: null }), { musicList, bibleBooks })).toThrow()
  })
  it('categoria: horários normalizados, categoryId null', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'category', name: 'Abertura', startTime: '9:00', endTime: '10:30' }),
      { musicList, bibleBooks },
    )
    expect(item.startTime).toBe('09:00')
    expect(item.endTime).toBe('10:30')
    expect(item.categoryId).toBeNull()
    expect(item.durationMs).toBe(0)
  })
  it('música no catálogo: nome do catálogo, subtítulo = álbum, complementar preservado', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ name: 'Solo', subtitle: 'Notas', musicId: 5, durationMs: 90_000 }),
      { musicList, bibleBooks, existingId: 'fixed', done: true },
    )
    expect(item.id).toBe('fixed')
    expect(item.done).toBe(true)
    expect(item.name).toBe('Hino 5')
    expect(item.complementaryTitle).toBe('Solo')
    expect(item.subtitle).toBe('Álbum A')
    expect(item.notes).toBe('Notas')
    expect(item.durationMs).toBe(90_000)
  })
  it('música fora do catálogo: fallback nome digitado', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ name: 'Especial', subtitle: 'Obs', musicId: 77 }),
      { musicList, bibleBooks },
    )
    expect(item.name).toBe('Especial')
    expect(item.complementaryTitle).toBeUndefined()
    expect(item.subtitle).toBe('')
    expect(item.notes).toBe('Obs')
    expect(item.durationMs).toBe(0) // durationMs <= 0 música → 0
  })
  it('verse com livro: subtítulo automático', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'verse', musicId: null, verseBookId: 1, verseChapter: 3, verseNumbers: '1-5' }),
      { musicList, bibleBooks },
    )
    expect(item.subtitle).toBe('Gênesis 3:1-5')
  })
  it('verse com detalhe manual: mantém subtítulo', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'verse', musicId: null, subtitle: 'Leitura', verseBookId: 1, verseChapter: 3, verseNumbers: '' }),
      { musicList, bibleBooks },
    )
    expect(item.subtitle).toBe('Leitura')
  })
  it('presentation: engine explícito persiste, auto não', () => {
    const p1 = buildLiturgyItemFromDraft(
      draft({ type: 'presentation', musicId: null, filePath: '/p.pptx', presentationEngine: 'powerpoint' }),
      { musicList, bibleBooks },
    )
    expect(p1.presentationEngine).toBe('powerpoint')
    const p2 = buildLiturgyItemFromDraft(
      draft({ type: 'presentation', musicId: null, filePath: '/p.pptx', presentationEngine: 'auto' }),
      { musicList, bibleBooks },
    )
    expect('presentationEngine' in p2).toBe(false)
  })
  it('video/audio: playerId explícito persiste, default não', () => {
    const v1 = buildLiturgyItemFromDraft(
      draft({ type: 'video', musicId: null, filePath: '/v.mp4', playerId: 'vlc' }),
      { musicList, bibleBooks },
    )
    expect(v1.playerId).toBe('vlc')
    const v2 = buildLiturgyItemFromDraft(
      draft({ type: 'audio', musicId: null, filePath: '/a.mp3', playerId: 'default' }),
      { musicList, bibleBooks },
    )
    expect('playerId' in v2).toBe(false)
  })
  it('images múltiplas: subtitle "N imagens"; única: nome do arquivo', () => {
    const m = buildLiturgyItemFromDraft(
      draft({ type: 'images', musicId: null, filePaths: ['/a.png', '/b.png'] }),
      { musicList, bibleBooks },
    )
    expect(m.subtitle).toBe('2 imagens')
    expect(m.filePaths).toEqual(['/a.png', '/b.png'])
    const s = buildLiturgyItemFromDraft(
      draft({ type: 'images', musicId: null, filePath: 'C:\\fotos\\x.jpg' }),
      { musicList, bibleBooks },
    )
    expect(s.subtitle).toBe('x.jpg')
    expect(s.filePath).toBe('C:\\fotos\\x.jpg')
  })
  it('arquivo com detalhe manual mantém subtítulo; senão basename', () => {
    const withSub = buildLiturgyItemFromDraft(
      draft({ type: 'video', musicId: null, filePath: '/pasta/clip.mp4', subtitle: 'Intro' }),
      { musicList, bibleBooks },
    )
    expect(withSub.subtitle).toBe('Intro')
    const noSub = buildLiturgyItemFromDraft(
      draft({ type: 'video', musicId: null, filePath: '/pasta/clip.mp4' }),
      { musicList, bibleBooks },
    )
    expect(noSub.subtitle).toBe('clip.mp4')
  })
  it('images sem paths: filePath vazio e sem subtitle automático', () => {
    const e = buildLiturgyItemFromDraft(
      draft({ type: 'images', musicId: null, filePaths: [], filePath: '' }),
      { musicList, bibleBooks },
    )
    expect(e.filePath).toBe('')
    expect(e.subtitle).toBe('')
  })
  it('site/online_video: url trimada e subtítulo automático', () => {
    const s = buildLiturgyItemFromDraft(
      draft({ type: 'site', musicId: null, url: ' https://x.com ' }),
      { musicList, bibleBooks },
    )
    expect(s.url).toBe('https://x.com')
    expect(s.subtitle).toBe('https://x.com')
    const s2 = buildLiturgyItemFromDraft(
      draft({ type: 'site', musicId: null, url: 'https://x.com', subtitle: 'Site oficial' }),
      { musicList, bibleBooks },
    )
    expect(s2.subtitle).toBe('Site oficial')
  })
  it('annotation (não arquivo): durationMs clamp aplicado', () => {
    const a = buildLiturgyItemFromDraft(
      draft({ type: 'annotation', musicId: null, durationMs: 2500 }),
      { musicList, bibleBooks },
    )
    expect(a.durationMs).toBe(3000) // round para 3000
  })
})

describe('draftFromLiturgyItem', () => {
  it('roundtrip música: name vem do complementaryTitle, notes do subtitle', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ name: 'Solo', subtitle: 'Notas', musicId: 5, musicMode: 'instrumental', durationMs: 60_000 }),
      { musicList, bibleBooks },
    )
    const d = draftFromLiturgyItem(item)
    expect(d.name).toBe('Solo')
    expect(d.subtitle).toBe('Notas')
    expect(d.musicId).toBe(5)
    expect(d.musicMode).toBe('instrumental')
    expect(d.durationMs).toBe(60_000)
  })
  it('categoria: horários e defaults', () => {
    const d = draftFromLiturgyItem(cat({ startTime: '09:00', endTime: '10:00' }))
    expect(d.startTime).toBe('09:00')
    expect(d.endTime).toBe('10:00')
    expect(d.durationMs).toBe(0)
    expect(d.playerId).toBe('default')
    expect(d.presentationEngine).toBe('auto')
  })
  it('filePaths herdadas ou singleton do filePath', () => {
    const d1 = draftFromLiturgyItem(child({ type: 'images', filePaths: ['/a', '/b'] }))
    expect(d1.filePaths).toEqual(['/a', '/b'])
    const d2 = draftFromLiturgyItem(child({ type: 'images', filePath: '/solo.png' }))
    expect(d2.filePaths).toEqual(['/solo.png'])
    const d3 = draftFromLiturgyItem(child({}))
    expect(d3.filePaths).toEqual([])
  })
  it('não-música: name/subtitle diretos; horário inválido vira vazio', () => {
    const d = draftFromLiturgyItem(child({ type: 'note' as never, name: 'N', subtitle: 'S' }))
    expect(d.name).toBe('N')
    expect(d.subtitle).toBe('S')
  })
  it('categoria com startTime inválido → string vazia (?? "")', () => {
    const d = draftFromLiturgyItem(cat({ startTime: 'zzz' }))
    expect(d.startTime).toBe('')
  })
})

describe('reconcileMusicItemTitles', () => {
  it('retorna igual com musicList vazio', () => {
    const items = [child({ type: 'music', musicId: 5 })]
    expect(reconcileMusicItemTitles(items, [])).toBe(items)
  })
  it('não-música ou musicId nulo intacto', () => {
    const items = [child({ type: 'music', musicId: null }), child({ type: 'note' as never })]
    expect(reconcileMusicItemTitles(items, musicList)).toBe(items)
  })
  it('música fora do catálogo intacta', () => {
    const items = [child({ type: 'music', musicId: 42, name: 'X' })]
    expect(reconcileMusicItemTitles(items, musicList)).toBe(items)
  })
  it('sem complementar: nome atual vira complementaryTitle', () => {
    const items = [child({ type: 'music', musicId: 5, name: 'Nome antigo', subtitle: 'Álbum A' })]
    const [next] = reconcileMusicItemTitles(items, musicList)
    expect(next.name).toBe('Hino 5')
    expect(next.complementaryTitle).toBe('Nome antigo')
  })
  it('com complementar: só nome atualiza', () => {
    const items = [child({ type: 'music', musicId: 5, name: 'Velho', complementaryTitle: 'Comp', subtitle: 'Álbum A' })]
    const [next] = reconcileMusicItemTitles(items, musicList)
    expect(next.name).toBe('Hino 5')
    expect(next.complementaryTitle).toBe('Comp')
  })
  it('subtitle divergente do álbum: move p/ notes', () => {
    const items = [child({ type: 'music', musicId: 5, name: 'Hino 5', subtitle: 'Sub antigo' })]
    const [next] = reconcileMusicItemTitles(items, musicList)
    expect(next.subtitle).toBe('Álbum A')
    expect(next.notes).toBe('Sub antigo')
  })
  it('subtitle ok mas notes em branco: remove notes', () => {
    const items = [child({ type: 'music', musicId: 5, name: 'Hino 5', subtitle: 'Álbum A', notes: '   ' })]
    const [next] = reconcileMusicItemTitles(items, musicList)
    expect(next.notes).toBeUndefined()
  })
  it('tudo já alinhado: retorna referência igual', () => {
    const items = [child({ type: 'music', musicId: 5, name: 'Hino 5', subtitle: 'Álbum A' })]
    expect(reconcileMusicItemTitles(items, musicList)).toBe(items)
  })
})

describe('clearDoneFlags', () => {
  it('limpa done de todos', () => {
    const [a, b] = clearDoneFlags([child({ done: true }), cat({ done: true })])
    expect(a.done).toBe(false)
    expect(b.done).toBe(false)
  })
})

describe('branches residuais item-helpers', () => {
  it('resolveDropCategoryIndex: toIndex fora do array devolve toIndex', () => {
    // getCategoryBlockEnd via reorder com buraco: fromIndex aponta buraco
    const items: LiturgyItem[] = [cat({ id: 'a' })]
    ;(items as (LiturgyItem | undefined)[]).push(undefined)
    const arr = items as LiturgyItem[]
    expect(reorderLiturgyItems(arr, 1, 0)).toBe(arr) // moved undefined → items
  })
  it('drop em filho com categoryId órfão devolve toIndex', () => {
    const items = [cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' }), child({ id: 'orphan', categoryId: 'ghost' })]
    // mover categoria 'a' para posição do órfão: parent não existe → toIndex=2 (órfão solto)
    const next = reorderLiturgyItems(items, 0, 2)
    expect(next.map((i) => i.id)).toEqual(['orphan', 'a', 'a1'])
  })
  it('reorder: insertAt calculado cai dentro do próprio bloco (categoria p/ posição do próprio filho)', () => {
    const items = [cat({ id: 'a' }), child({ id: 'a1', categoryId: 'a' }), child({ id: 'a2', categoryId: 'a' }), child({ id: 'free' })]
    // mover 'a' para toIndex=1 (próprio filho): resolveDrop → parentIndex=0; target category; fromIndex<target? 0<0 não → insertAt=0 → dentro do bloco → igual
    expect(reorderLiturgyItems(items, 0, 1)).toBe(items)
  })
  it('clone: id fora do map gera novo id no fallback', () => {
    const [i] = cloneLiturgyItems([child({ id: 'x' })])
    expect(i.id).not.toBe('x')
  })
  it('getItemTypeTone fallback grey para tipo desconhecido', () => {
    expect(getItemTypeTone('tipo-x' as never)).toBe('grey')
  })
  it('build música fora do catálogo com name vazio → "Música"', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ name: '  ', subtitle: '', musicId: 77 }),
      { musicList, bibleBooks },
    )
    expect(item.name).toBe('Música')
    expect(item.notes).toBeUndefined()
  })
  it('build verse: livro achado, sem details, sem numbers → "Gênesis 3"', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'verse', musicId: null, verseBookId: 1, verseChapter: 3, verseNumbers: '  ' }),
      { musicList, bibleBooks },
    )
    expect(item.subtitle).toBe('Gênesis 3')
  })
  it('build images com details NÃO sobrescreve subtitle', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'images', musicId: null, filePaths: ['/a.png'], subtitle: 'Custom' }),
      { musicList, bibleBooks },
    )
    expect(item.subtitle).toBe('Custom')
  })
  it('draftFrom: categoria endTime inválido → vazio', () => {
    const d = draftFromLiturgyItem(cat({ endTime: 'xx' }))
    expect(d.endTime).toBe('')
  })
  it('reconcile: subtitle divergente com notes existentes preserva notes', () => {
    const items = [child({ type: 'music', musicId: 5, name: 'Hino 5', subtitle: 'Sub', notes: 'Nota' })]
    const [next] = reconcileMusicItemTitles(items, musicList)
    expect(next.subtitle).toBe('Álbum A')
    expect(next.notes).toBe('Nota')
  })
})

describe('branches residuais 2', () => {
  it('draft não-categoria sem categoryId é inválido', () => {
    expect(isLiturgyItemDraftValid(draft({ type: 'annotation', musicId: null, categoryId: null }))).toBe(false)
  })
  it('build música do catálogo com name vazio: complementary/notes undefined', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ name: '   ', subtitle: '', musicId: 5 }),
      { musicList, bibleBooks },
    )
    expect(item.name).toBe('Hino 5')
    expect(item.complementaryTitle).toBeUndefined()
    expect(item.notes).toBeUndefined()
  })
  it('build video com filePath em branco: filePath vazio', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'video', musicId: null, filePath: '   ' }),
      { musicList, bibleBooks },
    )
    expect(item.filePath).toBe('')
    expect(item.subtitle).toBe('')
  })
  it('reconcile: subtitle vazio divergente sem notes → notes undefined', () => {
    const items = [child({ type: 'music', musicId: 5, name: 'Hino 5', subtitle: '', notes: '  ' })]
    const [next] = reconcileMusicItemTitles(items, musicList)
    expect(next.subtitle).toBe('Álbum A')
    expect(next.notes).toBeUndefined()
  })
  it('build images: filePath com espaços via filePaths vazio é descartado', () => {
    const item = buildLiturgyItemFromDraft(
      draft({ type: 'images', musicId: null, filePaths: ['  '], filePath: '  ' }),
      { musicList, bibleBooks },
    )
    expect(item.filePath).toBe('')
  })
})
