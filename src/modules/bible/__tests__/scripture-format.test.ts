import { describe, expect, it } from 'vitest'

import {
  buildProjectionText,
  emptySelection,
  formatScripturalReference,
  formatVerseIntervals,
  parseVerseQuery,
} from '../services/scripture-format'

const VERSES = {
  '1': 'No princípio criou Deus os céus.',
  '2': 'E a terra era sem forma e vazia.',
  '3': 'E disse Deus: Haja luz.',
}

describe('formatVerseIntervals', () => {
  it('retorna vazio para lista vazia', () => {
    expect(formatVerseIntervals([])).toBe('')
  })

  it('um único versículo não vira intervalo', () => {
    expect(formatVerseIntervals([5])).toBe('5')
  })

  it('sequência contígua vira intervalo fechado', () => {
    expect(formatVerseIntervals([1, 2, 3])).toBe('1-3')
  })

  it('números soltos e intervalos mistos', () => {
    expect(formatVerseIntervals([1, 3, 4, 5, 8])).toBe('1,3-5,8')
  })

  it('ordena antes de agrupar', () => {
    expect(formatVerseIntervals([3, 1, 2])).toBe('1-3')
  })
})

describe('formatScripturalReference', () => {
  it('retorna vazio sem livro', () => {
    expect(
      formatScripturalReference({ bookName: '', chapter: 1, verses: [] }),
    ).toBe('')
  })

  it('retorna vazio sem capítulo', () => {
    expect(
      formatScripturalReference({ bookName: 'Gênesis', chapter: 0, verses: [] }),
    ).toBe('')
  })

  it('livro e capítulo sem versículos', () => {
    expect(
      formatScripturalReference({ bookName: 'Gênesis', chapter: 1, verses: [] }),
    ).toBe('Gênesis 1')
  })

  it('inclui intervalo de versículos', () => {
    expect(
      formatScripturalReference({
        bookName: 'Gênesis',
        chapter: 1,
        verses: [1, 2, 3],
      }),
    ).toBe('Gênesis 1:1-3')
  })

  it('inclui abreviação de versão', () => {
    expect(
      formatScripturalReference({
        bookName: 'Gênesis',
        chapter: 1,
        verses: [1],
        versionAbbreviation: 'ARA',
      }),
    ).toBe('Gênesis 1:1 (ARA)')
  })

  it('ignora abreviação "null" (legado do catálogo)', () => {
    expect(
      formatScripturalReference({
        bookName: 'Gênesis',
        chapter: 1,
        verses: [],
        versionAbbreviation: 'NULL',
      }),
    ).toBe('Gênesis 1')
  })
})

describe('buildProjectionText', () => {
  it('concatena versículos selecionados na ordem pedida', () => {
    expect(buildProjectionText(VERSES, [2, 1])).toBe(
      'E a terra era sem forma e vazia. No princípio criou Deus os céus.',
    )
  })

  it('ignora versículos inexistentes', () => {
    expect(buildProjectionText(VERSES, [1, 99])).toBe(
      'No princípio criou Deus os céus.',
    )
  })

  it('retorna vazio sem seleção', () => {
    expect(buildProjectionText(VERSES, [])).toBe('')
  })
})

describe('parseVerseQuery', () => {
  it('número simples existente', () => {
    expect(parseVerseQuery('2', VERSES)).toEqual([2])
  })

  it('intervalo existente', () => {
    expect(parseVerseQuery('1-3', VERSES)).toEqual([1, 2, 3])
  })

  it('intervalo invertido normaliza ordem', () => {
    expect(parseVerseQuery('3-1', VERSES)).toEqual([1, 2, 3])
  })

  it('lista com espaços', () => {
    expect(parseVerseQuery(' 1 , 3 ', VERSES)).toEqual([1, 3])
  })

  it('filtrar versículos inexistentes do intervalo', () => {
    expect(parseVerseQuery('2-10', VERSES)).toEqual([2, 3])
  })

  it('ignora parte vazia (vírgula dupla)', () => {
    expect(parseVerseQuery('1,,2', VERSES)).toEqual([1, 2])
  })

  it('ignora intervalo inválido (sem número)', () => {
    expect(parseVerseQuery('a-b', VERSES)).toEqual([])
  })

  it('ignora número inexistente', () => {
    expect(parseVerseQuery('50', VERSES)).toEqual([])
  })

  it('resultado sai ordenado e sem duplicatas', () => {
    expect(parseVerseQuery('3,1,2,1', VERSES)).toEqual([1, 2, 3])
  })
})

describe('emptySelection', () => {
  it('retorna seleção zerada com capítulo 1', () => {
    expect(emptySelection()).toEqual({
      versionId: null,
      bookId: null,
      versionAbbreviation: '',
      bookName: '',
      chapter: 1,
      verses: [],
      scripturalReference: '',
      text: '',
    })
  })
})
