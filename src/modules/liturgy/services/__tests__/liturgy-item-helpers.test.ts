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
