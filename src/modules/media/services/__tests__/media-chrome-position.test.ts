// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import {
  MEDIA_CHROME_EDGE_MARGIN,
  clampMediaChromePosition,
  loadMediaChromePosition,
  normalizeMediaChromePosition,
  saveMediaChromePosition,
} from '../media-chrome-position'

const size = { width: 400, height: 150 }
const viewport = { width: 1024, height: 768 }

beforeEach(() => {
  localStorage.clear()
})

describe('normalizeMediaChromePosition', () => {
  it.each([null, undefined, 'x', 42, {}, { x: 1 }, { x: '1', y: 2 }, { x: Number.NaN, y: 2 }, { x: 1, y: Infinity }])(
    'valor inválido %j vira null',
    (raw) => {
      expect(normalizeMediaChromePosition(raw)).toBeNull()
    },
  )

  it('aceita coordenadas numéricas finitas', () => {
    expect(normalizeMediaChromePosition({ x: 10.5, y: -3, extra: true })).toEqual({ x: 10.5, y: -3 })
  })
})

describe('clampMediaChromePosition', () => {
  it('posição dentro da janela fica igual (arredondada)', () => {
    expect(clampMediaChromePosition({ x: 100.4, y: 200.6 }, size, viewport)).toEqual({ x: 100, y: 201 })
  })

  it('não deixa sair pela esquerda/topo', () => {
    expect(clampMediaChromePosition({ x: -50, y: -10 }, size, viewport)).toEqual({
      x: MEDIA_CHROME_EDGE_MARGIN,
      y: MEDIA_CHROME_EDGE_MARGIN,
    })
  })

  it('não deixa sair pela direita/base', () => {
    expect(clampMediaChromePosition({ x: 5000, y: 5000 }, size, viewport)).toEqual({
      x: 1024 - 400 - MEDIA_CHROME_EDGE_MARGIN,
      y: 768 - 150 - MEDIA_CHROME_EDGE_MARGIN,
    })
  })

  it('janela menor que o player: cola na margem superior esquerda', () => {
    expect(
      clampMediaChromePosition({ x: 300, y: 300 }, size, { width: 200, height: 100 }, 4),
    ).toEqual({ x: 4, y: 4 })
  })
})

describe('load/save', () => {
  it('sem preferência salva: null (canto padrão)', () => {
    expect(loadMediaChromePosition()).toBeNull()
  })

  it('persiste e recarrega a posição', () => {
    saveMediaChromePosition({ x: 120, y: 80 })
    expect(loadMediaChromePosition()).toEqual({ x: 120, y: 80 })
  })

  it('salvar null volta ao canto padrão', () => {
    saveMediaChromePosition({ x: 120, y: 80 })
    saveMediaChromePosition(null)
    expect(loadMediaChromePosition()).toBeNull()
  })
})
