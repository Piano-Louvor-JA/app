// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import {
  FLOATING_EDGE_MARGIN,
  clampFloatingPosition,
  loadFloatingPosition,
  normalizeFloatingPosition,
  saveFloatingPosition,
} from '../floating-position'

const KEY = 'test.floatingPosition'
const size = { width: 400, height: 150 }
const viewport = { width: 1024, height: 768 }

beforeEach(() => {
  localStorage.clear()
})

describe('normalizeFloatingPosition', () => {
  it.each([null, undefined, 'x', 42, {}, { x: 1 }, { x: '1', y: 2 }, { x: Number.NaN, y: 2 }, { x: 1, y: Infinity }])(
    'valor inválido %j vira null',
    (raw) => {
      expect(normalizeFloatingPosition(raw)).toBeNull()
    },
  )

  it('aceita coordenadas numéricas finitas', () => {
    expect(normalizeFloatingPosition({ x: 10.5, y: -3, extra: true })).toEqual({ x: 10.5, y: -3 })
  })
})

describe('clampFloatingPosition', () => {
  it('posição dentro da janela fica igual (arredondada)', () => {
    expect(clampFloatingPosition({ x: 100.4, y: 200.6 }, size, viewport)).toEqual({ x: 100, y: 201 })
  })

  it('não deixa sair pela esquerda/topo', () => {
    expect(clampFloatingPosition({ x: -50, y: -10 }, size, viewport)).toEqual({
      x: FLOATING_EDGE_MARGIN,
      y: FLOATING_EDGE_MARGIN,
    })
  })

  it('não deixa sair pela direita/base', () => {
    expect(clampFloatingPosition({ x: 5000, y: 5000 }, size, viewport)).toEqual({
      x: 1024 - 400 - FLOATING_EDGE_MARGIN,
      y: 768 - 150 - FLOATING_EDGE_MARGIN,
    })
  })

  it('janela menor que o painel: cola na margem superior esquerda', () => {
    expect(
      clampFloatingPosition({ x: 300, y: 300 }, size, { width: 200, height: 100 }, 4),
    ).toEqual({ x: 4, y: 4 })
  })
})

describe('load/save', () => {
  it('sem preferência salva: null (canto padrão)', () => {
    expect(loadFloatingPosition(KEY)).toBeNull()
  })

  it('persiste e recarrega a posição', () => {
    saveFloatingPosition(KEY, { x: 120, y: 80 })
    expect(loadFloatingPosition(KEY)).toEqual({ x: 120, y: 80 })
  })

  it('cada chave guarda a sua posição', () => {
    saveFloatingPosition(KEY, { x: 120, y: 80 })
    expect(loadFloatingPosition('outra.chave')).toBeNull()
  })

  it('salvar null volta ao canto padrão', () => {
    saveFloatingPosition(KEY, { x: 120, y: 80 })
    saveFloatingPosition(KEY, null)
    expect(loadFloatingPosition(KEY)).toBeNull()
  })
})
