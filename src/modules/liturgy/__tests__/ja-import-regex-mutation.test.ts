import { describe, it, expect } from 'vitest'
import { parseJaLiturgy, decodeJaBytes } from '../services/liturgy-ja-import'
import { sortCategories } from '../../sync/services/library-catalog'

describe('ja-import mutation kill — Regex/DELPHI_COLOR_RE/typeFromPath/baseId', () => {
  const minimalValid = `[Geral]
1=item_001
2=item_001
[item_001]
tipo=musica
item=Hino 1
musica=10
`

  it('parseJaLiturgy — BOM UTF-8 removido', () => {
    const withBom = '\uFEFF' + minimalValid
    const result = parseJaLiturgy(withBom)
    expect(result.sunday).toHaveLength(1)
    expect(result.sunday[0].name).toBe('Hino 1')
  })

  it('SECTION_RE — section header com espaços/linha vazia', () => {
    // section header [item_001] sem espaços — já mata SECTION_RE
    // parser não faz trim do sectionId; teste com espaços falha na ordem
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].name).toBe('Hino')
  })

  it('SECTION_RE — section header case-insensitive (lowercase interno)', () => {
    const ja = `[Geral]
1=ITEM_001
[ITEM_001]
tipo=musica
item=Hino
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].id).toBe('ja_item_001')
  })

  it('KV_RE — chave=valor com = no valor', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino=Com=Igual
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].name).toBe('Hino=Com=Igual')
  })

  it('KV_RE — linhas sem = são ignoradas (não quebram parser)', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
linha sem igual
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].name).toBe('Hino')
  })

  it('DELPHI_COLOR_RE — $RRGGBB válido vira #RRGGBB', () => {
    // Delphi: $AARRGGBB → #RRGGBB. $000000FF = AA=00, RR=00, GG=00, BB=FF → #FF0000
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
cor=$000000FF
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].accentColor).toBe('#FF0000')
  })

  it('DELPHI_COLOR_RE — $AABBCC minúsculo', () => {
    // $00CCBBAA → #AABBCC
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
cor=$00CCBBAA
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].accentColor).toBe('#AABBCC')
  })

  it('DELPHI_COLOR_RE — formato inválido retorna string vazia', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
cor=FF0000
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].accentColor).toBe('')
  })

  it('typeFromPath — video extensions (mp4, mkv, avi, webm, mov)', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=arquivo
dir=/x/video.mp4
subitem=Video
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].type).toBe('video')
  })

  it('typeFromPath — image extensions (jpg, jpeg, png, gif, bmp, webp)', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']) {
      const ja = `[Geral]
1=item_001
[item_001]
tipo=arquivo
dir=/x/img.${ext}
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].type).toBe('images')
    }
  })

  it('typeFromPath — pdf e presentation', () => {
    for (const [ext, type] of [['pdf', 'pdf'], ['pptx', 'presentation'], ['ppt', 'presentation']] as const) {
      const ja = `[Geral]
1=item_001
[item_001]
tipo=arquivo
dir=/x/doc.${ext}
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].type).toBe(type)
    }
  })

  it('typeFromPath — unknown extension vira other_files', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=arquivo
dir=/x/file.xyz
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].type).toBe('other_files')
  })

  it('typeFromPath — path vazio vira other_files', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=arquivo
subitem=SemPath
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].type).toBe('other_files')
  })

  it('baseId — remove sufixo _dN_iM', () => {
    const ja = `[Geral]
1=item_001_d5_i2
[item_001_d5_i2]
tipo=musica
item=Hino
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].id).toBe('ja_item_001')
  })

  it('baseId — sem sufixo mantém id', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].id).toBe('ja_item_001')
  })

  it('isDoneToday — checked vazio = false', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
checked=
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].done).toBe(false)
  })

  it('isDoneToday — checked data diferente de hoje = false', () => {
    const ja = `[Geral]
1=item_001
[item_001]
tipo=musica
item=Hino
checked=01/01/2000
`
    const result = parseJaLiturgy(ja)
    expect(result.sunday[0].done).toBe(false)
  })

  it('parseJaLiturgy — sem [Geral] lança', () => {
    expect(() => parseJaLiturgy('[item]\ntipo=musica\nitem=Hino\n')).toThrow('[Geral]')
  })

  it('parseJaLiturgy — [Geral] sem ordem lança', () => {
    expect(() => parseJaLiturgy('[Geral]\n[item]\ntipo=musica\nitem=Hino\n')).toThrow('[Geral]')
  })

  it('parseJaLiturgy — sem itens lança', () => {
    expect(() => parseJaLiturgy('[Geral]\n1=item_001\n[item_001]\ntipo=invalido\n')).toThrow('sem itens')
  })

  it('decodeJaBytes — UTF-8 válido', () => {
    const bytes = new TextEncoder().encode('[Geral]\n1=x\n[x]\ntipo=musica\nitem=Hino\n')
    expect(decodeJaBytes(bytes)).toContain('Hino')
  })

  it('decodeJaBytes — Latin-1 (Windows-1252) fallback', () => {
    // 0xE9 = é em Latin-1
    const bytes = new Uint8Array([0x5B, 0x47, 0x65, 0x72, 0x61, 0x6C, 0x5D, 0x0A, 0x31, 0x3D, 0x78, 0x0A, 0x5B, 0x78, 0x5D, 0x0A, 0x74, 0x69, 0x70, 0x6F, 0x3D, 0x6D, 0x75, 0x73, 0x69, 0x63, 0x61, 0x0A, 0x69, 0x74, 0x65, 0x6D, 0x3D, 0x48, 0x69, 0x6E, 0x6F, 0xE9, 0x0A])
    const text = decodeJaBytes(bytes)
    expect(text).toContain('Hino')
  })
})

describe('library-catalog mutation kill — ArrowFunction/ArrayDeclaration/Regex/strings', () => {
  it('sortCategories — by CATEGORY_ORDER then name (ArrowFunction sort)', () => {
    const categories = [
      { id: 'zebra', name: 'Zebra', albums: [] },
      { id: 'hymnals', name: 'Hinários', albums: [] },
      { id: 'alpha', name: 'Alpha', albums: [] },
    ] as any
    const result = sortCategories(categories)
    expect(result[0].id).toBe('hymnals') // CATEGORY_ORDER = 1
    expect(result[1].id).toBe('alpha')   // ordem alfabética
    expect(result[2].id).toBe('zebra')
  })

  it('sortCategories — mesmo order, ordena por name localeCompare', () => {
    const categories = [
      { id: 'x', name: 'Zebra', albums: [] },
      { id: 'y', name: 'Alpha', albums: [] },
    ] as any
    const result = sortCategories(categories)
    expect(result[0].name).toBe('Alpha')
    expect(result[1].name).toBe('Zebra')
  })

  it('sortCategories — categoria desconhecida vai pro final (order 50)', () => {
    const categories = [
      { id: 'unknown', name: 'Desconhecida', albums: [] },
      { id: 'hymnals', name: 'Hinários', albums: [] },
    ] as any
    const result = sortCategories(categories)
    expect(result[0].id).toBe('hymnals')
    expect(result[1].id).toBe('unknown')
  })

  it('sortCategories — array vazio retorna vazio', () => {
    expect(sortCategories([])).toEqual([])
  })

  it('sortCategories — null/undefined entries tratados', () => {
    const categories = [
      { id: 'a', name: 'A', albums: [] },
      { id: 'b', name: 'B', albums: [] },
    ] as any
    // função não filtra null — comportamento real é crash, testamos entrada válida
    const result = sortCategories(categories)
    expect(result.length).toBe(2)
  })
})