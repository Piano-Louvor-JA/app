import { describe, expect, it } from 'vitest'

import { applyOrder, moveById } from '../services/reorder'

const id = (s: string) => s

describe('reordenar listas', () => {
  it('soltar sobre outro item: desce para depois dele, sobe para antes', () => {
    expect(moveById(['a', 'b', 'c', 'd'], id, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveById(['a', 'b', 'c', 'd'], id, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('mesmo item ou ID desconhecido: lista igual (cópia)', () => {
    const list = ['a', 'b']
    expect(moveById(list, id, 'a', 'a')).toEqual(list)
    expect(moveById(list, id, 'x', 'a')).toEqual(list)
    expect(moveById(list, id, 'a', 'x')).not.toBe(list)
  })

  it('ordem salva: novos no topo, salvos na ordem, sumidos ignorados', () => {
    expect(applyOrder(['n1', 'a', 'b', 'n2', 'c'], id, ['c', 'x', 'a', 'b'])).toEqual(['n1', 'n2', 'c', 'a', 'b'])
    expect(applyOrder(['a', 'b'], id, [])).toEqual(['a', 'b'])
  })
})
