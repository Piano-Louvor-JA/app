// @vitest-environment jsdom
// liturgy-item-helpers — funções puras: IDs, categorias, reorder, clone, draft build/reconcile
import { describe, it, expect, vi } from 'vitest'
import {
  createLiturgyItemId,
  resolvePreferredCategoryId,
  findCategoryInsertIndex,
  getCategoryBlockEnd,
  reorderLiturgyItems,
  cloneLiturgyItems,
  isExecutableItem,
  isLiturgyMediaPlayType,
  getItemTypeIcon,
  getItemTypeTone,
  normalizeItemType,
  getSectionItemNumber,
  clampMomentDurationMs,
  formatMomentDuration,
  isValidLiturgyUrl,
  isLiturgyItemDraftValid,
  buildLiturgyItemFromDraft,
  draftFromLiturgyItem,
  reconcileMusicItemTitles,
  clearDoneFlags,
} from '../liturgy-item-helpers'
import type { LiturgyItem, LiturgyItemDraft } from '../../types/liturgy'

vi.mock('../liturgy-format', () => ({
  normalizeLiturgyTimeHHmm: vi.fn((v: unknown) => {
    if (typeof v !== 'string') return null
    const m = v.match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return null
    return `${m[1].padStart(2, '0')}:${m[2]}`
  }),
  pad2: (n: number) => String(n).padStart(2, '0'),
}))

function item(partial: Partial<LiturgyItem> & { id: string; type: LiturgyItem['type'] }): LiturgyItem {
  return {
    name: partial.id,
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '#fff',
    categoryId: null,
    startTime: null,
    endTime: null,
    ...partial,
  } as LiturgyItem
}

describe('createLiturgyItemId', () => {
  it('gera ids únicos com timestamp-random', () => {
    const a = createLiturgyItemId()
    const b = createLiturgyItemId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^\d+-[a-z0-9]+$/)
  })
})

describe('resolvePreferredCategoryId', () => {
  it('selected é categoria: usa o id dela', () => {
    const cat = item({ id: 'c1', type: 'category' })
    expect(resolvePreferredCategoryId([], cat)).toBe('c1')
  })

  it('selected com categoryId: usa o categoryId', () => {
    const child = item({ id: 'x', type: 'music', categoryId: 'c2' })
    expect(resolvePreferredCategoryId([], child)).toBe('c2')
  })

  it('selected solto: busca última categoria da lista', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      item({ id: 'x', type: 'music' }),
      item({ id: 'c2', type: 'category' }),
      item({ id: 'y', type: 'music' }),
    ]
    expect(resolvePreferredCategoryId(items, null)).toBe('c2')
  })

  it('sem categoria em lugar nenhum: null', () => {
    const items = [item({ id: 'x', type: 'music' })]
    expect(resolvePreferredCategoryId(items, null)).toBeNull()
  })
})

describe('findCategoryInsertIndex / getCategoryBlockEnd', () => {
  const items = [
    item({ id: 'c1', type: 'category' }),
    item({ id: 'a', type: 'music', categoryId: 'c1' }),
    item({ id: 'b', type: 'verse', categoryId: 'c1' }),
    item({ id: 'z', type: 'music' }),
  ]

  it('insere após o último filho da categoria', () => {
    expect(findCategoryInsertIndex(items, 'c1')).toBe(3)
  })

  it('categoria inexistente: fim da lista', () => {
    expect(findCategoryInsertIndex(items, 'nope')).toBe(items.length)
  })

  it('blockEnd da categoria = insertIndex', () => {
    expect(getCategoryBlockEnd(items, 0)).toBe(3)
  })

  it('blockEnd de não-categoria: index+1', () => {
    expect(getCategoryBlockEnd(items, 3)).toBe(4)
  })

  it('blockEnd fora da lista: index+1', () => {
    expect(getCategoryBlockEnd(items, 99)).toBe(100)
  })
})

describe('reorderLiturgyItems', () => {
  it('mesmo índice: retorna a lista intacta', () => {
    const items = [item({ id: 'a', type: 'music' }), item({ id: 'b', type: 'music' })]
    expect(reorderLiturgyItems(items, 0, 0)).toBe(items)
  })

  it('índices inválidos: intacta', () => {
    const items = [item({ id: 'a', type: 'music' })]
    expect(reorderLiturgyItems(items, -1, 0)).toBe(items)
    expect(reorderLiturgyItems(items, 0, 99)).toBe(items)
  })

  it('item simples move', () => {
    const items = [
      item({ id: 'a', type: 'music' }),
      item({ id: 'b', type: 'music' }),
      item({ id: 'c', type: 'music' }),
    ]
    const next = reorderLiturgyItems(items, 0, 2)
    expect(next.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('categoria move com filhos contíguos', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      item({ id: 'a', type: 'music', categoryId: 'c1' }),
      item({ id: 'z', type: 'music' }),
      item({ id: 'c2', type: 'category' }),
      item({ id: 'b', type: 'music', categoryId: 'c2' }),
    ]
    const next = reorderLiturgyItems(items, 0, 4)
    // bloco c1 (c1,a) move pra depois de c2... target é filho de c2 → insertAt antes de c2? testar ordem estável
    expect(next[0].id).not.toBe('c1')
    expect(next.some((i) => i.id === 'a' && i.categoryId === 'c1')).toBe(true)
  })

  it('mover categoria pra dentro do próprio bloco: intacta', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      item({ id: 'a', type: 'music', categoryId: 'c1' }),
    ]
    expect(reorderLiturgyItems(items, 0, 1)).toBe(items)
  })
})

describe('cloneLiturgyItems', () => {
  it('novos ids, categoryId remapeado, done=false', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      item({ id: 'x', type: 'music', categoryId: 'c1', done: true }),
    ]
    const cloned = cloneLiturgyItems(items)
    expect(cloned[0].id).not.toBe('c1')
    expect(cloned[1].categoryId).toBe(cloned[0].id)
    expect(cloned[1].done).toBe(false)
  })
})

describe('tipos', () => {
  it('isExecutableItem', () => {
    expect(isExecutableItem({ type: 'music' })).toBe(true)
  })

  it('isLiturgyMediaPlayType: mídias marcam done', () => {
    for (const t of ['music', 'audio', 'video', 'online_video', 'images', 'pdf', 'presentation'] as const) {
      expect(isLiturgyMediaPlayType(t)).toBe(true)
    }
    expect(isLiturgyMediaPlayType('verse')).toBe(false)
  })

  it('getItemTypeIcon/Tone: meta existente e fallback', () => {
    expect(getItemTypeIcon('music')).toBeTruthy()
    expect(getItemTypeTone('music')).toBeTruthy()
    expect(getItemTypeIcon('nao_existe' as never)).toBe('ti-help')
    expect(getItemTypeTone('nao_existe' as never)).toBe('grey')
  })

  it('normalizeItemType: aliases', () => {
    expect(normalizeItemType('media')).toBe('other_files')
    expect(normalizeItemType('files')).toBe('other_files')
    expect(normalizeItemType('link')).toBe('site')
    expect(normalizeItemType('music')).toBe('music')
    expect(normalizeItemType(42)).toBeNull()
  })
})

describe('getSectionItemNumber', () => {
  it('null em categoria', () => {
    const items = [item({ id: 'c1', type: 'category' })]
    expect(getSectionItemNumber(items, 0)).toBeNull()
  })

  it('contagem reinicia na categoria', () => {
    const items = [
      item({ id: 'a', type: 'music' }),
      item({ id: 'c1', type: 'category' }),
      item({ id: 'b', type: 'music', categoryId: 'c1' }),
      item({ id: 'c', type: 'verse', categoryId: 'c1' }),
    ]
    expect(getSectionItemNumber(items, 0)).toBe(1)
    expect(getSectionItemNumber(items, 2)).toBe(1)
    expect(getSectionItemNumber(items, 3)).toBe(2)
  })
})

describe('clampMomentDurationMs / formatMomentDuration', () => {
  it('clamp: <=0 → 0', () => {
    expect(clampMomentDurationMs(0)).toBe(0)
    expect(clampMomentDurationMs(-5)).toBe(0)
  })

  it('clamp: arredonda pra segundo e respeita limites', () => {
    expect(clampMomentDurationMs(1500)).toBe(2000)
  })

  it('format mm:ss', () => {
    expect(formatMomentDuration(65000)).toBe('01:05')
    expect(formatMomentDuration(-10)).toBe('00:00')
  })
})

describe('isValidLiturgyUrl', () => {
  it('urls válidas', () => {
    expect(isValidLiturgyUrl('https://youtube.com/watch?v=1')).toBe(true)
    expect(isValidLiturgyUrl('youtube.com')).toBe(true)
    expect(isValidLiturgyUrl('localhost')).toBe(true)
    expect(isValidLiturgyUrl('192.168.0.1')).toBe(true)
  })

  it('urls inválidas', () => {
    expect(isValidLiturgyUrl('')).toBe(false)
    expect(isValidLiturgyUrl('   ')).toBe(false)
    expect(isValidLiturgyUrl('.com')).toBe(false)
    expect(isValidLiturgyUrl('https://.com')).toBe(false)
  })
})

describe('isLiturgyItemDraftValid', () => {
  const validBase: LiturgyItemDraft = {
    type: 'music',
    name: 'Hino X',
    subtitle: '',
    durationMs: 0,
    accentColor: '#fff',
    categoryId: 'c1',
    startTime: '',
    endTime: '',
    musicId: 1,
    musicMode: 'audio',
    verseBookId: null,
    verseChapter: null,
    verseNumbers: '',
    filePath: '',
    filePaths: [],
    playerId: 'default',
    url: '',
    presentationEngine: 'auto',
  }

  it('válido', () => {
    expect(isLiturgyItemDraftValid(validBase)).toBe(true)
  })

  it('sem tipo ou nome vazio: inválido', () => {
    expect(isLiturgyItemDraftValid({ ...validBase, type: null })).toBe(false)
    expect(isLiturgyItemDraftValid({ ...validBase, name: '  ' })).toBe(false)
  })

  it('category exige start/end', () => {
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'category', categoryId: null, startTime: '10:00', endTime: '11:00' })).toBe(true)
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'category', categoryId: null, startTime: '', endTime: '11:00' })).toBe(false)
  })

  it('music sem musicId: inválido', () => {
    expect(isLiturgyItemDraftValid({ ...validBase, musicId: null })).toBe(false)
  })

  it('não-category exige categoryId', () => {
    expect(isLiturgyItemDraftValid({ ...validBase, categoryId: null })).toBe(false)
  })

  it('images exige filePaths ou filePath', () => {
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'images', filePaths: ['/a.png'] })).toBe(true)
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'images', filePath: '/a.png' })).toBe(true)
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'images', filePaths: [], filePath: '' })).toBe(false)
  })

  it('video/pdf/presentation exigem filePath', () => {
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'video', filePath: '' })).toBe(false)
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'pdf', filePath: '/x.pdf' })).toBe(true)
  })

  it('site/online_video exigem url válida', () => {
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'site', url: 'nope' })).toBe(false)
    expect(isLiturgyItemDraftValid({ ...validBase, type: 'online_video', url: 'https://vimeo.com/1' })).toBe(true)
  })
})

describe('buildLiturgyItemFromDraft', () => {
  const ctx = {
    musicList: [{ id: 1, displayLabel: 'Hino 1', albumNames: 'Album A' }],
    bibleBooks: [{ id: 'gn', name: 'Gênesis' }],
  } as unknown as Parameters<typeof buildLiturgyItemFromDraft>[1]
  const baseDraft: LiturgyItemDraft = {
    type: 'other_files',
    name: 'Item',
    subtitle: '',
    durationMs: 0,
    accentColor: '#fff',
    categoryId: 'c1',
    startTime: '',
    endTime: '',
    musicId: null,
    musicMode: 'audio',
    verseBookId: null,
    verseChapter: null,
    verseNumbers: '',
    filePath: '',
    filePaths: [],
    playerId: 'default',
    url: '',
    presentationEngine: 'auto',
  }

  it('sem tipo: throw', () => {
    expect(() => buildLiturgyItemFromDraft({ ...baseDraft, type: null }, ctx)).toThrow()
  })

  it('category: times normalizados, categoryId null', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'category', categoryId: null, startTime: '09:05', endTime: '10:00' },
      ctx,
    )
    expect(built.startTime).toBe('09:05')
    expect(built.categoryId).toBeNull()
    expect(built.durationMs).toBe(0)
  })

  it('music com match: nome do catálogo, complementary do draft', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'music', name: 'Título livre', musicId: 1 },
      ctx,
    )
    expect(built.name).toBe('Hino 1')
    expect(built.complementaryTitle).toBe('Título livre')
    expect(built.subtitle).toBe('Album A')
  })

  it('music sem match: nome fallback', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'music', name: '', musicId: 99 },
      ctx,
    )
    expect(built.name).toBe('Música')
    expect(built.complementaryTitle).toBeUndefined()
  })

  it('verse: subtitle montado do livro quando sem details', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'verse', verseBookId: 'gn', verseChapter: 3, verseNumbers: '16' },
      ctx,
    )
    expect(built.subtitle).toBe('Gênesis 3:16')
  })

  it('verse com book desconhecido: subtitle fica', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'verse', verseBookId: 'zz', verseChapter: 1, verseNumbers: '' },
      ctx,
    )
    expect(built.subtitle).toBe('')
  })

  it('images: filePaths normalizados e subtitle auto', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'images', filePaths: ['/img/a.png', '/img/b.png'] },
      ctx,
    )
    expect(built.filePaths).toEqual(['/img/a.png', '/img/b.png'])
    expect(built.subtitle).toBe('2 imagens')
  })

  it('images 1 path: subtitle = filename', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'images', filePaths: ['/img/foto.png'] },
      ctx,
    )
    expect(built.subtitle).toBe('foto.png')
  })

  it('video: playerId default não persiste', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'video', filePath: '/v.mp4', playerId: 'default' },
      ctx,
    )
    expect(built.playerId).toBeUndefined()
    expect(built.filePath).toBe('/v.mp4')
  })

  it('video: playerId explícito persiste', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'video', filePath: '/v.mp4', playerId: 'vlc' },
      ctx,
    )
    expect(built.playerId).toBe('vlc')
  })

  it('presentation: engine auto não persiste', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'presentation', filePath: '/p.pptx', presentationEngine: 'auto' },
      ctx,
    )
    expect(built.presentationEngine).toBeUndefined()
  })

  it('presentation: engine explícita persiste', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'presentation', filePath: '/p.pptx', presentationEngine: 'libreoffice' },
      ctx,
    )
    expect(built.presentationEngine).toBe('libreoffice')
  })

  it('site: url trimado e subtitle auto', () => {
    const built = buildLiturgyItemFromDraft(
      { ...baseDraft, type: 'site', url: '  https://exemplo.com  ' },
      ctx,
    )
    expect(built.url).toBe('https://exemplo.com')
    expect(built.subtitle).toBe('https://exemplo.com')
  })
})

describe('draftFromLiturgyItem', () => {
  it('roundtrip de item file', () => {
    const src: LiturgyItem = item({ id: 'x', type: 'video', filePath: '/v.mp4', durationMs: 65000 })
    const draft = draftFromLiturgyItem(src)
    expect(draft.type).toBe('video')
    expect(draft.filePath).toBe('/v.mp4')
    expect(draft.durationMs).toBe(65000)
  })

  it('music: name vem de complementaryTitle', () => {
    const src: LiturgyItem = item({ id: 'm', type: 'music', musicId: 5, complementaryTitle: 'Título', name: 'Hino 5' })
    const draft = draftFromLiturgyItem(src)
    expect(draft.name).toBe('Título')
  })

  it('category: times preservados', () => {
    const src: LiturgyItem = item({ id: 'c', type: 'category', startTime: '08:00', endTime: '09:30' })
    const draft = draftFromLiturgyItem(src)
    expect(draft.startTime).toBe('08:00')
    expect(draft.endTime).toBe('09:30')
    expect(draft.durationMs).toBe(0)
  })
})

describe('reconcileMusicItemTitles', () => {
  const musicList = [{ id: 1, displayLabel: 'Hino 1 — Novo', albumNames: 'Album X' }] as unknown as Parameters<typeof reconcileMusicItemTitles>[1]

  it('musicList vazia: intacta', () => {
    const items = [item({ id: 'a', type: 'music' })]
    expect(reconcileMusicItemTitles(items, [])).toBe(items)
  })

  it('alinha nome e album, guarda nome antigo como complementary', () => {
    const items = [item({ id: 'a', type: 'music', musicId: 1, name: 'Nome antigo', subtitle: 'Album velho' })]
    const next = reconcileMusicItemTitles(items, musicList)
    expect(next[0].name).toBe('Hino 1 — Novo')
    expect(next[0].complementaryTitle).toBe('Nome antigo')
    expect(next[0].subtitle).toBe('Album X')
    expect(next[0].notes).toBe('Album velho')
  })

  it('id já alinhado: retorna a mesma referência', () => {
    const items = [item({ id: 'a', type: 'music', musicId: 1, name: 'Hino 1 — Novo', subtitle: 'Album X' })]
    expect(reconcileMusicItemTitles(items, musicList)).toBe(items)
  })

  it('não-música ou sem musicId: intacta', () => {
    const items = [item({ id: 'a', type: 'verse' })]
    expect(reconcileMusicItemTitles(items, musicList)).toBe(items)
  })
})

describe('clearDoneFlags', () => {
  it('zera done em todos', () => {
    const items = [
      item({ id: 'a', type: 'music', done: true }),
      item({ id: 'b', type: 'verse', done: true }),
    ]
    const next = clearDoneFlags(items)
    expect(next.every((i) => i.done === false)).toBe(true)
  })
})

describe('mutação round 1 — resolvePreferredCategoryId / findCategoryInsertIndex / blockEnd', () => {
  it('selected null + lista vazia: null', () => {
    expect(resolvePreferredCategoryId([], null)).toBeNull()
  })

  it('selected solto com categoryId: usa categoryId (não o id)', () => {
    const child = item({ id: 'x1', type: 'music', categoryId: 'c9' })
    expect(resolvePreferredCategoryId([], child)).toBe('c9')
  })

  it('varredura pega a ÚLTIMA categoria (loop reverso)', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      item({ id: 'm1', type: 'music' }),
      item({ id: 'c2', type: 'category' }),
    ]
    expect(resolvePreferredCategoryId(items, null)).toBe('c2')
  })

  it('selected categoria cujo id não é string vazia: retorna id', () => {
    const cat = item({ id: 'cat-x', type: 'category' })
    expect(resolvePreferredCategoryId([], cat)).toBe('cat-x')
  })

  it('categoria inexistente: insert = items.length', () => {
    expect(findCategoryInsertIndex([item({ id: 'm1', type: 'music' })], 'nope')).toBe(1)
  })

  it('filhos de OUTRA categoria param o scan (contiguidade)', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      item({ id: 'f1', type: 'music', categoryId: 'c1' }),
      item({ id: 'f2', type: 'music', categoryId: 'c2' }),
    ]
    expect(findCategoryInsertIndex(items, 'c1')).toBe(2)
  })

  it('child undefined no meio: para (guard !child)', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      undefined as unknown as LiturgyItem,
      item({ id: 'f1', type: 'music', categoryId: 'c1' }),
    ]
    expect(findCategoryInsertIndex(items, 'c1')).toBe(1)
  })

  it('blockEnd em índice não-categoria: index+1', () => {
    const items = [item({ id: 'm1', type: 'music' }), item({ id: 'm2', type: 'music' })]
    expect(getCategoryBlockEnd(items, 0)).toBe(1)
  })

  it('blockEnd índice fora: index+1 (guard !category)', () => {
    expect(getCategoryBlockEnd([], 3)).toBe(4)
  })

  it('blockEnd categoria com filhos contíguos: fim do bloco', () => {
    const items = [
      item({ id: 'c1', type: 'category' }),
      item({ id: 'f1', type: 'music', categoryId: 'c1' }),
      item({ id: 'f2', type: 'music', categoryId: 'c1' }),
      item({ id: 'm2', type: 'music' }),
    ]
    expect(getCategoryBlockEnd(items, 0)).toBe(3)
  })
})

describe('mutação round 2 — reorderLiturgyItems', () => {
  const flat = () => [
    item({ id: 'a', type: 'music' }),
    item({ id: 'b', type: 'music' }),
    item({ id: 'c', type: 'music' }),
  ]

  it('same index: retorna a MESMA referência', () => {
    const items = flat()
    expect(reorderLiturgyItems(items, 1, 1)).toBe(items)
  })

  it('fromIndex fora (>= length): mesma referência', () => {
    const items = flat()
    expect(reorderLiturgyItems(items, 3, 0)).toBe(items)
  })

  it('toIndex fora: mesma referência', () => {
    const items = flat()
    expect(reorderLiturgyItems(items, 0, 5)).toBe(items)
  })

  it('índice negativo: mesma referência', () => {
    const items = flat()
    expect(reorderLiturgyItems(items, -1, 0)).toBe(items)
  })

  it('item simples move pra frente', () => {
    expect(reorderLiturgyItems(flat(), 0, 2).map((i: LiturgyItem) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('item simples move pra trás', () => {
    expect(reorderLiturgyItems(flat(), 2, 0).map((i: LiturgyItem) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('categoria com bloco move inteira pra trás', () => {
    const items = [
      item({ id: 'a', type: 'music' }),
      item({ id: 'cat', type: 'category' }),
      item({ id: 'f1', type: 'music', categoryId: 'cat' }),
      item({ id: 'f2', type: 'music', categoryId: 'cat' }),
    ]
    const result = reorderLiturgyItems(items, 1, 0)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(['cat', 'f1', 'f2', 'a'])
  })

  it('categoria com bloco move inteira pra frente', () => {
    const items = [
      item({ id: 'cat', type: 'category' }),
      item({ id: 'f1', type: 'music', categoryId: 'cat' }),
      item({ id: 'a', type: 'music' }),
      item({ id: 'b', type: 'music' }),
    ]
    const result = reorderLiturgyItems(items, 0, 3)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(['a', 'b', 'cat', 'f1'])
  })

  it('drop DENTRO do próprio bloco: inalterado', () => {
    const items = [
      item({ id: 'cat', type: 'category' }),
      item({ id: 'f1', type: 'music', categoryId: 'cat' }),
      item({ id: 'a', type: 'music' }),
    ]
    expect(reorderLiturgyItems(items, 0, 1)).toBe(items)
  })

  it('categoria solta sobre filho de OUTRA categoria: vai pro índice da categoria-alvo', () => {
    const items = [
      item({ id: 'catA', type: 'category' }),
      item({ id: 'fa', type: 'music', categoryId: 'catA' }),
      item({ id: 'catB', type: 'category' }),
      item({ id: 'fb', type: 'music', categoryId: 'catB' }),
    ]
    // catA (0) drop em 3 (fb, filho de catB) → resolve pra categoria catB (2) → insere no fim do bloco B
    const result = reorderLiturgyItems(items, 0, 3)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(['catB', 'fb', 'catA', 'fa'])
  })

  it('categoria solta sobre item solto abaixo: toIndex+1', () => {
    const items = [
      item({ id: 'cat', type: 'category' }),
      item({ id: 'f1', type: 'music', categoryId: 'cat' }),
      item({ id: 'a', type: 'music' }),
      item({ id: 'b', type: 'music' }),
    ]
    const result = reorderLiturgyItems(items, 0, 3)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(['a', 'b', 'cat', 'f1'])
  })

  it('clone remapeia categoria mesmo quando filho vem antes do pai na lista', () => {
    const items = [
      item({ id: 'f1', type: 'music', categoryId: 'cat' }),
      item({ id: 'cat', type: 'category' }),
    ]
    const result = cloneLiturgyItems(items)
    expect(result[1]!.id).not.toBe('cat')
    expect(result[0]!.categoryId).toBe(result[1]!.id)
    expect(result.every((i: LiturgyItem) => i.done === false)).toBe(true)
  })
})

describe('mutação round 3 — buildLiturgyItemFromDraft branch最深', () => {
  const ctx = {
    musicList: [{ id: 1, displayLabel: 'Hino 1', albumNames: 'Album A' }],
    bibleBooks: [{ id: 'gn', name: 'Gênesis' }],
  } as unknown as Parameters<typeof buildLiturgyItemFromDraft>[1]
  const base: LiturgyItemDraft = {
    type: 'other_files',
    name: 'Item',
    subtitle: '',
    durationMs: 0,
    accentColor: '#fff',
    categoryId: 'c1',
    startTime: '',
    endTime: '',
    musicId: null,
    musicMode: 'audio',
    verseBookId: null,
    verseChapter: null,
    verseNumbers: '',
    filePath: '',
    filePaths: [],
    playerId: 'default',
    url: '',
    presentationEngine: 'auto',
  }

  it('music durationMs <= 0: duration 0 (não clamp)', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'music', musicId: 99, durationMs: -5 } as LiturgyItemDraft,
      ctx,
    )
    expect(built.durationMs).toBe(0)
  })

  it('music durationMs > 0: clamp em steps de 1000', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'music', musicId: 99, durationMs: 1500 } as LiturgyItemDraft,
      ctx,
    )
    expect(built.durationMs).toBe(2000)
  })

  it('music com match + notes: complementaryTitle só se name vazio→undefined', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'music', musicId: 1, name: '  ', subtitle: 'nota' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.name).toBe('Hino 1')
    expect(built.complementaryTitle).toBeUndefined()
    expect(built.notes).toBe('nota')
  })

  it('music sem match: subtitle vazio e name fallback Música', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'music', musicId: 404, name: '' } as unknown as LiturgyItemDraft,
      ctx,
    )
    expect(built.name).toBe('Música')
    expect(built.subtitle).toBe('')
    expect(built.complementaryTitle).toBeUndefined()
  })

  it('verse com book + sem details: monta "Gênesis 3:4-5"', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'verse', verseBookId: 'gn', verseChapter: 3, verseNumbers: '4-5' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.subtitle).toBe('Gênesis 3:4-5')
  })

  it('verse sem numbers: só capítulo', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'verse', verseBookId: 'gn', verseChapter: 3 } as LiturgyItemDraft,
      ctx,
    )
    expect(built.subtitle).toBe('Gênesis 3')
  })

  it('images com filePaths vazio + filePath preenchido: converte e filtra vazios', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'images', filePath: ' /tmp/a.jpg ', filePaths: [], name: 'x' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.filePaths).toEqual(['/tmp/a.jpg'])
    expect(built.filePath).toBe('/tmp/a.jpg')
  })

  it('images múltiplos paths + sem details: subtitle "N imagens"', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'images', filePaths: ['/x/um.jpg', '/x/dois.jpg'] } as LiturgyItemDraft,
      ctx,
    )
    expect(built.subtitle).toBe('2 imagens')
  })

  it('video playerId default: NÃO persiste', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'video', filePath: '/v.mp4', playerId: 'default' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.playerId).toBeUndefined()
  })

  it('audio playerId explícito: persiste', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'audio', filePath: '/a.mp3', playerId: 'vlc' } as unknown as LiturgyItemDraft,
      ctx,
    )
    expect(built.playerId).toBe('vlc')
  })

  it('file não-images com filePath e sem details: subtitle filename', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'pdf', filePath: '/docs/manual.pdf' } as unknown as LiturgyItemDraft,
      ctx,
    )
    expect(built.subtitle).toBe('manual.pdf')
  })

  it('online_video com url sem details: subtitle = url', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'online_video', url: ' https://v.com/x ' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.url).toBe('https://v.com/x')
    expect(built.subtitle).toBe('https://v.com/x')
  })
})

describe('mutação round 4 — draftFromLiturgyItem + isValidLiturgyUrl + draftValid', () => {
  it('draftFrom music: name vem de complementaryTitle, subtitle de notes', () => {
    const d = draftFromLiturgyItem(
      item({ id: 'm', type: 'music', name: 'Nome', complementaryTitle: 'Comp', notes: 'Notas', durationMs: 90_000 }),
    )
    expect(d.name).toBe('Comp')
    expect(d.subtitle).toBe('Notas')
    expect(d.durationMs).toBe(90_000)
  })

  it('draftFrom music sem complementary: name vazio', () => {
    const d = draftFromLiturgyItem(item({ id: 'm', type: 'music', name: 'Nome', complementaryTitle: null }))
    expect(d.name).toBe('')
  })

  it('draftFrom category: times normalizados; music duration <=0: 0', () => {
    const d = draftFromLiturgyItem(
      item({ id: 'c', type: 'category', startTime: '9:05', endTime: '10:00', durationMs: 0 }),
    )
    expect(d.startTime).toBe('09:05')
    expect(d.endTime).toBe('10:00')
    expect(d.durationMs).toBe(0)
  })

  it('draftFrom: filePaths vazio + filePath presente → [filePath]', () => {
    const d = draftFromLiturgyItem(item({ id: 'v', type: 'video', filePath: '/v.mp4' }))
    expect(d.filePaths).toEqual(['/v.mp4'])
  })

  it('draftFrom: players/url/engine defaults', () => {
    const d = draftFromLiturgyItem(item({ id: 's', type: 'site' }))
    expect(d.playerId).toBe('default')
    expect(d.url).toBe('')
    expect(d.presentationEngine).toBe('auto')
    expect(d.verseBookId).toBeNull()
    expect(d.verseNumbers).toBe('')
  })

  it('isValidLiturgyUrl: casos', () => {
    expect(isValidLiturgyUrl('')).toBe(false)
    expect(isValidLiturgyUrl('   ')).toBe(false)
    expect(isValidLiturgyUrl('http://localhost:3000/x')).toBe(true)
    expect(isValidLiturgyUrl('192.168.0.10')).toBe(true)
    expect(isValidLiturgyUrl('youtube.com/watch?v=1')).toBe(true)
    expect(isValidLiturgyUrl('.invalid')).toBe(false)
    expect(isValidLiturgyUrl('host.')).toBe(false)
    expect(isValidLiturgyUrl('ht tp://x')).toBe(false)
    expect(isValidLiturgyUrl('no host at all')).toBe(false)
  })

  it('isLiturgyItemDraftValid: category sem start/end inválido', () => {
    expect(isLiturgyItemDraftValid({ type: 'category', name: 'X' } as LiturgyItemDraft)).toBe(false)
  })

  it('isLiturgyItemDraftValid: music sem musicId inválido', () => {
    expect(isLiturgyItemDraftValid({ type: 'music', name: 'X', categoryId: 'c' } as LiturgyItemDraft)).toBe(false)
  })

  it('isLiturgyItemDraftValid: não-category sem categoryId inválido', () => {
    expect(isLiturgyItemDraftValid({ type: 'video', name: 'X', filePath: '/v.mp4' } as LiturgyItemDraft)).toBe(false)
  })

  it('isLiturgyItemDraftValid: images com filePaths e sem filePaths/path inválido', () => {
    expect(isLiturgyItemDraftValid({ type: 'images', name: 'X', categoryId: 'c', filePaths: ['/a.jpg'] } as unknown as LiturgyItemDraft)).toBe(true)
    expect(isLiturgyItemDraftValid({ type: 'images', name: 'X', categoryId: 'c', filePaths: [], filePath: '' } as unknown as LiturgyItemDraft)).toBe(false)
  })

  it('isLiturgyItemDraftValid: site com url inválida', () => {
    expect(isLiturgyItemDraftValid({ type: 'site', name: 'X', categoryId: 'c', url: 'nope nope' } as unknown as LiturgyItemDraft)).toBe(false)
  })

  it('isLiturgyItemDraftValid: name vazio', () => {
    expect(isLiturgyItemDraftValid({ type: 'video', name: '  ', categoryId: 'c', filePath: '/v.mp4' } as unknown as LiturgyItemDraft)).toBe(false)
  })
})

describe('mutação round 5 — reconcile + getSectionItemNumber + clamp', () => {
  it('reconcile: título divergente → alinha e guarda complementaryTitle', () => {
    const items = [item({ id: 'm1', type: 'music', name: 'Nome antigo', musicId: 1 })]
    const result = reconcileMusicItemTitles(items, [{ id: 1, displayLabel: 'Novo Nome', albumNames: 'Alb' }] as never)
    expect(result[0]!.name).toBe('Novo Nome')
    expect(result[0]!.complementaryTitle).toBe('Nome antigo')
  })

  it('getSectionItemNumber: reinicia depois de categoria', () => {
    const items = [
      item({ id: 'c', type: 'category' }),
      item({ id: 'a', type: 'music' }),
      item({ id: 'b', type: 'music' }),
    ]
    expect(getSectionItemNumber(items, 0)).toBeNull()
    expect(getSectionItemNumber(items, 1)).toBe(1)
    expect(getSectionItemNumber(items, 2)).toBe(2)
  })

  it('clamp: negativo 0, acima do máx clampado', () => {
    expect(clampMomentDurationMs(-1)).toBe(0)
    expect(clampMomentDurationMs(999_999_999)).toBeLessThanOrEqual(999_999_999)
  })

  it('format: 0 → 00:00, 61s → 01:01', () => {
    expect(formatMomentDuration(0)).toBe('00:00')
    expect(formatMomentDuration(61_000)).toBe('01:01')
  })

  it('normalizeItemType: válido mantém, desconhecido null', () => {
    expect(normalizeItemType('video')).toBe('video')
    expect(normalizeItemType('outra-coisa' as never)).toBeNull()
  })

  it('getItemTypeIcon/Tone: retornam algo pra cada tipo', () => {
    expect(getItemTypeIcon('music')).toBeTruthy()
    expect(getItemTypeTone('verse')).toBeTruthy()
  })
})

describe('mutação round 6 — reorder quirúrgico (drop em filho/próprio bloco/direção)', () => {
  const build = () => [
    item({ id: 'catA', type: 'category' }),
    item({ id: 'fa1', type: 'music', categoryId: 'catA' }),
    item({ id: 'fa2', type: 'music', categoryId: 'catA' }),
    item({ id: 'catB', type: 'category' }),
    item({ id: 'fb1', type: 'music', categoryId: 'catB' }),
    item({ id: 'fb2', type: 'music', categoryId: 'catB' }),
  ]

  it('categoria A drop em fa1 (PRÓPRIO filho): inalterado (mesma referência)', () => {
    const items = build()
    expect(reorderLiturgyItems(items, 0, 1)).toBe(items)
  })

  it('categoria A drop em fa2 (dentro do bloco A, toIndex<blockEnd): inalterado', () => {
    const items = build()
    const result = reorderLiturgyItems(items, 0, 2)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(items.map((i: LiturgyItem) => i.id))
  })

  it('categoria A drop em fa1 de B (filho, pai depois): insere no FIM do bloco B', () => {
    const result = reorderLiturgyItems(build(), 0, 4)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(['catB', 'fb1', 'fb2', 'catA', 'fa1', 'fa2'])
  })

  it('categoria B drop em fa2 de A (filho, pai antes): insere no FIM do bloco A', () => {
    const result = reorderLiturgyItems(build(), 3, 2)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(['catB', 'fb1', 'fb2', 'catA', 'fa1', 'fa2'])
  })

  it('item simples DEPOIS de categoria: filho vira solto e entra no lugar', () => {
    const items = build()
    // fa1 (1) → toIndex 0 (dentro do próprio bloco!): fromIndex>toIndex, não-categoria → move simples
    const result = reorderLiturgyItems(items, 1, 0)
    expect(result.map((i: LiturgyItem) => i.id)).toEqual(['fa1', 'catA', 'fa2', 'catB', 'fb1', 'fb2'])
  })

  it('fromIndex==toIndex via caminho interno (bloco A → catA fim): inalterado', () => {
    const items = build()
    expect(reorderLiturgyItems(items, 0, 2)).toBe(items)
  })

  it('index == items.length-1 válido; == items.length inválido', () => {
    const items = build()
    expect(reorderLiturgyItems(items, 0, items.length)).toBe(items)
    expect(reorderLiturgyItems(items, items.length, 0)).toBe(items)
  })
})

describe('mutação round 7 — isValidLiturgyUrl quirúrgico', () => {
  it('hosts especiais', () => {
    expect(isValidLiturgyUrl('HTTPS://YouTube.COM/watch')).toBe(true)
    expect(isValidLiturgyUrl('http://127.0.0.1:8080')).toBe(true)
    expect(isValidLiturgyUrl('http://')).toBe(false)
    expect(isValidLiturgyUrl('a.b')).toBe(true)
    // URL nativo normaliza 'host..com' → host.com (dot vazio removido) → válido
    expect(isValidLiturgyUrl('host..com')).toBe(true)
    expect(isValidLiturgyUrl(':-)')).toBe(false)
  })
})

describe('mutação round 8 — build/draftFrom valor exato (ternários)', () => {
  const ctx = {
    musicList: [{ id: 1, displayLabel: 'Hino 1', albumNames: 'Album A' }],
    bibleBooks: [{ id: 'gn', name: 'Gênesis' }],
  } as unknown as Parameters<typeof buildLiturgyItemFromDraft>[1]
  const base: LiturgyItemDraft = {
    type: 'other_files',
    name: 'Item',
    subtitle: '',
    durationMs: 0,
    accentColor: '#fff',
    categoryId: 'c1',
    startTime: '',
    endTime: '',
    musicId: null,
    musicMode: 'audio',
    verseBookId: null,
    verseChapter: null,
    verseNumbers: '',
    filePath: '',
    filePaths: [],
    playerId: 'default',
    url: '',
    presentationEngine: 'auto',
  }

  it('category: durationMs 0 exato, start/end normalizados, sem null-merge', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'category', categoryId: null, startTime: '9:05', endTime: '10:00', durationMs: 5000 },
      ctx,
    )
    expect(built.durationMs).toBe(0)
    expect(built.startTime).toBe('09:05')
    expect(built.endTime).toBe('10:00')
    expect(built.categoryId).toBeNull()
  })

  it('não-category: start/end NULOS exatos', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'video', filePath: '/v.mp4', startTime: '9:05', endTime: '10:00' },
      ctx,
    )
    expect(built.startTime).toBeNull()
    expect(built.endTime).toBeNull()
  })

  it('done default false; done explícito true preservado; existingId preservado', () => {
    const d1 = buildLiturgyItemFromDraft({ ...base, type: 'video', filePath: '/v.mp4' }, ctx)
    expect(d1.done).toBe(false)
    const d2 = buildLiturgyItemFromDraft({ ...base, type: 'video', filePath: '/v.mp4' }, { ...ctx, done: true })
    expect(d2.done).toBe(true)
    const d3 = buildLiturgyItemFromDraft({ ...base, type: 'video', filePath: '/v.mp4' }, { ...ctx, existingId: 'keep-1' })
    expect(d3.id).toBe('keep-1')
  })

  it('outro tipo (não music/category): clamp SEM floor de 0', () => {
    const built = buildLiturgyItemFromDraft({ ...base, type: 'video', filePath: '/v.mp4', durationMs: -10 }, ctx)
    expect(built.durationMs).toBe(0) // clampMomentDurationMs(-10) = 0
    const b2 = buildLiturgyItemFromDraft({ ...base, type: 'video', filePath: '/v.mp4', durationMs: 1500 }, ctx)
    expect(b2.durationMs).toBe(2000)
  })

  it('music musicMode preservado (não default audio)', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'music', musicId: 1, musicMode: 'instrumental' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.musicMode).toBe('instrumental')
    expect(built.musicId).toBe(1)
  })

  it('music name preenchido: complementaryTitle = nome trimado', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'music', musicId: 1, name: ' Meu Hino ' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.name).toBe('Hino 1')
    expect(built.complementaryTitle).toBe('Meu Hino')
    expect(built.subtitle).toBe('Album A')
  })

  it('music sem match mas name preenchido: name = complementar (não Música)', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'music', musicId: 404, name: ' Cantado ' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.name).toBe('Cantado')
  })

  it('verse: capítulo 0/negativo e numbers com espaços', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'verse', verseBookId: 'gn', verseChapter: 0, verseNumbers: ' 4-5 ' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.verseChapter).toBe(0)
    expect(built.verseNumbers).toBe('4-5') // trim no build
    expect(built.subtitle).toBe('Gênesis 0:4-5')
  })

  it('verse com details: subtitle do draft PRESERVADO', () => {
    const built = buildLiturgyItemFromDraft(
      { ...base, type: 'verse', verseBookId: 'gn', verseChapter: 3, subtitle: 'Texto lido' } as LiturgyItemDraft,
      ctx,
    )
    expect(built.subtitle).toBe('Texto lido')
  })

  it('draftFrom não-category: subtitle direto (não trim de notes)', () => {
    const d = draftFromLiturgyItem(item({ id: 'v', type: 'video', filePath: '/v.mp4', subtitle: 'Sub', notes: 'Ignorado' }))
    expect(d.subtitle).toBe('Sub')
  })

  it('draftFrom category: durationMs SEMPRE 0 mesmo com valor', () => {
    const d = draftFromLiturgyItem(item({ id: 'c', type: 'category', durationMs: 8000 }))
    expect(d.durationMs).toBe(0)
  })

  it('draftFrom category: categoryId null exato', () => {
    const d = draftFromLiturgyItem(item({ id: 'c', type: 'category', categoryId: 'should-null' }))
    expect(d.categoryId).toBeNull()
  })

  it('draftFrom: filePaths múltiplos copiados (referência diferente)', () => {
    const src_item = item({ id: 'i', type: 'images', filePaths: ['/a.jpg', '/b.jpg'] })
    const d = draftFromLiturgyItem(src_item)
    expect(d.filePaths).toEqual(['/a.jpg', '/b.jpg'])
    expect(d.filePaths).not.toBe(src_item.filePaths)
  })
})
