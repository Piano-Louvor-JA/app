import { describe, it, expect } from 'vitest'
import {
  reorderLiturgyItems,
  findCategoryInsertIndex,
  getCategoryBlockEnd,
} from '../services/liturgy-item-helpers'
import type { LiturgyItem } from '../types/liturgy'

const cat = (id: string): LiturgyItem =>
  ({ id, type: 'category', name: id }) as unknown as LiturgyItem
const child = (id: string, categoryId: string): LiturgyItem =>
  ({ id, type: 'music', name: id, categoryId, musicId: 1 }) as unknown as LiturgyItem
const loose = (id: string): LiturgyItem =>
  ({ id, type: 'music', name: id, musicId: 1 }) as unknown as LiturgyItem

describe('item-helpers kill plane — move/reorder survivors (#74 #91-93 #146 #152)', () => {
  it('#91/#92/#93 fromIndex === toIndex retorna a MESMA referência (no-op)', () => {
    const items = [loose('a'), loose('b'), loose('c')]
    // original: early-return devolve o mesmo array; mutante que remove a
    // cláusula faz splice+splice e devolve cópia nova
    expect(reorderLiturgyItems(items, 1, 1)).toBe(items)
  })

  it('#74 drop sobre filho resolve a categoria PAI correta (não o índice 0)', () => {
    // pai está no índice 1, não 0 — mutante (item)=>true devolve 0
    const items = [loose('a'), cat('c1'), child('x', 'c1')]
    const result = reorderLiturgyItems(items, 0, 2)
    // 'a' vira filho de c1: inserido antes do bloco c1
    expect(result.map((i) => i.id)).toEqual(['c1', 'x', 'a'])
    expect(result[0].id).toBe('c1')
  })

  it('#146 move de categoria pra trás: dest não pode ser bloqueado pelo clamp', () => {
    // 3 itens antes do bloco: mutante dest negativo cai no clamp 0
    const items = [
      loose('a'),
      loose('b'),
      loose('c'),
      cat('k'),
      child('k1', 'k'),
    ]
    const result = reorderLiturgyItems(items, 3, 1)
    // drop no índice 1 (loose b): insertAt = 1 (from > to)
    expect(result.map((i) => i.id)).toEqual(['a', 'k', 'k1', 'b', 'c'])
  })

  it('#152 move de categoria pra frente: dest = insertAt - tamanho do bloco', () => {
    const items = [
      cat('k'),
      child('k1', 'k'),
      child('k2', 'k'),
      loose('a'),
      loose('b'),
    ]
    // mover bloco k (3 itens) pro fim: insertAt = to+1 = 5 → dest = 5-3 = 2
    const result = reorderLiturgyItems(items, 0, 4)
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'k', 'k1', 'k2'])
  })

  it('sanidade: findCategoryInsertIndex e getCategoryBlockEnd', () => {
    const items = [loose('a'), cat('c'), child('x', 'c'), loose('b')]
    expect(findCategoryInsertIndex(items, 'c')).toBe(3)
    expect(getCategoryBlockEnd(items, 1)).toBe(3)
    expect(getCategoryBlockEnd(items, 0)).toBe(1)
    expect(findCategoryInsertIndex(items, 'zz')).toBe(4)
  })
})

/*
 * EQUIVALENTES documentados (batch move/reorder, run 18/09):
 * #12  L29 items.length-1 → +1: índices fora do array são undefined e o
 *      `item?.type === 'category'` pula — resultado idêntico.
 * #39  L50 `insertAt < length` → `<=`: items[length] é undefined → !child break.
 * #46  L52 break em `!child || type==='category'` → false: categoria tem
 *      categoryId undefined → break na linha seguinte (categoryId !== alvo).
 * #48  L52 'category' → '': idem — categoria cai no check de categoryId.
 * #64/#66 L78 target categoria → toIndex: categoria sem categoryId → a
 *      guarda seguinte (!target.categoryId) já devolve toIndex.
 * #69  L79 !target.categoryId → false: orphan/loose cai no findIndex sem
 *      match → parentIndex -1 → ternário devolve toIndex.
 * #79  L83 ternário → true: parentIndex -1 → items[-1] undefined → else do
 *      insertAt usa toIndex, igual ao retorno original de toIndex.
 * #95  L95 fromIndex<0 → false: items[-1] undefined → guarda !moved cobre.
 * #101/#102 L98 fromIndex>=length → false/>: items[from] undefined → !moved.
 * #121 L115 >= → >: toIndex===fromIndex já retornou na primeira guarda.
 * #126 L121 target?.type==='category' → true: getCategoryBlockEnd de
 *      não-categoria devolve idx+1, mesma conta do ramo else.
 * #129 L121 ?. removido: targetCategoryIndex é sempre índice válido.
 * #134 L124 < → <=: fromIndex===targetCategoryIndex impossível (guarda L115
 *      impede drop dentro do próprio bloco).
 * #139 L126 < → <=: fromIndex===toIndex já retornou na primeira guarda.
 * #148 L132 > → >=: insertAt===fromIndex inatingível (targetEnd só é usado
 *      quando from < targetCategoryIndex < targetEnd).
 * #158 L149 != null ternário → true: Map.get(null/undefined) → ?? null,
 *      mesmo resultado do ramo else.
 */
