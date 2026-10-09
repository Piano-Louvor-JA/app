import { describe, it, expect } from 'vitest'
import {
  resolvePreferredCategoryId,
  findCategoryInsertIndex,
  getCategoryBlockEnd,
  reorderLiturgyItems,
  cloneLiturgyItems,
  getSectionItemNumber,
  isValidLiturgyUrl,
  isLiturgyItemDraftValid,
  buildLiturgyItemFromDraft,
  draftFromLiturgyItem,
  reconcileMusicItemTitles,
} from '../services/liturgy-item-helpers'
import type { LiturgyItem, LiturgyItemDraft, LiturgyMusicOption } from '../types/liturgy'

// Mata os sobreviventes exatos de liturgy-item-helpers.ts via /tmp/survivors.json:
// ConditionalExpression (48), EqualityOperator (15), MethodExpression (14), LogicalOperator (8).

const cat = (id: string): LiturgyItem =>
  ({ id, type: 'category', name: id, done: false, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null })
const child = (id: string, cid: string, over: Partial<LurgyItem> = {}): LiturgyItem =>
  ({ id, type: 'music', name: id, done: false, durationMs: 0, accentColor: '', categoryId: cid, startTime: null, endTime: null, ...over } as LiturgyItem)

const music = (id: number, displayLabel: string, albumNames: string): LiturgyMusicOption =>
  ({ id, name: displayLabel.split(' - ')[0] ?? displayLabel, displayLabel, hymnalTrack: id, albumNames, durationMs: 0, hasInstrumental: false })

describe('item-helpers — survivors cirúrgicos', () => {
  // L29/L45/L50/L52: OptionalChaining selected?.type, selected?.categoryId, item?.type, child guard
  describe('resolvePreferredCategoryId / findCategoryInsertIndex — optional chaining', () => {
    it('selected undefined + items com categoria no meio → pula itens antes (L29 item?.type)', () => {
      const items = [child('i1', 'c1'), cat('c1'), child('i2', 'c1')]
      // i1 não é categoria; loop precisa continuar até achar c1
      expect(resolvePreferredCategoryId(items, undefined)).toBe('c1')
    })

    it('child com type category mas SEM categoryId → break no insert (L52 child.categoryId !== categoryId)', () => {
      const items = [cat('c1'), cat('c2')]
      expect(findCategoryInsertIndex(items, 'c1')).toBe(1)
    })

    it('child de outra categoria corta o bloco (L52)', () => {
      const items = [cat('c1'), child('i1', 'c1'), child('i9', 'OUTRA'), cat('c2')]
      expect(findCategoryInsertIndex(items, 'c1')).toBe(2)
    })

    it('getCategoryBlockEnd em não-categoria retorna index+1 (L62 EqualityOperator !==)', () => {
      const items = [cat('c1'), child('i1', 'c1')]
      expect(getCategoryBlockEnd(items, 1)).toBe(2)
    })

    it('resolveDropCategoryIndex via reorder: drop em filho resolve pra categoria pai (L71-80)', () => {
      const items = [cat('c1'), child('i1', 'c1'), cat('c2'), child('i2', 'c2')]
      // drop c2 sobre i1 (filho de c1): target category = c1 → insertAt = targetCategoryIndex
      const res = reorderLiturgyItems(items, 2, 1)
      expect(res[0].id).toBe('c2')
    })

    it('drop em filho SEM categoryId (não deveria ocorrer, mas tratado): insertAt = toIndex', () => {
      const items = [cat('c1'), { ...child('i1', ''), id: 'orphan' } as LiturgyItem, cat('c2')]
      const res = reorderLiturgyItems(items, 2, 1)
      expect(res.map((r) => r.id)).toContain('c2')
    })

    // L95-98: moved guard, fromIndex<toIndex dentro do bloco
    it('reorder: fromIndex dentro de validação >= length → no-op (L95)', () => {
      const items = [cat('c1'), child('i1', 'c1')]
      expect(reorderLiturgyItems(items, 2, 0)).toBe(items)
    })

    it('reorder categoria pra dentro do próprio bloco por trás → no-op (L98 toIndex < blockEnd)', () => {
      const items = [cat('c1'), child('i1', 'c1'), child('i2', 'c1'), cat('c2')]
      expect(reorderLiturgyItems(items, 0, 1)).toBe(items)
    })

    it('reorder: não-categoria move remove e reinsere (L100-105)', () => {
      const items = [cat('c1'), child('i1', 'c1'), child('i2', 'c1'), child('i3', 'c1')]
      const res = reorderLiturgyItems(items, 1, 3)
      expect(res.map((r) => r.id)).toEqual(['c1', 'i2', 'i3', 'i1'])
    })

    it('reorder categoria pra frente: dest ajustado pelo tamanho do bloco (L120-123)', () => {
      const items = [cat('c1'), child('i1', 'c1'), child('i2', 'c1'), cat('c2'), child('j1', 'c2')]
      const res = reorderLiturgyItems(items, 0, 4)
      expect(res.map((r) => r.id)).toEqual(['c2', 'j1', 'c1', 'i1', 'i2'])
    })

    it('reorder categoria pra trás: dest sem ajuste (L120 insertAt > fromIndex false)', () => {
      const items = [cat('c1'), child('i1', 'c1'), cat('c2'), child('j1', 'c2')]
      const res = reorderLiturgyItems(items, 2, 0)
      expect(res.map((r) => r.id)).toEqual(['c2', 'j1', 'c1', 'i1'])
    })

    it('cloneLiturgyItems: categoryId null → null (L137 != null)', () => {
      const items = [cat('c1'), child('i1', 'c1'), { ...cat('x'), id: 'top', categoryId: null } as LiturgyItem]
      const res = cloneLiturgyItems(items)
      expect(res[2].categoryId).toBeNull()
      // filho remapeia pro NOVO id do pai
      expect(res[1].categoryId).toBe(res[0].id)
    })

    it('cloneLiturgyItems: categoryId apontando pra id inexistente → null (L137 idMap.get ?? null)', () => {
      const items = [child('i1', 'fantasma')]
      const res = cloneLiturgyItems(items)
      expect(res[0].categoryId).toBeNull()
    })
  })

  describe('getSectionItemNumber (L149/L121-133)', () => {
    it('item em índice de categoria → null; reseta contagem por seção', () => {
      const items = [cat('c1'), child('i1', 'c1'), child('i2', 'c1'), cat('c2'), child('i3', 'c2')]
      expect(getSectionItemNumber(items, 0)).toBeNull()
      expect(getSectionItemNumber(items, 3)).toBeNull()
      expect(getSectionItemNumber(items, 1)).toBe(1)
      expect(getSectionItemNumber(items, 2)).toBe(2)
      expect(getSectionItemNumber(items, 4)).toBe(1)
    })
  })

  describe('isValidLiturgyUrl — Regex + EqualityOperator (L232-242, 8 mutantes em L241)', () => {
    it('host pontuado nas bordas → false (L233 startsWith/endsWith)', () => {
      expect(isValidLiturgyUrl('http://.host.com')).toBe(false)
      expect(isValidLiturgyUrl('http://host.com.')).toBe(false)
    })

    it('localhost aceito (L236)', () => {
      expect(isValidLiturgyUrl('LOCALHOST')).toBe(true)
      expect(isValidLiturgyUrl('http://localhost')).toBe(true)
    })

    it('IP aceito (L237 regex \^\d{1,3} — mata Regex negado)', () => {
      expect(isValidLiturgyUrl('http://10.0.0.1')).toBe(true)
      expect(isValidLiturgyUrl('10.0.0.1')).toBe(true) // sem protocolo, cai no regex de IP
      expect(isValidLiturgyUrl('http://192.168.1.100')).toBe(true)
    })

    it('host com ponto + char válido → true (L241 includes + regex)', () => {
      expect(isValidLiturgyUrl('youtube.com')).toBe(true)
      expect(isValidLiturgyUrl('sub.domínio.com.br')).toBe(true)
    })

    it('host sem ponto → false (L241 !includes)', () => {
      expect(isValidLiturgyUrl('http://hostvalidodessejeito')).toBe(false)
    })

    it('host com ponto mas sem char alfanum → false (L241 !regex)', () => {
      expect(isValidLiturgyUrl('http://-.')).toBe(false)
    })

    it('trim de espaços + protocolo implícito (L232)', () => {
      expect(isValidLiturgyUrl('   https://ok.com   ')).toBe(true)
    })

    it('URL inválida → catch false (L245)', () => {
      expect(isValidLiturgyUrl('ht tp://x')).toBe(false)
    })
  })

  describe('isLiturgyItemDraftValid — ConditionalExpression/LogicalOperator (L255-281)', () => {
    const draft = (over: Partial<LiturgyItemDraft>): LiturgyItemDraft =>
      ({
        type: 'video', name: 'V', subtitle: '', durationMs: 0, accentColor: '', categoryId: 'c1',
        startTime: null, endTime: null, musicId: null, musicMode: 'audio',
        verseBookId: null, verseChapter: null, verseNumbers: '',
        filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto',
        ...over,
      }) as LiturgyItemDraft

    it('name só espaços → false (trim)', () => {
      expect(isLiturgyItemDraftValid(draft({ name: '   ' }))).toBe(false)
    })

    it('category com startTime válido e endTime inválido → false', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'category', startTime: '9:00', endTime: '25:00' }))).toBe(false)
      expect(isLiturgyItemDraftValid(draft({ type: 'category', startTime: '09:00', endTime: '10:00' }))).toBe(true)
    })

    it('music sem musicId → false; music com musicId 0 → false (== null não pega 0, mas Number... verifica L263)', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'music', musicId: null }))).toBe(false)
    })

    it('site com url inválida → false; com válida → true', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'site', url: 'nope' }))).toBe(false)
      expect(isLiturgyItemDraftValid(draft({ type: 'site', url: 'ok.com' }))).toBe(true)
    })

    it('images: filePaths vazio + filePath com espaço → false (trim)', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'images', filePath: '  ', filePaths: [] }))).toBe(false)
    })

    it('images: filePath com espaço nas bordas → trim resolve (L261 trim ? [draft.filePath])', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'images', filePath: ' a.jpg ', filePaths: [] }))).toBe(true)
    })

    it('pdf sem filePath → false', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'pdf' }))).toBe(false)
    })

    it('online_video mesma validação de site', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'online_video', url: 'x.com' }))).toBe(true)
    })

    it('annotation sem nada → true (nenhuma constraint)', () => {
      expect(isLiturgyItemDraftValid(draft({ type: 'annotation' }))).toBe(true)
    })
  })

  describe('buildLiturgyItemFromDraft — ConditionalExpression (L297-376, 26 mutantes)', () => {
    const ctx = (musicList: LiturgyMusicOption[] = [], over: Record<string, unknown> = {}) =>
      ({ musicList, bibleBooks: [{ id: 1, name: 'Gênesis', chapters: 50 }], existingId: 'x1', done: false, ...over }) as any
    const mdraft = (over: Partial<LiturgyItemDraft>): LiturgyItemDraft =>
      ({
        type: 'music', name: 'M', subtitle: '', durationMs: 0, accentColor: '', categoryId: 'c1',
        startTime: null, endTime: null, musicId: 1, musicMode: 'audio',
        verseBookId: null, verseChapter: null, verseNumbers: '',
        filePath: '', filePaths: [], playerId: 'default', url: '', presentationEngine: 'auto',
        ...over,
      }) as LiturgyItemDraft

    it('existingId undefined → createLiturgyItemId (L297)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ name: 'A' }), ctx([], { existingId: undefined }))
      expect(item.id).not.toBe('x1')
      expect(item.id).toMatch(/^\d+-/)
    })

    it('music durationMs 0 → 0 (L305 draft.durationMs > 0)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ durationMs: 0 }), ctx())
      expect(item.durationMs).toBe(0)
    })

    it('music durationMs negativo → 0 (L305)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ durationMs: -100 }), ctx())
      expect(item.durationMs).toBe(0)
    })

    it('music durationMs 65000 → clamp 65000 (L307)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ durationMs: 65000 }), ctx())
      expect(item.durationMs).toBe(65000)
    })

    it('music no catálogo: name=displayLabel, complementary=name trim, subtitle=album, notes=details', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ name: ' Meu Hino ', subtitle: 'nota' }), ctx([music(1, 'Hino 1 - Hinário', 'HA')]))
      expect(item.name).toBe('Hino 1 - Hinário')
      expect(item.complementaryTitle).toBe('Meu Hino')
      expect(item.subtitle).toBe('HA')
      expect(item.notes).toBe('nota')
    })

    it('music no catálogo com name vazio → complementary undefined (L317 complementary || undefined)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ name: '  ', subtitle: '' }), ctx([music(1, 'Hino 1 - HA', 'HA')]))
      expect(item.complementaryTitle).toBeUndefined()
    })

    it('music FORA do catálogo: name=complementary || Música (L321)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ name: '', musicId: 99 }), ctx([music(1, 'Outra', 'X')]))
      expect(item.name).toBe('Música')
    })

    it('music fora do catálogo: notes = details || undefined (L322)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ name: 'X', subtitle: 'nota', musicId: 99 }), ctx())
      expect(item.notes).toBe('nota')
    })

    it('verse com book + details preenchido → NÃO sobrescreve subtitle (L336 book && !details)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'verse', subtitle: 'já tem', verseBookId: 1, verseChapter: 2, verseNumbers: '1' }), ctx())
      expect(item.subtitle).toBe('já tem')
    })

    it('verse com book, sem details, sem verseNumbers → subtitle sem :versos (L338)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'verse', verseBookId: 1, verseChapter: 2, verseNumbers: '  ' }), ctx())
      expect(item.subtitle).toBe('Gênesis 2')
    })

    it('verse book inexistente → subtitle permanece details', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'verse', verseBookId: 99, verseChapter: 1 }), ctx())
      expect(item.subtitle).toBe('')
    })

    it('internal file: images com filePaths → trim + filter Boolean (L351-355)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'images', filePaths: [' a.jpg ', '', 'b.jpg'] }), ctx())
      expect(item.filePaths).toEqual(['a.jpg', 'b.jpg'])
      expect(item.filePath).toBe('a.jpg')
    })

    it('images: filePaths vazio, filePath com espaços → usa trim (L352)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'images', filePath: ' x.jpg ', filePaths: [] }), ctx())
      expect(item.filePath).toBe('x.jpg')
    })

    it('non-images file: filePath vazio → paths [] e filePath = "" (L358-359)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'video', filePath: '' }), ctx())
      expect(item.filePath).toBe('')
    })

    it('presentation engine auto → deletado; null → deletado (L363)', () => {
      const auto = buildLiturgyItemFromDraft(mdraft({ type: 'presentation', presentationEngine: 'auto' }), ctx())
      expect('presentationEngine' in auto).toBe(false)
      const nula = buildLiturgyItemFromDraft(mdraft({ type: 'presentation', presentationEngine: null as any }), ctx())
      expect('presentationEngine' in nula).toBe(false)
    })

    it('presentation engine custom → persistido (L363)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'presentation', presentationEngine: 'powerpoint' }), ctx())
      expect(item.presentationEngine).toBe('powerpoint')
    })

    it('video playerId default → deletado; custom → persistido (L372-376)', () => {
      const def = buildLiturgyItemFromDraft(mdraft({ type: 'video', playerId: 'default' }), ctx())
      expect('playerId' in def).toBe(false)
      const custom = buildLiturgyItemFromDraft(mdraft({ type: 'video', playerId: 'mpv' }), ctx())
      expect(custom.playerId).toBe('mpv')
    })

    it('audio playerId null → deletado (L376 draft.playerId && check)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'audio', playerId: null as any }), ctx())
      expect('playerId' in item).toBe(false)
    })

    it('images com 1 path → subtitle = filename (L384)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'images', filePaths: ['/pasta/foto.jpg'] }), ctx())
      expect(item.subtitle).toBe('foto.jpg')
    })

    it('images com details → NÃO sobrescreve subtitle (L381 !details)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'images', filePaths: ['/a.jpg'], subtitle: 'legenda' }), ctx())
      expect(item.subtitle).toBe('legenda')
    })

    it('non-images file com filePath, sem details → subtitle = filename (L398)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'video', filePath: '/dir/video.mp4' }), ctx())
      expect(item.subtitle).toBe('video.mp4')
    })

    it('non-images file com details → subtitle = details (L398 !details false)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'video', filePath: '/v.mp4', subtitle: 'info' }), ctx())
      expect(item.subtitle).toBe('info')
    })

    it('site com url e sem details → subtitle = url (L384-391)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'site', url: ' https://a.com ' }), ctx())
      expect(item.url).toBe('https://a.com')
      expect(item.subtitle).toBe('https://a.com')
    })

    it('site com url vazia + details → url "" e subtitle details (L389 item.url &&)', () => {
      const item = buildLiturgyItemFromDraft(mdraft({ type: 'site', url: '  ', subtitle: 'd' }), ctx())
      expect(item.url).toBe('')
      expect(item.subtitle).toBe('d')
    })
  })

  describe('draftFromLiturgyItem — ConditionalExpression (L413-448)', () => {
    const base = (over: Partial<LiturgyItem>): LiturgyItem =>
      ({ id: '1', type: 'music', name: 'N', subtitle: 'S', done: true, durationMs: 0, accentColor: '', categoryId: 'c1', startTime: null, endTime: null, ...over }) as LiturgyItem

    it('category: duration 0, startTime/endTime normalizados, categoryId null (L418-434)', () => {
      const d = draftFromLiturgyItem(base({ type: 'category', categoryId: null, startTime: '9:05', endTime: '10:00' }))
      expect(d.durationMs).toBe(0)
      expect(d.startTime).toBe('09:05')
      expect(d.endTime).toBe('10:00')
      expect(d.categoryId).toBeNull()
    })

    it('category com startTime inválida → "" (L428 ?? "")', () => {
      const d = draftFromLiturgyItem(base({ type: 'category', startTime: 'zzz' }))
      expect(d.startTime).toBe('')
    })

    it('music durationMs > 0 → clamp; == 0 → 0 (L420-421)', () => {
      expect(draftFromLiturgyItem(base({ durationMs: 65000 })).durationMs).toBe(65000)
      expect(draftFromLiturgyItem(base({ durationMs: 0 })).durationMs).toBe(0)
    })

    it('non-category/non-music: durationMs clamp direto, mesmo negativo (L424)', () => {
      // video com -1: clamp(-1) = 0 (value <= 0)
      expect(draftFromLiturgyItem(base({ type: 'video', durationMs: -1 })).durationMs).toBe(0)
      expect(draftFromLiturgyItem(base({ type: 'video', durationMs: 3000 })).durationMs).toBe(3000)
    })

    it('categoryId ausente → null (L436 ?? null)', () => {
      const d = draftFromLiturgyItem(base({ categoryId: undefined }))
      expect(d.categoryId).toBeNull()
    })

    it('filePaths presente → copia; vazio + filePath → [filePath]; ambos vazios → [] (L439-442)', () => {
      expect(draftFromLiturgyItem(base({ type: 'images', filePaths: ['a.jpg'] })).filePaths).toEqual(['a.jpg'])
      expect(draftFromLiturgyItem(base({ type: 'images', filePaths: [], filePath: 'b.jpg' })).filePaths).toEqual(['b.jpg'])
      expect(draftFromLiturgyItem(base({ type: 'images', filePaths: [], filePath: '' })).filePaths).toEqual([])
    })

    it('musicId/verse fields ausentes → null/"" (L435-438 ??)', () => {
      const d = draftFromLiturgyItem(base({ musicId: undefined, verseBookId: undefined, verseChapter: undefined, verseNumbers: undefined, url: undefined, presentationEngine: undefined, playerId: undefined }))
      expect(d.musicId).toBeNull()
      expect(d.verseBookId).toBeNull()
      expect(d.verseChapter).toBeNull()
      expect(d.verseNumbers).toBe('')
      expect(d.url).toBe('')
      expect(d.presentationEngine).toBe('auto')
      expect(d.playerId).toBe('default')
    })

    it('music notes ausente → subtitle "" (L416)', () => {
      const d = draftFromLiturgyItem(base({ notes: undefined }))
      expect(d.subtitle).toBe('')
    })

    it('non-music: subtitle passa direto', () => {
      const d = draftFromLiturgyItem(base({ type: 'video', subtitle: 'sub' }))
      expect(d.subtitle).toBe('sub')
    })
  })

  describe('reconcileMusicItemTitles — sobreviventes finais (L458-492)', () => {
    it('musicId null → item intocado (L462)', () => {
      const items = [child('i1', 'c1', { musicId: undefined } as any)]
      expect(reconcileMusicItemTitles(items, [music(1, 'H - A', 'A')])).toBe(items)
    })

    it('music não encontrada → intocado (L467)', () => {
      const items = [child('i1', 'c1', { musicId: 5 } as any)]
      expect(reconcileMusicItemTitles(items, [music(1, 'H - A', 'A')])).toBe(items)
    })

    it('complementary vazio + name igual displayLabel → NÃO muda name (L470 !complementary && name !== label)', () => {
      const items = [child('i1', 'c1', { musicId: 1, complementaryTitle: '', name: 'H - A', subtitle: '' } as any)]
      const res = reconcileMusicItemTitles(items, [music(1, 'H - A', 'A')])
      expect(res[0].name).toBe('H - A') // name intacto (complementary vazio + name === displayLabel)
      expect(res[0].complementaryTitle).toBe('')
    })

    it('complementary preenchido + subtitle já igual + notes whitespace-only → notes undefined (L490-492)', () => {
      const items = [child('i1', 'c1', { musicId: 1, complementaryTitle: 'C', name: 'H - A', subtitle: 'A', notes: '   ' } as any)]
      const res = reconcileMusicItemTitles(items, [music(1, 'H - A', 'A')])
      // notes = '   ', existingNotes = '' (trim), subtitle === albumNames → elif notes && !existingNotes → notes undefined
      expect(res[0].notes).toBeUndefined()
    })

    it('subtitle vazio e albumNames não-vazio → notes assume subtitle antigo (L488 existingNotes || subtitle)', () => {
      const items = [child('i1', 'c1', { musicId: 1, complementaryTitle: 'C', name: 'Diferente', subtitle: '', notes: undefined } as any)]
      const res = reconcileMusicItemTitles(items, [music(1, 'H - A', 'Álbum')])
      expect(res[0].subtitle).toBe('Álbum')
      expect(res[0].notes).toBeUndefined() // subtitle era '' → notes = undefined
    })

    it('múltiplos itens, um muda e outro não → retorna novo array (L498 changed)', () => {
      const items = [
        child('i1', 'c1', { musicId: 1, complementaryTitle: 'C', name: 'H - A', subtitle: 'A' } as any),
        child('i2', 'c1', { musicId: 2, complementaryTitle: 'D', name: 'G - B', subtitle: 'B' } as any),
      ]
      const list = [music(1, 'H - A', 'A'), music(2, 'G - B', 'B')]
      expect(reconcileMusicItemTitles(items, list)).toBe(items)
      // agora muda um:
      const items2 = [child('i1', 'c1', { musicId: 1, complementaryTitle: 'C', name: 'ERRADO', subtitle: 'A' } as any)]
      const res2 = reconcileMusicItemTitles(items2, list)
      expect(res2).not.toBe(items2)
      expect(res2[0].name).toBe('H - A')
    })
  })
})
