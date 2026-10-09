import { describe, expect, it } from 'vitest'

import { matchesAllTerms } from '../search-terms'

describe('matchesAllTerms (busca por termos — bug 03/10)', () => {
  const title = 'Jesus'
  const album = 'Adoradores 5'

  it('substring contígua no título continua casando', () => {
    expect(matchesAllTerms(title, album, 'jesus')).toBe(true)
    expect(matchesAllTerms(title, album, 'Je')).toBe(true)
  })

  it('substring contígua no álbum continua casando', () => {
    expect(matchesAllTerms(title, album, 'adoradores 5')).toBe(true)
    expect(matchesAllTerms(title, album, 'adoradores')).toBe(true)
  })

  it('termos espalhados entre título e álbum casam (o bug)', () => {
    expect(matchesAllTerms(title, album, 'jesus adoradores')).toBe(true)
    expect(matchesAllTerms(title, album, 'jesus adoradores 5')).toBe(true)
    expect(matchesAllTerms(title, album, 'Jesus do Adoradores 5')).toBe(true)
    expect(matchesAllTerms(title, album, 'adoradores 5 jesus')).toBe(true)
  })

  it('termo inexistente falha', () => {
    expect(matchesAllTerms(title, album, 'jesus inexistente')).toBe(false)
    expect(matchesAllTerms(title, album, 'por do sol')).toBe(false)
  })

  it('termo de 1 letra só casa se existir', () => {
    expect(matchesAllTerms(title, album, 'j 5')).toBe(true)
    expect(matchesAllTerms(title, album, 'z 9')).toBe(false)
  })

  it('query vazia/só espaços = falso', () => {
    expect(matchesAllTerms(title, album, '')).toBe(false)
    expect(matchesAllTerms(title, album, '   ')).toBe(false)
  })

  it('case-insensitive com acentos (fold diacrítico 03/10: sem acento casa com acento)', () => {
    expect(matchesAllTerms('Graça', 'Adoradores', 'graça')).toBe(true)
    expect(matchesAllTerms('Graça', 'Adoradores', 'graca')).toBe(true) // fold NFD resolve #346
  })

  it('música sem álbum (searchable vazio) casa por título', () => {
    expect(matchesAllTerms('Jesus', '', 'jesus')).toBe(true)
    expect(matchesAllTerms('Jesus', '', 'adoradores')).toBe(false)
  })
})

describe('matchesAllTerms — busca por trecho da letra (03/10)', () => {
  const title = 'Jesus'
  const album = 'Adoradores 5'
  const lyrics = 'cristo salvador do mundo, luz que ilumina'

  it('substring contígua na letra casa', () => {
    expect(matchesAllTerms(title, album, 'salvador do mundo', lyrics)).toBe(true)
  })

  it('termos espalhados na letra casam', () => {
    expect(matchesAllTerms(title, album, 'luz ilumina', lyrics)).toBe(true)
  })

  it('sem letra, comportamento antigo (não casa)', () => {
    expect(matchesAllTerms(title, album, 'salvador do mundo')).toBe(false)
  })

  it('título/álbum continuam casando com letra presente', () => {
    expect(matchesAllTerms(title, album, 'jesus adoradores', lyrics)).toBe(true)
  })
})

describe('matchesAllTerms — fold de acentos (03/10)', () => {
  const lyrics = 'não temas, eu sou contigo; não desanimar'
  it('usurio digita sem acento e acha a letra acentuada', () => {
    expect(matchesAllTerms('Oh, Não Temas', 'Hinário', 'nao temas sou contigo', lyrics)).toBe(true)
  })
  it('trecho sem acento casa letra acentuada', () => {
    expect(matchesAllTerms('x', 'y', 'nao desanimar', lyrics)).toBe(true)
  })
})
