import { describe, it, expect } from 'vitest'
import {
  isValidLiturgyUrl,
  clampMomentDurationMs,
  draftFromLiturgyItem,
  buildLiturgyItemFromDraft,
  reconcileMusicItemTitles,
} from '../services/liturgy-item-helpers'
import type { LiturgyItem, LiturgyMusicOption } from '../types/liturgy'

const music = (over: Partial<LiturgyItem> = {}): LiturgyItem =>
  ({
    id: 'm1', type: 'music', name: 'Nome', subtitle: 'Sub', done: false,
    durationMs: 5000, accentColor: '', categoryId: 'c', musicId: 7, musicMode: 'audio',
    ...over,
  }) as LiturgyItem

describe('item-helpers kill plane 3 — survivors cirúrgicos', () => {
  // clampMomentDurationMs #235/#236: value <= 0 → 0
  it('#235/#236 clamp: value 0 retorna 0 SEM passar pelo clamp/min', () => {
    // mutante #235 (false): 0 iria pro Math.round(0/1000)*1000 = 0, min/max = 0 → igual.
    // Mas value negativo pequeno: -500 → original 0; mutante: round(-0.5)*1000 = 0? -0? Math.round(-0.5) = -0 → 0. Igual!
    // O diferencial: -1600 → original 0; mutante: round(-1.6)*1000 = -2000 → max(MIN, -2000) = MIN ≠ 0
    expect(clampMomentDurationMs(-1600)).toBe(0)
    expect(clampMomentDurationMs(-999999)).toBe(0)
  })

  // #252 L233 !value → false: isValidLiturgyUrl('') precisa retornar false
  it('#252 isValidLiturgyUrl: string vazia/whitespace -> false', () => {
    expect(isValidLiturgyUrl('   ')).toBe(false)
    expect(isValidLiturgyUrl('')).toBe(false)
  })

  // #399/#400/#401 L307 ternário type==='music' em buildLiturgyItemFromDraft
  it('#399-#401 build: music durationMs clampa; não-music TAMBÉM passa pelo clamp', () => {
    // não-music com durationMs -1600: original → clamp(-1600) = max(0, ...) = 0;
    // mutante #399 (true): cairia no ramo music (draft.durationMs > 0 ? ... : 0) → também 0.
    // Diferencial real: não-music com durationMs 2500 → original clamp = 3000? Não:
    // round(2500/1000)*1000 = 3000? Math.round(2.5)=3 → 3000. Mutante #400 (false):
    // ramo music exige draft.durationMs>0 → 3000 igual? Mutante #401 (!==): music
    // cai no clamp externo → mesmo valor. Matador: music com durationMs 0 já coberto.
    const vid = buildLiturgyItemFromDraft(
      { type: 'video', name: 'V', subtitle: '', durationMs: 2500, filePath: '/v.mp4' } as any,
      { musicList: [], bibleBooks: [] },
    )
    expect(vid.durationMs).toBe(3000) // clamp arredonda pro múltiplo de 1000
  })

  it('#403/#405 build music: durationMs > 0 → clamp; <= 0 → 0 (não clamp)', () => {
    const m0 = buildLiturgyItemFromDraft(
      { type: 'music', name: 'M', subtitle: '', durationMs: 0, musicId: 1 } as any,
      { musicList: [{ id: 1, displayLabel: 'L', albumNames: 'A' }], bibleBooks: [] },
    )
    expect(m0.durationMs).toBe(0) // mutante >0→true faria clamp(0)=MIN
  })

  // #468/#477/#479/#483 L351-358 trim em filePath
  it('#477/#479/#483 build: filePath com espaços é trimado no images e file types', () => {
    const img = buildLiturgyItemFromDraft(
      { type: 'images', name: 'I', subtitle: '', durationMs: 0, filePath: ' /x/a.png ', filePaths: [] } as any,
      { musicList: [], bibleBooks: [] },
    )
    expect(img.filePaths).toEqual(['/x/a.png'])
    expect(img.filePath).toBe('/x/a.png')
    const pdf = buildLiturgyItemFromDraft(
      { type: 'pdf', name: 'P', subtitle: '', durationMs: 0, filePath: ' /x/a.pdf ' } as any,
      { musicList: [], bibleBooks: [] },
    )
    expect(pdf.filePath).toBe('/x/a.pdf')
  })

  // #501/#519 L372/L380 else blocks (subtitle fallback)
  it('#501 build images: sem subtitle e 1 imagem -> subtitle = filename; senão N imagens', () => {
    const one = buildLiturgyItemFromDraft(
      { type: 'images', name: 'I', subtitle: '', durationMs: 0, filePath: '', filePaths: ['/x/foto.png'] } as any,
      { musicList: [], bibleBooks: [] },
    )
    expect(one.subtitle).toBe('foto.png')
    const many = buildLiturgyItemFromDraft(
      { type: 'images', name: 'I', subtitle: '', durationMs: 0, filePath: '', filePaths: ['/a.png', '/b.png'] } as any,
      { musicList: [], bibleBooks: [] },
    )
    expect(many.subtitle).toBe('2 imagens')
    // com subtitle não sobrescreve
    const withSub = buildLiturgyItemFromDraft(
      { type: 'images', name: 'I', subtitle: 'Manual', durationMs: 0, filePath: '', filePaths: ['/a.png'] } as any,
      { musicList: [], bibleBooks: [] },
    )
    expect(withSub.subtitle).toBe('Manual')
  })

  it('#519 build file type: sem subtitle -> subtitle = filename (else block)', () => {
    const d = buildLiturgyItemFromDraft(
      { type: 'video', name: 'V', subtitle: '', durationMs: 0, filePath: '/dir/meuvideo.mp4' } as any,
      { musicList: [], bibleBooks: [] },
    )
    expect(d.subtitle).toBe('meuvideo.mp4')
  })

  // #579-#588 L418-421 draftFromLiturgyItem
  it('#579 draft: category durationMs=0 (mutante false usaria clamp de undefined)', () => {
    const d = draftFromLiturgyItem({
      id: 'c1', type: 'category', name: 'C', subtitle: '', done: false, durationMs: 0,
      accentColor: '', categoryId: null, startTime: '09:00', endTime: '10:00',
    } as LiturgyItem)
    expect(d.durationMs).toBe(0)
    expect(d.startTime).toBe('09:00')
    expect(d.endTime).toBe('10:00')
  })

  it('#582-#588 draft: music durationMs > 0 clamp; <= 0 → 0; name de complementaryTitle', () => {
    const dm = draftFromLiturgyItem(music({ durationMs: 1500, complementaryTitle: 'Comp' }))
    expect(dm.name).toBe('Comp') // music: name vem de complementaryTitle ?? ''
    expect(dm.durationMs).toBe(2000) // clamp arredonda 1500 → 2000
    const dm0 = draftFromLiturgyItem(music({ durationMs: 0, complementaryTitle: 'Comp' }))
    expect(dm0.durationMs).toBe(0) // mutante >=0 faria clamp(0) = MIN
    const dmNeg = draftFromLiturgyItem(music({ durationMs: -1600, complementaryTitle: 'Comp' }))
    expect(dmNeg.durationMs).toBe(0)
    // não-music: name direto, subtitle direto, durationMs clamp
    const dv = draftFromLiturgyItem({
      id: 'v', type: 'video', name: 'Video X', subtitle: 'Sub X', done: false,
      durationMs: 1500, accentColor: '', categoryId: 'c', filePath: '/v.mp4',
    } as LiturgyItem)
    expect(dv.name).toBe('Video X')
    expect(dv.subtitle).toBe('Sub X')
    expect(dv.durationMs).toBe(2000)
  })

  // #602 L432 draftFrom: category → null (mutante true manda clamp)
  it('#602 draft category: durationMs = 0 exato', () => {
    const d = draftFromLiturgyItem({
      id: 'c', type: 'category', name: 'C', subtitle: '', done: false, durationMs: 9999,
      accentColor: '', categoryId: null, startTime: null, endTime: null,
    } as LiturgyItem)
    expect(d.durationMs).toBe(0) // category IGNORA durationMs do item
  })

  // #635 L458 musicList.length === 0 → return items (identity)
  it('#635 reconcile: musicList vazia retorna MESMA referência', () => {
    const items = [music()]
    expect(reconcileMusicItemTitles(items, [])).toBe(items)
  })

  // #640-#645 L462 guard type/musicId
  it('#640-#645 reconcile: item music com musicId null não entra no corpo (subtitle undefined seguro)', () => {
    const items = [music({ musicId: null, subtitle: undefined as any })]
    const result = reconcileMusicItemTitles(items, [{ id: 7, displayLabel: 'X', albumNames: 'Y' } as LiturgyMusicOption])
    // original: guard retorna item antes de acessar subtitle.trim() (undefined lançaria)
    expect(result[0]!.name).toBe('Nome')
  })

  it('#640-#645 reconcile: não-music não entra no corpo', () => {
    const items = [{ ...music(), type: 'video', subtitle: undefined as any }]
    const result = reconcileMusicItemTitles(items as LiturgyItem[], [{ id: 7, displayLabel: 'X', albumNames: 'Y' } as LiturgyMusicOption])
    expect(result[0]!.name).toBe('Nome')
  })
})
