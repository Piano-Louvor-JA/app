import { describe, it, expect } from 'vitest'
import { reorderLiturgyItems } from '../services/liturgy-item-helpers'
import type { LiturgyItem } from '../types/liturgy'

const cat = (id: string): LiturgyItem =>
  ({ id, type: 'category', categoryId: null, name: id }) as unknown as LiturgyItem
const ch = (id: string, cid: string): LiturgyItem =>
  ({ id, type: 'music', categoryId: cid, name: id }) as unknown as LiturgyItem
const loose = (id: string): LiturgyItem =>
  ({ id, type: 'music', categoryId: null, name: id }) as unknown as LiturgyItem

describe('item-helpers kill plane 4 — #152 dest = insertAt - tamanho do bloco', () => {
  it('mover categoria pra frente sobre item solto: bloco inteiro fica ANTES do alvo', () => {
    // [c1 x] c2 z a → mover c1 (bloco 0..2) pro insertAt do drop em 'a' (idx 4)
    // original: dest = insertAt(5) - 2 = 3 → [c2 z c1 x a]
    // mutante #152 (dest = blockEnd + fromIndex = 2+0=2): [c2 c1 x z a] — errado
    const items = [cat('c1'), ch('x', 'c1'), cat('c2'), ch('z', 'c2'), loose('a')]
    const result = reorderLiturgyItems(items, 0, 4)
    expect(result.map((i) => i.id)).toEqual(['c2', 'z', 'a', 'c1', 'x'])
  })

  it('mover categoria 2 blocos pra frente sobre looses: aritmética do dest', () => {
    // c1 c2 a b → c1 (bloco 1 item) sobre 'b' (idx 3): insertAt=4, dest=4-1=3
    const items = [cat('c1'), cat('c2'), loose('a'), loose('b')]
    const result = reorderLiturgyItems(items, 0, 3)
    expect(result.map((i) => i.id)).toEqual(['c2', 'a', 'b', 'c1'])
  })
})
