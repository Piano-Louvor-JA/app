import { describe, expect, it } from 'vitest'

import { resolveBookTone } from '../bible-catalog'

import type { BibleBookTone } from '../../types/bible'

/**
 * Tabela dos 66 livros canônicos (ordem protestante, book_number do
 * catálogo `pt_bible_book`). Taxonomia compartilhada app/web — ver
 * card Paridade B4. A MESMA tabela deve existir em ambas as frentes.
 */
const EXPECTED_TONE_BY_BOOK_NUMBER: Record<number, BibleBookTone> = {
  1: 'law', // Gênesis
  2: 'law', // Êxodo
  3: 'law', // Levítico
  4: 'law', // Números
  5: 'law', // Deuteronômio
  6: 'history', // Josué
  7: 'history', // Juízes
  8: 'history', // Rute
  9: 'history', // 1 Samuel
  10: 'history', // 2 Samuel
  11: 'history', // 1 Reis
  12: 'history', // 2 Reis
  13: 'history', // 1 Crônicas
  14: 'history', // 2 Crônicas
  15: 'history', // Esdras
  16: 'history', // Neemias
  17: 'history', // Ester
  18: 'poetry', // Jó
  19: 'poetry', // Salmos
  20: 'poetry', // Provérbios
  21: 'poetry', // Eclesiastes
  22: 'poetry', // Cânticos
  23: 'major-prophet', // Isaías
  24: 'major-prophet', // Jeremias
  25: 'major-prophet', // Lamentações
  26: 'major-prophet', // Ezequiel
  27: 'major-prophet', // Daniel
  28: 'minor-prophet', // Oséias
  29: 'minor-prophet', // Joel
  30: 'minor-prophet', // Amós
  31: 'minor-prophet', // Obadias
  32: 'minor-prophet', // Jonas
  33: 'minor-prophet', // Miquéias
  34: 'minor-prophet', // Naum
  35: 'minor-prophet', // Habacuque
  36: 'minor-prophet', // Sofonias
  37: 'minor-prophet', // Ageu
  38: 'minor-prophet', // Zacarias
  39: 'minor-prophet', // Malaquias
  40: 'gospels', // Mateus
  41: 'gospels', // Marcos
  42: 'gospels', // Lucas
  43: 'gospels', // João
  44: 'acts', // Atos
  45: 'pauline', // Romanos
  46: 'pauline', // 1 Coríntios
  47: 'pauline', // 2 Coríntios
  48: 'pauline', // Gálatas
  49: 'pauline', // Efésios
  50: 'pauline', // Filipenses
  51: 'pauline', // Colossenses
  52: 'pauline', // 1 Tessalonicenses
  53: 'pauline', // 2 Tessalonicenses
  54: 'pauline', // 1 Timóteo
  55: 'pauline', // 2 Timóteo
  56: 'pauline', // Tito
  57: 'pauline', // Filemom
  58: 'general', // Hebreus
  59: 'general', // Tiago
  60: 'general', // 1 Pedro
  61: 'general', // 2 Pedro
  62: 'general', // 1 João
  63: 'general', // 2 João
  64: 'general', // 3 João
  65: 'general', // Judas
  66: 'apocalyptic', // Apocalipse
}

describe('resolveBookTone — taxonomia compartilhada app/web (66 livros)', () => {
  it('cobre exatamente os book numbers 1..66', () => {
    const numbers = Object.keys(EXPECTED_TONE_BY_BOOK_NUMBER).map(Number)
    expect(numbers).toHaveLength(66)
    expect(numbers.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 66 }, (_, index) => index + 1),
    )
  })

  it('mesmo livro = mesma categoria em app e web', () => {
    for (const [bookNumber, expectedTone] of Object.entries(
      EXPECTED_TONE_BY_BOOK_NUMBER,
    )) {
      expect(resolveBookTone(Number(bookNumber))).toBe(expectedTone)
    }
  })

  it('book number fora da faixa canônica mantém o mesmo comportamento da web', () => {
    expect(resolveBookTone(0)).toBe('law')
    expect(resolveBookTone(67)).toBe('neutral')
    expect(resolveBookTone(-1)).toBe('law')
  })
})
