import { describe, it, expect } from 'vitest'
import {
  createLiturgyItemId,
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
} from '../services/liturgy-item-helpers'
import type { LiturgyItem, LiturgyItemDraft, LiturgyMusicOption, LiturgyBibleBookOption } from '../types/liturgy'

describe('liturgy-item-helpers mutation kill — complement (12 conditionals)', () => {
  describe('createLiturgyItemId', () => {
    it('gera id único timestamp-random', () => {
      const id1 = createLiturgyItemId()
      const id2 = createLiturgyItemId()
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })
  })

  describe('cloneLiturgyItems', () => {
    it('novos IDs + categoryId remap + done=false', () => {
      const items: LiturgyItem[] = [
        { id: 'cat1', type: 'category', name: 'Cat1', done: true, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null },
        { id: 'item1', type: 'music', name: 'M1', done: true, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null },
      ]
      const cloned = cloneLiturgyItems(items)
      expect(cloned[0].id).not.toBe('cat1')
      expect(cloned[1].id).not.toBe('item1')
      expect(cloned[1].categoryId).toBe(cloned[0].id)
      expect(cloned[0].done).toBe(false)
      expect(cloned[1].done).toBe(false)
    })
  })

  describe('isExecutableItem / isLiturgyMediaPlayType', () => {
    it('isExecutableItem — music/video/audio/etc', () => {
      expect(isExecutableItem({ type: 'music' })).toBe(true)
      expect(isExecutableItem({ type: 'video' })).toBe(true)
      expect(isExecutableItem({ type: 'category' })).toBe(false)
      expect(isExecutableItem({ type: 'annotation' })).toBe(false)
    })

    it('isLiturgyMediaPlayType — media types', () => {
      expect(isLiturgyMediaPlayType('music')).toBe(true)
      expect(isLiturgyMediaPlayType('video')).toBe(true)
      expect(isLiturgyMediaPlayType('online_video')).toBe(true)
      expect(isLiturgyMediaPlayType('images')).toBe(true)
      expect(isLiturgyMediaPlayType('pdf')).toBe(true)
      expect(isLiturgyMediaPlayType('presentation')).toBe(true)
      expect(isLiturgyMediaPlayType('category')).toBe(false)
      expect(isLiturgyMediaPlayType('annotation')).toBe(false)
    })
  })

  describe('getItemTypeIcon / getItemTypeTone', () => {
    it('icon/tone conhecidos', () => {
      expect(getItemTypeIcon('music')).toBeTruthy()
      expect(getItemTypeTone('music')).toBeTruthy()
    })
    it('fallback unknown', () => {
      expect(getItemTypeIcon('unknown' as any)).toBe('ti-help')
      expect(getItemTypeTone('unknown' as any)).toBe('grey')
    })
  })

  describe('normalizeItemType — aliases L187-194', () => {
    it('media/files → other_files', () => {
      expect(normalizeItemType('media')).toBe('other_files')
      expect(normalizeItemType('files')).toBe('other_files')
    })
    it('link → site', () => {
      expect(normalizeItemType('link')).toBe('site')
    })
    it('tipos válidos passam', () => {
      expect(normalizeItemType('music')).toBe('music')
      expect(normalizeItemType('category')).toBe('category')
    })
    it('inválido → null', () => {
      expect(normalizeItemType('invalid')).toBeNull()
      expect(normalizeItemType(123)).toBeNull()
    })
  })

  describe('getSectionItemNumber', () => {
    const items: LiturgyItem[] = [
      { id: 'cat1', type: 'category', name: 'Cat1', done: false, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null },
      { id: 'item1', type: 'music', name: 'M1', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null },
      { id: 'item2', type: 'annotation', name: 'A1', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null },
      { id: 'cat2', type: 'category', name: 'Cat2', done: false, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null },
      { id: 'item3', type: 'music', name: 'M3', done: false, durationMs: 0, accentColor: '', categoryId: 'cat2', startTime: null, endTime: null },
    ]

    it('non-category → number sequencial', () => {
      expect(getSectionItemNumber(items, 1)).toBe(1)
      expect(getSectionItemNumber(items, 2)).toBe(2)
      expect(getSectionItemNumber(items, 4)).toBe(1)
    })

    it('category → null', () => {
      expect(getSectionItemNumber(items, 0)).toBeNull()
      expect(getSectionItemNumber(items, 3)).toBeNull()
    })

    it('índice inválido → null', () => {
      expect(getSectionItemNumber(items, -1)).toBeNull()
      expect(getSectionItemNumber(items, 100)).toBeNull()
    })
  })

  describe('clampMomentDurationMs', () => {
    it('<=0 → 0', () => { expect(clampMomentDurationMs(0)).toBe(0); expect(clampMomentDurationMs(-5)).toBe(0) })
    it('< 500ms → 0 (Math.round)', () => { expect(clampMomentDurationMs(1)).toBe(0); expect(clampMomentDurationMs(499)).toBe(0) })
    it('500ms → 1000 (Math.round 0.5 = 1)', () => { expect(clampMomentDurationMs(500)).toBe(1000); expect(clampMomentDurationMs(501)).toBe(1000) })
    it('1500ms → 2000', () => { expect(clampMomentDurationMs(1500)).toBe(2000); expect(clampMomentDurationMs(1499)).toBe(1000) })
    it('max cap', () => { expect(clampMomentDurationMs(10000000)).toBe(5940000) })
  })

  describe('formatMomentDuration', () => {
    it('formata mm:ss', () => {
      expect(formatMomentDuration(0)).toBe('00:00')
      expect(formatMomentDuration(5000)).toBe('00:05')
      expect(formatMomentDuration(65000)).toBe('01:05')
      expect(formatMomentDuration(3661000)).toBe('61:01')
    })
  })

  describe('isValidLiturgyUrl — branches L231-246', () => {
    it('http(s) válido com host', () => {
      expect(isValidLiturgyUrl('https://youtube.com/watch?v=x')).toBe(true)
      expect(isValidLiturgyUrl('http://example.com')).toBe(true)
      expect(isValidLiturgyUrl('youtube.com')).toBe(true)
    })

    it('localhost → true', () => {
      expect(isValidLiturgyUrl('http://localhost:3000')).toBe(true)
    })

    it('IP → true', () => {
      expect(isValidLiturgyUrl('http://192.168.1.1')).toBe(true)
    })

    it('host inválido (sem ponto, localhost, IP)', () => {
      expect(isValidLiturgyUrl('http://invalido')).toBe(false)
      expect(isValidLiturgyUrl('http://.com')).toBe(false)
      expect(isValidLiturgyUrl('http://com.')).toBe(false)
      expect(isValidLiturgyUrl('')).toBe(false)
      expect(isValidLiturgyUrl('   ')).toBe(false)
    })

    it('catch URL parsing → false', () => {
      expect(isValidLiturgyUrl('not a url')).toBe(false)
    })
  })

  describe('isLiturgyItemDraftValid — branches L248-281', () => {
    const baseDraft: LiturgyItemDraft = {
      type: 'music', name: 'Hino', subtitle: '', durationMs: 0, categoryId: 'cat1',
      musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '',
      filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto',
    }

    it('type null → false', () => { expect(isLiturgyItemDraftValid({ ...baseDraft, type: null as any })).toBe(false) })
    it('name vazio → false', () => { expect(isLiturgyItemDraftValid({ ...baseDraft, name: '' })).toBe(false) })
    it('category precisa startTime+endTime', () => {
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'category', startTime: '09:00', endTime: '10:00' })).toBe(true)
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'category', startTime: '', endTime: '10:00' })).toBe(false)
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'category', startTime: '09:00', endTime: '' })).toBe(false)
    })
    it('music precisa musicId', () => {
      expect(isLiturgyItemDraftValid({ ...baseDraft, musicId: null })).toBe(false)
    })
    it('non-category precisa categoryId', () => {
      expect(isLiturgyItemDraftValid({ ...baseDraft, categoryId: null })).toBe(false)
    })
    it('images precisa filePaths ou filePath', () => {
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'images', filePaths: ['a.jpg'] })).toBe(true)
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'images', filePath: 'a.jpg', filePaths: [] })).toBe(true)
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'images', filePath: '', filePaths: [] })).toBe(false)
    })
    it('video/pdf/presentation precisa filePath', () => {
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'video', filePath: 'v.mp4' })).toBe(true)
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'video', filePath: '' })).toBe(false)
    })
    it('site/online_video precisa URL válida', () => {
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'site', url: 'https://example.com' })).toBe(true)
      expect(isLiturgyItemDraftValid({ ...baseDraft, type: 'site', url: 'invalid' })).toBe(false)
    })
  })

  describe('buildLiturgyItemFromDraft — branches L283-406', () => {
    const mockMusicList: LiturgyMusicOption[] = [
      { id: 1, name: 'Hino 1', displayLabel: 'Hino 1 - Hinário', hymnalTrack: 1, albumNames: 'Hinário Adventista', durationMs: 180000, hasInstrumental: false },
    ]
    const mockBibleBooks: LiturgyBibleBookOption[] = [
      { id: 1, name: 'Gênesis', chapters: 50 },
    ]
    const baseContext = { musicList: mockMusicList, bibleBooks: mockBibleBooks, existingId: 'fixed-id', done: false }

    it('throw se type null', () => {
      expect(() => buildLiturgyItemFromDraft({ ...({} as LiturgyItemDraft), type: null as any }, baseContext))
        .toThrow('Liturgy item draft requires a type')
    })

    it('music — musicId found no catálogo', () => {
      const item = buildLiturgyItemFromDraft({ type: 'music', name: 'Meu Hino', subtitle: 'nota', durationMs: 200000, categoryId: 'cat1', musicId: 1, musicMode: 'instrumental', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }, baseContext)
      expect(item.name).toBe('Hino 1 - Hinário')
      expect(item.complementaryTitle).toBe('Meu Hino')
      expect(item.subtitle).toBe('Hinário Adventista')
      expect(item.notes).toBe('nota')
      expect(item.musicMode).toBe('instrumental')
      expect(item.durationMs).toBe(200000)
    })

    it('music — musicId NOT found no catálogo', () => {
      const item = buildLiturgyItemFromDraft({ type: 'music', name: 'Meu Hino', subtitle: 'nota', durationMs: 0, categoryId: 'cat1', musicId: 999, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }, baseContext)
      expect(item.name).toBe('Meu Hino')
      expect(item.complementaryTitle).toBeUndefined()
      expect(item.subtitle).toBe('')
    })

    it('verse — book found + details empty → subtitle auto', () => {
      const item = buildLiturgyItemFromDraft({ type: 'verse', name: 'Verso', subtitle: '', durationMs: 0, categoryId: 'cat1', verseBookId: 1, verseChapter: 3, verseNumbers: '1-5', musicId: null, musicMode: 'audio', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }, baseContext)
      expect(item.subtitle).toBe('Gênesis 3:1-5')
    })

    it('video/audio — playerId default deletado', () => {
      const item = buildLiturgyItemFromDraft({ type: 'video', name: 'Vídeo', subtitle: '', durationMs: 0, categoryId: 'cat1', filePath: 'v.mp4', filePaths: [], playerId: 'default', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', url: '', presentationEngine: 'auto' }, baseContext)
      expect('playerId' in item).toBe(false)
    })

    it('video/audio — playerId custom persistido', () => {
      const item = buildLiturgyItemFromDraft({ type: 'video', name: 'Vídeo', subtitle: '', durationMs: 0, categoryId: 'cat1', filePath: 'v.mp4', filePaths: [], playerId: 'webview', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', url: '', presentationEngine: 'auto' }, baseContext)
      expect(item.playerId).toBe('webview')
    })

    it('presentation — engine auto deletado', () => {
      const item = buildLiturgyItemFromDraft({ type: 'presentation', name: 'Apresentação', subtitle: '', durationMs: 0, categoryId: 'cat1', filePath: 'p.pdf', filePaths: [], presentationEngine: 'auto', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', url: '', playerId: 'default' }, baseContext)
      expect('presentationEngine' in item).toBe(false)
    })

    it('presentation — engine custom persistido', () => {
      const item = buildLiturgyItemFromDraft({ type: 'presentation', name: 'Apresentação', subtitle: '', durationMs: 0, categoryId: 'cat1', filePath: 'p.pdf', filePaths: [], presentationEngine: 'pdfjs', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', url: '', playerId: 'default' }, baseContext)
      expect(item.presentationEngine).toBe('pdfjs')
    })

    it('images — filePaths + subtitle auto', () => {
      const item = buildLiturgyItemFromDraft({ type: 'images', name: 'Imagens', subtitle: '', durationMs: 0, categoryId: 'cat1', filePaths: ['a.jpg', 'b.jpg'], filePath: '', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', url: '', playerId: 'default', presentationEngine: 'auto' }, baseContext)
      expect(item.filePaths).toEqual(['a.jpg', 'b.jpg'])
      expect(item.subtitle).toBe('2 imagens')
    })

    it('site/online_video — url + subtitle auto', () => {
      const item = buildLiturgyItemFromDraft({ type: 'site', name: 'Site', subtitle: '', durationMs: 0, categoryId: 'cat1', url: 'https://example.com', filePath: '', filePaths: [], musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', playerId: 'default', presentationEngine: 'auto' }, baseContext)
      expect(item.url).toBe('https://example.com')
      expect(item.subtitle).toBe('https://example.com')
    })
  })

  describe('draftFromLiturgyItem — formatting', () => {
    it('music — complementaryTitle → name', () => {
      const item: LiturgyItem = { id: '1', type: 'music', name: 'Hino 1 - Hinário', subtitle: 'Hinário', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: 'Meu Hino', notes: 'nota', musicId: 1, musicMode: 'instrumental', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }
      const draft = draftFromLiturgyItem(item)
      expect(draft.name).toBe('Meu Hino')
      expect(draft.subtitle).toBe('nota')
    })

    it('music — sem complementaryTitle → name vazio (comportamento real)', () => {
      const item: LiturgyItem = { id: '1', type: 'music', name: 'Hino 1', subtitle: 'Hinário', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: undefined, notes: '', musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }
      const draft = draftFromLiturgyItem(item)
      expect(draft.name).toBe('')
    })

    it('non-music — name/subtitle/notes pass-through', () => {
      const item: LiturgyItem = { id: '1', type: 'video', name: 'Vídeo', subtitle: 'Legenda', done: false, durationMs: 5000, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: undefined, notes: 'nota', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: 'v.mp4', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }
      const draft = draftFromLiturgyItem(item)
      expect(draft.name).toBe('Vídeo')
      expect(draft.subtitle).toBe('Legenda')
      expect(draft.durationMs).toBe(5000)
    })

    it('category duration 0 + startTime/endTime formatados', () => {
      const item: LiturgyItem = { id: '1', type: 'category', name: 'Cat', subtitle: '', done: false, durationMs: 0, accentColor: '', categoryId: null, startTime: '09:00', endTime: '10:00', complementaryTitle: undefined, notes: '', musicId: null, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }
      const draft = draftFromLiturgyItem(item)
      expect(draft.durationMs).toBe(0)
      expect(draft.startTime).toBe('09:00')
      expect(draft.endTime).toBe('10:00')
    })
  })

  describe('reconcileMusicItemTitles — branches L454-499', () => {
    const musicList: LiturgyMusicOption[] = [
      { id: 1, name: 'Hino 1', displayLabel: 'Hino 1 - Hinário', hymnalTrack: 1, albumNames: 'Hinário Adventista', durationMs: 180000, hasInstrumental: false },
    ]

    it('empty musicList → no change', () => {
      const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'Hino 1', subtitle: 'Hinário', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: 'Meu Hino', notes: '', musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }]
      expect(reconcileMusicItemTitles(items, [])).toBe(items)
    })

    it('complementaryTitle vazio + name diff → move name→complementary + name=displayLabel', () => {
      const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'Nome Antigo', subtitle: 'Hinário', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: '', notes: '', musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }]
      const res = reconcileMusicItemTitles(items, musicList)
      expect(res[0].name).toBe('Hino 1 - Hinário')
      expect(res[0].complementaryTitle).toBe('Nome Antigo')
    })

    it('complementaryTitle preenchido + name diff → name=displayLabel', () => {
      const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'Nome Antigo', subtitle: 'Hinário', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: 'Meu Hino', notes: '', musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }]
      const res = reconcileMusicItemTitles(items, musicList)
      expect(res[0].name).toBe('Hino 1 - Hinário')
      expect(res[0].complementaryTitle).toBe('Meu Hino')
    })

    it('subtitle diff from albumNames → subtitle=albumNames + notes=old subtitle', () => {
      const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'Hino 1 - Hinário', subtitle: 'Sub Antigo', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: 'Meu Hino', notes: '', musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }]
      const res = reconcileMusicItemTitles(items, musicList)
      expect(res[0].subtitle).toBe('Hinário Adventista')
      expect(res[0].notes).toBe('Sub Antigo')
    })

    it('notes já preenchido + subtitle diff → notes unchanged', () => {
      const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'Hino 1 - Hinário', subtitle: 'Sub Antigo', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: 'Meu Hino', notes: 'Minhas notas', musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }]
      const res = reconcileMusicItemTitles(items, musicList)
      expect(res[0].notes).toBe('Minhas notas')
    })

    it('no changes → same array reference', () => {
      const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'Hino 1 - Hinário', subtitle: 'Hinário Adventista', done: false, durationMs: 0, accentColor: '', categoryId: 'cat1', startTime: null, endTime: null, complementaryTitle: 'Meu Hino', notes: 'nota', musicId: 1, musicMode: 'audio', verseBookId: null, verseChapter: null, verseNumbers: '', filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto' }]
      expect(reconcileMusicItemTitles(items, musicList)).toBe(items)
    })
  })

  describe('clearDoneFlags', () => {
    it('todas done → false', () => {
      const items: LiturgyItem[] = [
        { id: '1', type: 'music', name: 'M', done: true, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null },
        { id: '2', type: 'category', name: 'C', done: true, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null },
      ]
      const res = clearDoneFlags(items)
      expect(res[0].done).toBe(false)
      expect(res[1].done).toBe(false)
      expect(res).not.toBe(items)
    })
  })
})