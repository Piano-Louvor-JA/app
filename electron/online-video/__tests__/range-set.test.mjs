// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { RangeSet } from '../range-set.mjs'

describe('RangeSet', () => {
  it('starts empty', () => {
    const set = new RangeSet()
    expect(set.total()).toBe(0)
    expect(set.has(0, 1)).toBe(false)
    expect(set.gaps(10)).toEqual([[0, 10]])
  })

  it('merges overlapping and touching ranges', () => {
    const set = new RangeSet()
    set.add(0, 10)
    set.add(20, 30)
    set.add(10, 20)
    set.add(25, 40)
    expect(set.ranges()).toEqual([[0, 40]])
    expect(set.total()).toBe(40)
  })

  it('keeps separate ranges sorted', () => {
    const set = new RangeSet()
    set.add(50, 60)
    set.add(0, 10)
    set.add(20, 30)
    expect(set.ranges()).toEqual([[0, 10], [20, 30], [50, 60]])
  })

  it('ignores empty or inverted ranges', () => {
    const set = new RangeSet()
    set.add(5, 5)
    set.add(9, 3)
    expect(set.total()).toBe(0)
  })

  it('answers whether a range is fully downloaded', () => {
    const set = new RangeSet()
    set.add(0, 10)
    set.add(20, 30)
    expect(set.has(2, 8)).toBe(true)
    expect(set.has(0, 10)).toBe(true)
    expect(set.has(8, 12)).toBe(false)
    expect(set.has(10, 20)).toBe(false)
    expect(set.has(5, 5)).toBe(true)
  })

  it('measures the contiguous bytes available from a position', () => {
    const set = new RangeSet()
    set.add(0, 10)
    set.add(20, 30)
    expect(set.contiguousFrom(4)).toBe(10)
    expect(set.contiguousFrom(10)).toBe(10)
    expect(set.contiguousFrom(25)).toBe(30)
  })

  it('finds the first missing byte from a position', () => {
    const set = new RangeSet()
    set.add(0, 10)
    set.add(20, 30)
    expect(set.firstMissing(0, 40)).toBe(10)
    expect(set.firstMissing(22, 40)).toBe(30)
    expect(set.firstMissing(12, 40)).toBe(12)
    set.add(30, 40)
    expect(set.firstMissing(22, 40)).toBe(40)
  })

  it('lists the gaps up to the track size', () => {
    const set = new RangeSet()
    set.add(10, 20)
    set.add(30, 35)
    expect(set.gaps(40)).toEqual([[0, 10], [20, 30], [35, 40]])
    set.add(0, 40)
    expect(set.gaps(40)).toEqual([])
  })
})
