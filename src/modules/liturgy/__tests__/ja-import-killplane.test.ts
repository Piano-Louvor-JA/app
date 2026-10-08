// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { parseJaLiturgy } from '../services/liturgy-ja-import'

/**
 * Kill plane liturgy-ja-import (survivors Stryker round 5).
 * Foco: regexes âncoras (#8/#9/#11/#12/#16/#17/#21-24), trim/whitespace
 * (#28/#34/#63/#64/#76), defaults (#74/#90/#93/#113), guardas (#41/#79/#116-121),
 * BOM (#141/#142/#144), linhas vazias (#150), kv key trim (#159),
 * seção geral (#167/#169), ids vazios (#190).
 */

function todayJa(): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${now.getFullYear()}`
}

function tomorrowJa(): string {
  const now = new Date()
  now.setDate(now.getDate() + 1)
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${now.getFullYear()}`
}

const VALID = [
  '[Geral]',
  '1=sec_a',
  '7=sec_a',
  '',
  '[sec_a]',
  'tipo=musica',
  'item=Hino 1',
  'checked=',
  'cor=$FF0000FF',
  'musica=42',
].join('\n')

describe('parseJaLiturgy mata mutantes de regex âncora', () => {
  it('seção precisa de [ ] completos (#8 sem $ / #9 sem ^)', () => {
    // #9 sem ^: 'x[Geral]' casaria; original: linha não é seção -> key/valor com = ausente
    // seção inválida vira KV inútil e [Geral] nunca criada -> lança
    expect(() => parseJaLiturgy('x[geral]\n')).toThrow()
    // conteúdo depois do ] não é seção (#8 sem $)
    expect(() => parseJaLiturgy('[geral]lixo\n')).toThrow()
  })

  it('KV precisa de = e captura tudo (#11/#12)', () => {
    const src = ['[Geral]', '7=sec_a', '[sec_a]', 'tipo=musica', 'item=A B=C'].join('\n')
    const result = parseJaLiturgy(src)
    // #12 sem $: value 'A B=C' seria truncado; original captura a linha inteira como name
    expect(result.saturday![0]!.name).toBe('A B=C')
  })

  it('cor Delphi exige $ + 8 hex completos (#16/#17)', () => {
    const bad = VALID.replace('cor=$FF0000FF', 'cor=$FF0000FF99')
    const result = parseJaLiturgy(bad)
    expect(result.sunday![0]!.accentColor).toBe('') // 9 dígitos: regex não casa -> ''
    const res2 = parseJaLiturgy(VALID)
    expect(res2.sunday![0]!.accentColor).toBe('#FF0000') // ABGR -> #RRGGBB
  })

  it('baseId remove sufixo _dN_iN com $ (#21-24), inclusive multi-dígito (#22)', () => {
    const src = [
      '[Geral]',
      `7=secao_d10_i2`,
      '[secao_d10_i2]',
      'tipo=anotacao',
      'item=Oração',
    ].join('\n')
    const result = parseJaLiturgy(src)
    // mutante #22 (\d+ -> \d): '_d10_i2' não casaria -> id ficaria 'ja_secao_d10_i2'
    expect(result.saturday![0]!.id).toBe('ja_secao')
  })

  it('baseId exige dígito depois do i (#24)', () => {
    const src = [
      '[Geral]',
      '7=secao_d1_i2x',
      '[secao_d1_i2x]',
      'tipo=anotacao',
      'item=X',
    ].join('\n')
    const result = parseJaLiturgy(src)
    // sem $ no final do \d: 'secao_d1_i2x' manteria sufixo; com regex correta remove _d1_i2 -> 'secao' + 'x'
    expect(result.saturday![0]!.id).toBe('ja_secao_d1_i2x')
  })

  it('mapa de dias: 4=quarta, 5=quinta (#4/#5)', () => {
    const src = [
      '[Geral]',
      '4=sec_a',
      '5=sec_a',
      '[sec_a]',
      'tipo=anotacao',
      'item=X',
    ].join('\n')
    const r = parseJaLiturgy(src)
    expect(r.wednesday).toHaveLength(1)
    expect(r.thursday).toHaveLength(1)
  })
})

describe('parseSectionItem mata mutantes de trim/default/guards', () => {
  it('tipo com whitespace/caixa trimada (#63/#64)', () => {
    const src = ['[Geral]', '7=sec', '[sec]', 'tipo=  MUSICA  ', 'item=H'].join('\n')
    const r = parseJaLiturgy(src)
    expect(r.saturday![0]!.type).toBe('music')
  })

  it('checked só hoje marca done; vazio/outra data não (#74/#76/#79)', () => {
    const done = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=anotacao', 'item=A', `checked=${todayJa()}`].join('\n'))
    expect(done.saturday![0]!.done).toBe(true)
    const notDone = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=anotacao', 'item=A', `checked=${tomorrowJa()}`].join('\n'))
    expect(notDone.saturday![0]!.done).toBe(false)
    const empty = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=anotacao', 'item=A', 'checked=   '].join('\n'))
    expect(empty.saturday![0]!.done).toBe(false)
  })

  it('cor ausente vira accentColor "" (#90)', () => {
    const r = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=anotacao', 'item=A'].join('\n'))
    expect(r.saturday![0]!.accentColor).toBe('')
  })

  it('musica inválida vira musicId null; música com id parseia (#93/#133)', () => {
    const ok = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=musica', 'item=H', 'musica=  42  '].join('\n'))
    expect(ok.saturday![0]!.musicId).toBe(42)
    const bad = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=musica', 'item=H', 'musica=abc'].join('\n'))
    expect(bad.saturday![0]!.musicId).toBeNull()
  })

  it('arquivo: dir trimada; annotation/music não ganham filePath (#113/#116-121)', () => {
    const file = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=arquivo', 'item=F', 'dir=  /v.mp4  '].join('\n'))
    expect(file.saturday![0]!.type).toBe('video')
    expect(file.saturday![0]!.filePath).toBe('/v.mp4')

    const ann = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=anotacao', 'item=A', 'dir=/x.pdf'].join('\n'))
    expect(ann.saturday![0]!.filePath).toBeUndefined()

    const mus = parseJaLiturgy(['[Geral]', '7=s', '[s]', 'tipo=musica', 'item=H', 'dir=/x.mp4'].join('\n'))
    expect(mus.saturday![0]!.filePath).toBeUndefined()
  })

  it('tipo desconhecido retorna null e é ignorado (#41)', () => {
    const src = ['[Geral]', '7=s2', '[s]', 'tipo=x', 'item=A', '[s2]', 'tipo=anotacao', 'item=B'].join('\n')
    const r = parseJaLiturgy(src)
    expect(r.saturday).toHaveLength(1)
    expect(r.saturday![0]!.name).toBe('B')
  })
})

describe('parseJaLiturgy mata mutantes de BOM/linha/seções', () => {
  it('BOM no início é removido (#141/#142/#144)', () => {
    const src = '\ufeff[Geral]\n7=s\n[s]\ntipo=anotacao\nitem=A'
    const r = parseJaLiturgy(src)
    expect(r.saturday).toHaveLength(1)
  })

  it('linhas vazias entre campos são ignoradas (#150)', () => {
    const src = ['[Geral]', '', '7=s', '', '[s]', '', 'tipo=anotacao', '', 'item=A'].join('\n')
    const r = parseJaLiturgy(src)
    expect(r.saturday![0]!.name).toBe('A')
  })

  it('chave KV é trimada e caixa baixa (#159)', () => {
    const src = ['[Geral]', '7=s', '[s]', '  TIPO  =anotacao', 'item=A'].join('\n')
    const r = parseJaLiturgy(src)
    expect(r.saturday![0]!.type).toBe('annotation')
  })

  it('seção geral não vira item (#167/#169)', () => {
    // [geral] tem campos tipo/item que NÃO podem virar item
    const src = ['[geral]', '1=s', 'tipo=arquivo', 'item=Fake', 'dir=/f.mp4', '[s]', 'tipo=anotacao', 'item=Real'].join('\n')
    const r = parseJaLiturgy(src)
    expect(r.sunday).toHaveLength(1)
    expect(r.sunday![0]!.name).toBe('Real')
  })

  it('refs vazias em [Geral] são puladas (#190)', () => {
    const src = ['[Geral]', '7=  ', '7=s', '[s]', 'tipo=anotacao', 'item=A'].join('\n')
    const r = parseJaLiturgy(src)
    expect(r.saturday).toHaveLength(1)
  })

  it('duas refs com mesmo baseId apontam pro MESMO item (has() evita recriar)', () => {
    const src = [
      '[Geral]',
      '7=s_d1_i1; s_d1_i2',
      '[s_d1_i1]',
      'tipo=anotacao',
      'item=Primeiro',
      '[s_d1_i2]',
      'tipo=anotacao',
      'item=Segundo',
    ].join('\n')
    const r = parseJaLiturgy(src)
    // itemsById guarda só o primeiro, mas ambas refs resolvem pra ele
    expect(r.saturday).toHaveLength(2)
    expect(r.saturday![0]!.name).toBe('Primeiro')
    expect(r.saturday![1]!.name).toBe('Primeiro')
    expect(r.saturday![0]).toBe(r.saturday![1]) // mesma instância (#127 has)
  })
})
