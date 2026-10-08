import { describe, it, expect } from 'vitest'
import { parseJaLiturgy } from '../services/liturgy-ja-import'

/**
 * Kill plane liturgy-ja-import — 26 survivors:
 * Regex âncoras/remover $ (SECTION/KV/DELPHI_COLOR/extensões/baseId),
 * MethodExpression trim/exec, ConditionalExpression guards, StringLiteral
 * defaults (checked/cor/musica), BOM, dias.
 */

function buildFile(opts: {
  bom?: boolean
  sections?: Array<{ id: string; fields: Record<string, string> }>
  geral?: Record<string, string>
}): string {
  const lines: string[] = []
  lines.push('[Geral]')
  for (const [k, v] of Object.entries(opts.geral ?? {})) lines.push(`${k}=${v}`)
  for (const s of opts.sections ?? []) {
    lines.push(`[${s.id}]`)
    for (const [k, v] of Object.entries(s.fields)) lines.push(`${k}=${v}`)
  }
  return (opts.bom ? '﻿' : '') + lines.join('\n') + '\n'
}

const MUSIC_FIELDS = {
  tipo: 'musica',
  item: 'Hino 1',
  subitem: 'sub',
  musica: '123',
  cor: '$FFAB1234',
}

describe('regex âncoras (#8/#9/#11/#12/#16)', () => {
  it('#8/#9 section: colchetes só fecham linha INTEIRA (não "x[a]" nem "[a]x")', () => {
    // mutante sem ^: "lixo [item1]" viraria seção
    const bad = buildFile({
      sections: [{ id: 'item1', fields: MUSIC_FIELDS }],
      geral: { '1': 'item1' },
    })
    expect(() => parseJaLiturgy('prefixo [Geral] sufixo\n' + bad)).not.toThrow()
    // linha "x[Geral]" NÃO é seção -> arquivo sem [Geral] real -> lança
    const noGeral = buildFile({
      sections: [{ id: 'item1', fields: MUSIC_FIELDS }],
      geral: { '1': 'item1' },
    })
    const withPrefix = noGeral.replace('[Geral]', 'x [Geral]')
    expect(() => parseJaLiturgy(withPrefix)).toThrow()
  })

  it('#11/#12 kv: "chave=valor" exige = e captura depois do 1o =', () => {
    const ja = buildFile({
      sections: [{ id: 'item1', fields: { ...MUSIC_FIELDS, item: 'A=B' } }],
      geral: { '1': 'item1' },
    })
    const result = parseJaLiturgy(ja)
    expect(result.sunday?.[0]?.name).toBe('A=B')
  })

  it('#16 cor Delphi: exatamente 8 hex após $ (senão vazio)', () => {
    const ja = buildFile({
      sections: [
        { id: 'item1', fields: { ...MUSIC_FIELDS, cor: '$AB1234567' } }, // 9 hex
        { id: 'item2', fields: { ...MUSIC_FIELDS, cor: '  $00AB1234  ' } }, // ok, trim
        { id: 'item3', fields: { ...MUSIC_FIELDS, cor: '$AB123G4' } }, // não-hex
      ],
      geral: { '1': 'item1;item2;item3' },
    })
    const result = parseJaLiturgy(ja)
    expect(result.sunday?.[0]?.accentColor).toBe('') // 9 hex não casa
    expect(result.sunday?.[1]?.accentColor).toBe('#3412AB') // BGR->RGB
    expect(result.sunday?.[2]?.accentColor).toBe('')
  })
})

describe('extensões e baseId (#24/#45/#49/#58)', () => {
  it('#45/#49/#58 tipo por extensão EXATA no fim (não no meio)', () => {
    const ja = buildFile({
      sections: [
        { id: 'item_v', fields: { tipo: 'arquivo', dir: '/a/x.MP4' } },
        { id: 'item_i', fields: { tipo: 'arquivo', dir: '/a/y.webp' } },
        { id: 'item_p', fields: { tipo: 'arquivo', dir: '/a/z.PPT' } },
        { id: 'item_o', fields: { tipo: 'arquivo', dir: '/a/x.mp4.exe' } },
        { id: 'item_o2', fields: { tipo: 'arquivo', dir: '/a/x.mp4txt' } },
      ],
      geral: { '2': 'item_v;item_i;item_p;item_o;item_o2' },
    })
    const r = parseJaLiturgy(ja)
    expect(r.monday?.[0]?.type).toBe('video')
    expect(r.monday?.[1]?.type).toBe('images')
    expect(r.monday?.[2]?.type).toBe('presentation')
    // mutante sem $: .mp4 dentro do nome viraria video
    expect(r.monday?.[3]?.type).toBe('other_files')
    expect(r.monday?.[4]?.type).toBe('other_files')
  })

  it('#24 baseId remove sufixo _d<N>_i<M> do FIM (não do meio)', () => {
    const ja = buildFile({
      sections: [
        { id: 'item9_d3_i1', fields: MUSIC_FIELDS },
        { id: 'item9', fields: { ...MUSIC_FIELDS, item: 'Base' } },
      ],
      geral: { '3': 'item9_d3_i1' },
    })
    const r = parseJaLiturgy(ja)
    // baseId('item9_d3_i1') = 'item9' -> mesmo item da seção base
    // como item9 (Base) veio depois, o primeiro (Hino 1) vence no map
    expect(r.tuesday?.[0]?.name).toBe('Hino 1')
    // sufixo no MEIO não é removido: item9_d3_i1_x9 fica id próprio
    const ja2 = buildFile({
      sections: [{ id: 'item9_d3_i1_x9', fields: MUSIC_FIELDS }],
      geral: { '3': 'item9_d3_i1_x9' },
    })
    const r2 = parseJaLiturgy(ja2)
    expect(r2.tuesday?.[0]?.id).toBe('ja_item9_d3_i1_x9')
  })
})

describe('defaults e guards do parseSectionItem (#28/#41/#58/#64/#74/#76/#79/#81/#90/#93/#133)', () => {
  it('#28 cor exec usa raw TRIMADO (cor com espaços nas pontas)', () => {
    const ja = buildFile({
      sections: [{ id: 'item1', fields: { ...MUSIC_FIELDS, cor: '   $00AB1234  ' } }],
      geral: { '1': 'item1' },
    })
    expect(parseJaLiturgy(ja).sunday?.[0]?.accentColor).toBe('#3412AB')
  })

  it('#41 tipo vazio (sem campo tipo) -> other_files? NÃO: null (item ignorado)', () => {
    // sem tipo, type fica null -> parseSectionItem retorna null -> sem itens -> lança
    const ja = buildFile({
      sections: [{ id: 'item1', fields: { item: 'x' } }],
      geral: { '1': 'item1' },
    })
    expect(() => parseJaLiturgy(ja)).toThrow('sem itens')
  })

  it('#64 tipo com espaços e maiúsculas -> trim + lower', () => {
    const ja = buildFile({
      sections: [{ id: 'item1', fields: { ...MUSIC_FIELDS, tipo: '  MUSICA ' } }],
      geral: { '1': 'item1' },
    })
    const r = parseJaLiturgy(ja)
    expect(r.sunday?.[0]?.type).toBe('music')
  })

  it('#74/#76/#79/#81 checked: data de hoje marca done; vazia/lixo não', () => {
    const now = new Date()
    const dd = String(now.getDate()).padStart(2, '0')
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yyyy = String(now.getFullYear())
    const hoje = `${dd}/${mm}/${yyyy}`
    const ja = buildFile({
      sections: [
        { id: 'item1', fields: { ...MUSIC_FIELDS } }, // sem checked
        { id: 'item2', fields: { ...MUSIC_FIELDS, checked: hoje } }, // hoje
        { id: 'item3', fields: { ...MUSIC_FIELDS, checked: '  ' } }, // whitespace
        { id: 'item4', fields: { ...MUSIC_FIELDS, checked: `01/01/2000` } }, // outro dia
        { id: 'item5', fields: { ...MUSIC_FIELDS, checked: ` ${hoje} ` } }, // trim
      ],
      geral: { '4': 'item1;item2;item3;item4;item5' },
    })
    const r = parseJaLiturgy(ja)
    expect(r.wednesday?.[0]?.done).toBe(false)
    expect(r.wednesday?.[1]?.done).toBe(true)
    expect(r.wednesday?.[2]?.done).toBe(false)
    expect(r.wednesday?.[3]?.done).toBe(false)
    expect(r.wednesday?.[4]?.done).toBe(true)
  })

  it('#90 cor ausente -> accentColor vazio (não lixo)', () => {
    const ja = buildFile({
      sections: [{ id: 'item1', fields: { tipo: 'musica', item: 'x' } }],
      geral: { '1': 'item1' },
    })
    expect(parseJaLiturgy(ja).sunday?.[0]?.accentColor).toBe('')
  })

  it('#93/#133 musica ausente/inválida -> musicId null; válida -> número', () => {
    const ja = buildFile({
      sections: [
        { id: 'item1', fields: { tipo: 'musica', item: 'a' } }, // sem musica
        { id: 'item2', fields: { tipo: 'musica', item: 'b', musica: 'abc' } }, // NaN
        { id: 'item3', fields: { tipo: 'musica', item: 'c', musica: '42' } }, // ok
        { id: 'item4', fields: { tipo: 'arquivo', item: 'd', dir: '/a.mp4', musica: '42' } }, // não-music -> null
      ],
      geral: { '5': 'item1;item2;item3;item4' },
    })
    const r = parseJaLiturgy(ja)
    expect(r.thursday?.[0]?.musicId).toBeNull()
    expect(r.thursday?.[1]?.musicId).toBeNull()
    expect(r.thursday?.[2]?.musicId).toBe(42)
    expect(r.thursday?.[3]?.musicId).toBeNull()
  })
})

describe('BOM, linhas vazias, geral e refs (#141/#142/#144/#150/#167/#169/#190)', () => {
  it('#141/#142/#144 BOM no início é removido (senão [Geral] não casa)', () => {
    const ja = buildFile({
      bom: true,
      sections: [{ id: 'item1', fields: MUSIC_FIELDS }],
      geral: { '1': 'item1' },
    })
    const r = parseJaLiturgy(ja)
    expect(r.sunday?.[0]?.name).toBe('Hino 1')
  })

  it('#150 linhas vazias/whitespace no meio são ignoradas', () => {
    const ja = buildFile({
      sections: [{ id: 'item1', fields: MUSIC_FIELDS }],
      geral: { '1': 'item1' },
    })
    const comVazias = ja.replace('[item1]', '\n   \n[item1]\n')
    const r = parseJaLiturgy(comVazias)
    expect(r.sunday?.[0]?.type).toBe('music')
  })

  it('#167/#169 seção [Geral] pula o loop de itens (não vira item)', () => {
    const ja = buildFile({
      sections: [{ id: 'item1', fields: MUSIC_FIELDS }],
      geral: { '1': 'item1' },
    })
    const r = parseJaLiturgy(ja)
    // sunday tem EXATAMENTE 1 item (item1) — o geral não virou item
    expect(r.sunday).toHaveLength(1)
  })

  it('#190 refs vazias na lista do dia são puladas (";it1;;")', () => {
    const ja = buildFile({
      sections: [{ id: 'item1', fields: MUSIC_FIELDS }],
      geral: { '6': ';item1;;' },
    })
    const r = parseJaLiturgy(ja)
    expect(r.friday).toHaveLength(1)
  })
})
