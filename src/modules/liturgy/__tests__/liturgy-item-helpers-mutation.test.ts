import { describe, expect, it } from 'vitest'

import {
  getCategoryBlockEnd,
  resolvePreferredCategoryId,
  reorderLiturgyItems,
  findCategoryInsertIndex,
} from '../services/liturgy-item-helpers'

describe('liturgy-item-helpers - exhaustive mutation kill', () => {
  const cat = (id: string) => ({ id, type: 'category' as const, categoryId: '' })
  const item = (id: string, categoryId: string) => ({ id, type: 'item' as const, categoryId })

  describe('resolvePreferredCategoryId', () => {
    it('returns selected category id when selected is category', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(resolvePreferredCategoryId(items, cat('c2'))).toBe('c2')
    })

    it('returns selected.categoryId when selected is item with categoryId', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(resolvePreferredCategoryId(items, item('i2', 'c2'))).toBe('c2')
    })

    it('returns last category in items when selected is null', () => {
      const items = [item('i1', 'c1'), cat('c2'), item('i2', 'c2')]
      expect(resolvePreferredCategoryId(items, null)).toBe('c2')
    })

    it('returns last category when selected is undefined', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(resolvePreferredCategoryId(items, undefined)).toBe('c1')
    })

    it('returns null when no categories in items', () => {
      const items = [item('i1', ''), item('i2', '')]
      expect(resolvePreferredCategoryId(items, null)).toBeNull()
    })

    it('returns null when items is empty', () => {
      expect(resolvePreferredCategoryId([], null)).toBeNull()
    })
  })

  describe('findCategoryInsertIndex', () => {
    it('returns items.length when category not found', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(findCategoryInsertIndex(items, 'c999')).toBe(2)
    })

    it('returns index after category when no children', () => {
      const items = [cat('c1'), cat('c2')]
      expect(findCategoryInsertIndex(items, 'c1')).toBe(1)
    })

    it('returns index after last child when category has children', () => {
      const items = [cat('c1'), item('i1', 'c1'), item('i2', 'c1'), cat('c2')]
      expect(findCategoryInsertIndex(items, 'c1')).toBe(3)
    })

    it('stops at next category boundary', () => {
      const items = [cat('c1'), item('i1', 'c1'), cat('c2'), item('i2', 'c2')]
      expect(findCategoryInsertIndex(items, 'c1')).toBe(2)
    })

    it('stops at child with different categoryId', () => {
      const items = [cat('c1'), item('i1', 'c1'), item('i2', 'c999'), cat('c2')]
      expect(findCategoryInsertIndex(items, 'c1')).toBe(2)
    })

    it('handles empty items array', () => {
      expect(findCategoryInsertIndex([], 'c1')).toBe(0)
    })
  })

  describe('getCategoryBlockEnd', () => {
    it('returns categoryIndex + 1 when no children', () => {
      const items = [cat('c1'), cat('c2')]
      expect(getCategoryBlockEnd(items, 0)).toBe(1)
    })

    it('includes contiguous children with same categoryId', () => {
      const items = [cat('c1'), item('i1', 'c1'), item('i2', 'c1'), cat('c2')]
      expect(getCategoryBlockEnd(items, 0)).toBe(3)
    })

    it('stops at next category', () => {
      const items = [cat('c1'), item('i1', 'c1'), cat('c2')]
      expect(getCategoryBlockEnd(items, 0)).toBe(2)
    })

    it('stops at child with different categoryId', () => {
      const items = [cat('c1'), item('i1', 'c1'), item('i2', 'c999'), cat('c2')]
      expect(getCategoryBlockEnd(items, 0)).toBe(2)
    })

    it('returns items.length when category at end', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(getCategoryBlockEnd(items, 0)).toBe(2)
    })
  })

  describe('reorderLiturgyItems', () => {
    it('returns same array when fromIndex === toIndex', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(reorderLiturgyItems(items, 0, 0)).toBe(items)
    })

    it('returns same array when fromIndex < 0', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(reorderLiturgyItems(items, -1, 1)).toBe(items)
    })

    it('returns same array when toIndex < 0', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(reorderLiturgyItems(items, 0, -1)).toBe(items)
    })

    it('returns same array when fromIndex >= length', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(reorderLiturgyItems(items, 2, 1)).toBe(items)
    })

    it('returns same array when toIndex >= length', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(reorderLiturgyItems(items, 0, 2)).toBe(items)
    })

    it('moves simple item (non-category) within array', () => {
      const items = [cat('c1'), item('i1', 'c1'), item('i2', 'c1')]
      const result = reorderLiturgyItems(items, 1, 2)
      expect(result).not.toBe(items)
      expect(result[1]).toEqual(item('i2', 'c1'))
      expect(result[2]).toEqual(item('i1', 'c1'))
    })

    it('moves item to front (non-category)', () => {
      const items = [cat('c1'), item('i1', 'c1'), item('i2', 'c1')]
      const result = reorderLiturgyItems(items, 2, 0)
      expect(result[0]).toEqual(item('i2', 'c1'))
    })

    it('moves category with children - no-op when dropped inside own block', () => {
      const items = [cat('c1'), item('i1', 'c1'), item('i2', 'c1'), cat('c2')]
      // fromIndex=0 (c1), blockEnd=3, toIndex=1 or 2 (inside block) -> no-op
      expect(reorderLiturgyItems(items, 0, 1)).toBe(items)
      expect(reorderLiturgyItems(items, 0, 2)).toBe(items)
    })

    it('moves category with children before target category (fromIndex < target)', () => {
      const items = [cat('c1'), item('i1', 'c1'), cat('c2'), item('i2', 'c2')]
      // move c1 (index 0, blockEnd=2) to before c2 (targetIndex=2)
      // fromIndex < targetCategoryIndex -> insertAt = targetEnd = 4 -> dest = 2
      // result: [c2, i2, c1, i1] -> c1 AFTER c2
      const result = reorderLiturgyItems(items, 0, 2)
      const c1Pos = result.findIndex((x) => x.id === 'c1')
      const c2Pos = result.findIndex((x) => x.id === 'c2')
      expect(c1Pos).toBeGreaterThan(c2Pos)
    })

    it('moves category with children after target category (fromIndex > target)', () => {
      const items = [cat('c1'), item('i1', 'c1'), cat('c2'), item('i2', 'c2')]
      // move c2 (index 2, blockEnd=4) to before c1 (targetIndex=0)
      // fromIndex > targetCategoryIndex -> insertAt = targetCategoryIndex = 0
      const result = reorderLiturgyItems(items, 2, 0)
      const c1Pos = result.findIndex((x) => x.id === 'c1')
      const c2Pos = result.findIndex((x) => x.id === 'c2')
      expect(c2Pos).toBeLessThan(c1Pos)
    })

    it('moves category to item target (non-category) - fromIndex < toIndex', () => {
      const items = [cat('c1'), item('i1', 'c1'), cat('c2'), item('i2', 'c2')]
      // move c1 (index 0) to position of i2 (toIndex=3, item)
      // target is item -> insertAt = toIndex + 1 = 4
      const result = reorderLiturgyItems(items, 0, 3)
      expect(result.length).toBe(4)
    })

    it('moves category to item target - fromIndex > toIndex', () => {
      const items = [cat('c1'), item('i1', 'c1'), cat('c2'), item('i2', 'c2')]
      // move c2 (index 2) to before i1 (toIndex=1, item)
      // target is item (i1, categoryId=c1) -> resolveDropCategoryIndex finds c1 at 0
      // fromIndex > targetCategoryIndex -> insertAt = targetCategoryIndex = 0
      // block = [c2, i2], next = [c1, i1], dest = 0
      // next.splice(0, 0, c2, i2) -> [c2, i2, c1, i1]
      const result = reorderLiturgyItems(items, 2, 1)
      const c2Pos = result.findIndex((x) => x.id === 'c2')
      expect(c2Pos).toBe(0)
    })

    it('handles moving item to negative index (no-op)', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(reorderLiturgyItems(items, 1, -1)).toBe(items)
    })

    it('handles moving item past end (no-op)', () => {
      const items = [cat('c1'), item('i1', 'c1')]
      expect(reorderLiturgyItems(items, 1, 5)).toBe(items)
    })

    it('moves category block with multiple children', () => {
      const items = [
        cat('c1'),
        item('i1', 'c1'),
        item('i2', 'c1'),
        item('i3', 'c1'),
        cat('c2'),
        item('j1', 'c2'),
      ]
      // move c1 block (indices 0-3) to after c2 (toIndex=4, target is c2 category)
      const result = reorderLiturgyItems(items, 0, 4)
      const c1Pos = result.findIndex((x) => x.id === 'c1')
      const c2Pos = result.findIndex((x) => x.id === 'c2')
      expect(c1Pos).toBeGreaterThan(c2Pos)
      // c1's children should stay together
      const i1Pos = result.findIndex((x) => x.id === 'i1')
      const i2Pos = result.findIndex((x) => x.id === 'i2')
      const i3Pos = result.findIndex((x) => x.id === 'i3')
      expect(i2Pos - i1Pos).toBe(1)
      expect(i3Pos - i2Pos).toBe(1)
    })

    it('does not duplicate items when moving category', () => {
      const items = [cat('c1'), item('i1', 'c1'), cat('c2')]
      const result = reorderLiturgyItems(items, 0, 2)
      const total = result.length
      expect(total).toBe(3)
    })
  })
})