import { describe, expect, it } from 'vitest'

import { parseVerseFilter, parseVerseQuery } from '../scripture-format'

describe('parseVerseFilter — listas e intervalos mistos (paridade app R4+)', () => {
  it('rejeita números inseguros e intervalos que travariam a interface', () => {
    expect(parseVerseFilter('9007199254740992-9007199254740992')).toEqual([])
    expect(parseVerseFilter('9007199254740992')).toEqual([])
    expect(parseVerseFilter('1-1000000000')).toEqual([])
    // O fallback também só percorre os versículos existentes no capítulo.
    expect(parseVerseQuery('1-1000000000', { '1': 'A', '2': 'B' })).toEqual([1, 2])
  })

  it('aceita intervalo simples', () => {
    expect(parseVerseFilter('1-4')).toEqual([1, 2, 3, 4])
  })

  it('aceita lista com intervalo e extra: "1-4, 6"', () => {
    expect(parseVerseFilter('1-4, 6')).toEqual([1, 2, 3, 4, 6])
  })

  it('dedup e ordena', () => {
    expect(parseVerseFilter('6, 2, 4-4, 2')).toEqual([2, 4, 6])
  })

  it('normaliza travessão tipográfico (en dash U+2013)', () => {
    expect(parseVerseFilter('1\u20134, 6')).toEqual([1, 2, 3, 4, 6])
  })

  it('normaliza travessão eme (em dash U+2014)', () => {
    expect(parseVerseFilter('1\u20144')).toEqual([1, 2, 3, 4])
  })

  it('rejeita torta: qualquer parte inválida anula tudo (paridade app)', () => {
    expect(parseVerseFilter('1-4, abc')).toEqual([])
    expect(parseVerseFilter('0')).toEqual([])
    expect(parseVerseFilter('')).toEqual([])
  })
})
