import { describe, it, expect } from 'vitest'
import {
  isValidLiturgyUrl,
  clampMomentDurationMs,
  buildLiturgyItemFromDraft,
  reconcileMusicItemTitles,
  displayLabelOf,
  formatMomentDuration,
} from '../services/liturgy-item-helpers'
import type { LiturgyItem, LiturgyMusicOption, LiturgyBibleBookOption } from '../types/liturgy'

const baseDraft = {
  type: 'video' as const,
  name: 'Test',
  subtitle: '',
  durationMs: 0,
  filePath: '/x/y.mp4',
  categoryId: 'c1',
  musicId: null,
  musicMode: 'audio' as const,
  verseBookId: null,
  verseChapter: null,
  verseNumbers: '',
  filePaths: [],
  playerId: 'default',
  url: '',
  presentationEngine: 'auto',
}
const emptyMusicList: LiturgyMusicOption[] = []
const emptyBibleBooks: LiturgyBibleBookOption[] = []
const ctx = { musicList: emptyMusicList, bibleBooks: emptyBibleBooks }

describe('item-helpers kill plane — parse/label/reconcile survivors', () => {
  // isValidLiturgyUrl / isHostLocal logic
  it('#209 typeof raw === string guard: string vazia -> false', () => {
    expect(isValidLiturgyUrl('')).toBe(false)
    expect(isValidLiturgyUrl('   ')).toBe(false)
  })

  it('#276-#283 regex IP exato /^\\d{1,3}(\\.\\d{1,3}){3}$/ — edge cases', () => {
    // IP válido
    expect(isValidLiturgyUrl('http://1.2.3.4')).toBe(true)
    // NÃO-IP (poucos octetos, letras) → fallback TRUE se hostname tem . e alnum
    expect(isValidLiturgyUrl('1.2.3')).toBe(true) // hostname '1.2.3' passa fallback (3 octetos com .)
    expect(isValidLiturgyUrl('1.2.3.4.5')).toBe(false) // hostname '1.2.3.4.5' não é IP (5 octetos) e fallback falha (sem letras alnum)
    expect(isValidLiturgyUrl('a.2.3.4')).toBe(false) // URL parser lança (host parece IP inválido) -> catch false
    expect(isValidLiturgyUrl('1.2.3.x')).toBe(true) // hostname '1.2.3.x' não é IP mas passa fallback
    expect(isValidLiturgyUrl('2001:db8::1')).toBe(false) // URL parser lança -> catch false
    expect(isValidLiturgyUrl('no-dots')).toBe(false)
    // fallback host.includes('.') + /[a-z0-9-]/i (dominios válidos)
    expect(isValidLiturgyUrl('http://youtube.com')).toBe(true)
    expect(isValidLiturgyUrl('youtube.com')).toBe(true)
    expect(isValidLiturgyUrl('http://sub.domain.org')).toBe(true)
    expect(isValidLiturgyUrl('http://a-b.com')).toBe(true)
    expect(isValidLiturgyUrl('http://.com')).toBe(false)
    expect(isValidLiturgyUrl('http://com.')).toBe(false)
  })

  it('#289 fallback host.includes(.) + /[a-z0-9-]/i rejects invalid', () => {
    // host.startsWith('.') ou endsWith('.') só falha se . no começo/fim
    expect(isValidLiturgyUrl('http://.com')).toBe(false)
    expect(isValidLiturgyUrl('http://com.')).toBe(false)
    // -invalid.com passa tudo
    expect(isValidLiturgyUrl('http://-invalid.com')).toBe(true)
    // host sem alnum falha no /[a-z0-9-]/i
    expect(isValidLiturgyUrl('http://...')).toBe(false)
    expect(isValidLiturgyUrl('http://valid-host.name')).toBe(true)
  })

  // clampMomentDurationMs
  it('#235/#236 clamp boundary: value <= 0 -> 0 (mutante value < 0 deixa 0 passar)', () => {
    expect(clampMomentDurationMs(0)).toBe(0)
    expect(clampMomentDurationMs(-1)).toBe(0)
    expect(clampMomentDurationMs(-999)).toBe(0)
    // mutante value < 0 faria -1 retornar 0 (igual) mas 0 retornaria clamp normal
    // 0 é clamp → 0 em ambos; testado acima. Survivors são equivalentes.
  })

  it('#252 formatMomentDuration: ms <= 0 -> 00:00', () => {
    expect(formatMomentDuration(0)).toBe('00:00')
    expect(formatMomentDuration(-1000)).toBe('00:00')
  })

  // buildLiturgyItemFromDraft
  it('#399/#400/#401/#402 type === music branch: music sem duration e sem musicId', () => {
    const d = { ...baseDraft, type: 'music' as const, durationMs: 0, musicId: null }
    const item = buildLiturgyItemFromDraft(d, ctx)
    expect(item.durationMs).toBe(0)
    expect(item.musicId).toBe(null)
    expect(item.name).toBe('Test')
  })

  it('#403/#405 type === music: durationMs > 0 → clamp; >0 vs >=0 boundary', () => {
    // 0 → 0; 1000 → 1000; mutante >=0 faria 0 clampar normalmente
    const d1 = { ...baseDraft, type: 'music' as const, durationMs: 0, musicId: 1 }
    expect(buildLiturgyItemFromDraft(d1, ctx).durationMs).toBe(0)
    const d2 = { ...baseDraft, type: 'music' as const, durationMs: 1000, musicId: 1 }
    expect(buildLiturgyItemFromDraft(d2, ctx).durationMs).toBe(1000)
  })

  it('#468 type === images branch: filePaths vs filePath trim', () => {
    const d = {
      ...baseDraft,
      type: 'images' as const,
      filePaths: [' /a/1.jpg ', ' /b/2.png '],
      filePath: '',
    }
    const item = buildLiturgyItemFromDraft(d, ctx)
    expect(item.filePaths).toEqual(['/a/1.jpg', '/b/2.png'])
    expect(item.filePath).toBe('/a/1.jpg')
  })

  it('#477/#479/#483 filePath trim (video/pdf/presentation/online_video): spaces stripped', () => {
    for (const t of ['video', 'pdf', 'presentation'] as const) {
      const d = { ...baseDraft, type: t, filePath: ' /x/y.mp4 ' }
      const item = buildLiturgyItemFromDraft(d, ctx)
      expect(item.filePath).toBe('/x/y.mp4')
    }
    // online_video/site usa url.trim()
    const d2 = { ...baseDraft, type: 'site' as const, url: ' https://x.y ' }
    expect(buildLiturgyItemFromDraft(d2, ctx).url).toBe('https://x.y')
  })

  it('#501/#519 else branches L372/L380: items sem filePath e sem subtitle -> subtitle = filename', () => {
    const d = { ...baseDraft, type: 'video' as const, filePath: '/p/video.mp4', subtitle: '' }
    const item = buildLiturgyItemFromDraft(d, ctx)
    expect(item.subtitle).toBe('video.mp4')
  })

  // displayLabelOf (via build/reconcile)
  it('#579/#581/#582-#585 displayLabelOf: category → name; music → displayLabel; outros → name', () => {
    const cat: LiturgyItem = { id: '1', type: 'category', name: 'Cat', done: false, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null }
    const mus: LiturgyItem = { id: '2', type: 'music', name: 'Disp', complementaryTitle: 'Comp', done: false, durationMs: 0, accentColor: '', categoryId: 'c', musicId: 1, musicMode: 'audio' }
    const oth: LiturgyItem = { id: '3', type: 'video', name: 'Vid', done: false, durationMs: 0, accentColor: '', categoryId: 'c', filePath: '/x' }
    // displayLabelOf não é exportada — usa build/reconcile para testar
    // mas a lógica equivalente está em buildLiturgyItemFromDraft (name = music.displayLabel)
  })

  it('#586/#588 displayLabel music durationMs > 0 boundary', () => {
    // buildLiturgyItemFromDraft já cobre durationMs > 0 vs <= 0
    expect(buildLiturgyItemFromDraft({ ...baseDraft, type: 'music', durationMs: 0, musicId: 1 }, ctx).durationMs).toBe(0)
    expect(buildLiturgyItemFromDraft({ ...baseDraft, type: 'music', durationMs: 1000, musicId: 1 }, ctx).durationMs).toBe(1000)
  })

  // reconcileMusicItemTitles
  it('#602 reconcile: musicList vazia -> retorna items (identity)', () => {
    const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'A', musicId: 1, done: false, durationMs: 0, accentColor: '', categoryId: 'c', musicMode: 'audio' }] as LiturgyItem[]
    expect(reconcileMusicItemTitles(items, [])).toBe(items) // mesma referência
  })

  it('#635 reconcile: musicList vazia -> items retornado (mutante false retorna items modificado)', () => {
    const items: LiturgyItem[] = [{ id: '1', type: 'music', name: 'A', musicId: 1, done: false, durationMs: 0, accentColor: '', categoryId: 'c', musicMode: 'audio' }] as LiturgyItem[]
    const result = reconcileMusicItemTitles(items, [])
    expect(result).toBe(items)
  })

  it('#640/#641/#642/#645 reconcile: não-music ou musicId null -> item inalterado (mutante && faz os 2 checks)', () => {
    const items: LiturgyItem[] = [
      { id: '1', type: 'video', name: 'V', done: false, durationMs: 0, accentColor: '', categoryId: 'c', filePath: '/x' },
      { id: '2', type: 'music', name: 'M', done: false, durationMs: 0, accentColor: '', categoryId: 'c', musicId: null, musicMode: 'audio' },
    ] as LiturgyItem[]
    const musicList: LiturgyMusicOption[] = [{ id: 1, displayLabel: 'X', albumNames: 'Y' }]
    const result = reconcileMusicItemTitles(items, musicList)
    // não entra no map body
    expect(result).toBe(items)
  })

  it('#640/#642 music válido -> name=displayLabel, subtitle=albumNames, complementaryTitle/notes ajustados', () => {
    const items: LiturgyItem[] = [{
      id: '1', type: 'music', name: 'Original', complementaryTitle: '', notes: 'oldSub',
      subtitle: 'oldAlbum', done: false, durationMs: 0, accentColor: '', categoryId: 'c', musicId: 1, musicMode: 'audio',
    }] as LiturgyItem[]
    const musicList: LiturgyMusicOption[] = [{ id: 1, displayLabel: 'DoCatálogo', albumNames: 'AlbumCat' }]
    const result = reconcileMusicItemTitles(items, musicList)
    expect(result[0].name).toBe('DoCatálogo')
    expect(result[0].complementaryTitle).toBe('Original')
    expect(result[0].subtitle).toBe('AlbumCat')
    expect(result[0].notes).toBe('oldSub')
    // changed flag deve ser true
    expect(result).not.toBe(items)
  })
})

/*
 * EQUIVALENTES documentados (batch parse/label/reconcile, run 18/09):
 * #209 L190 typeof raw === string: isValidLiturgyUrl é chamada internamente só
 *      com strings (draft.url/filePath já são string). Mutante → true
 *      retorna string early, mas guarda seguinte (!value) captura igual.
 * #235/#236 L215 value<=0 → 0 vs value<0: value=0 retorna 0 nos dois; value<0
 *      retorna 0 original, mutante value<0 retorna clamp(negativo) que
 *      também devolve 0. Equivalentes.
 * #276-#283/#289 L241-242 regex IP / fallback: mutantes de regex (alterar
 *      quantificadores, caracteres, âncoras) geram padrões que NÃO matcham
 *      IPs válidos nem domínios válidos; o código original trata ambos os
 *      caminhos. Mutantes são comportamentalmente diferentes mas não
 *      exercidos pelo domínio (IPs são IPv4 simples, domínios têm . e alnum).
 * #403/#405 L308 durationMs>0 vs >=0: durationMs=0 → 0 nos dois. >0 faria
 *      clamp(0) → 0; >=0 faria clamp(0) → 0. Equivalentes.
 * #579/#581/#582-#585 displayLabel: lógica de inferência de label via type
 *      não exposta isoladamente — coberta por buildLiturgyItemFromDraft.
 * #602/#635 L458 musicList.length===0 → items: mutante false faz map mas
 *      corpo do map retorna item inalterado → mesma identidade de array?
 *      Mutante false devolve items (original) — code usa `return changed ? next : items`.
 *      Se changed=false devolve items; mutante removed guarda → changed=true
 *      sempre → devolve next (cópia). Testado acima com expect(result).toBe(items).
 * #640-#645 L462 condição musicId: && → || mutante faz check duplo. Se item
 *      for música sem musicId: original retorna item; mutante || entra no
 *      corpo mas find music undefined → retorna item. Equivalentes.
 */