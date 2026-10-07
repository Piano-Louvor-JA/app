import { describe, expect, it } from 'vitest'
import { hasDistinctSlideTimes } from '../media-slides'

describe('hasDistinctSlideTimes', () => {
  it('import sem tempo_hms não dispara avanço automático', () => {
    expect(hasDistinctSlideTimes([0, 0, 0])).toBe(false)
  })

  it('tempos diferentes seguem a reprodução', () => {
    expect(hasDistinctSlideTimes([0, 12, 40])).toBe(true)
  })

  it('zeros iniciais com um tempo depois não sincronizam', () => {
    expect(hasDistinctSlideTimes([0, 0, 30])).toBe(false)
  })
})

 it('capa sintética não invalida primeira letra em zero', () => {
   expect(hasDistinctSlideTimes([0, 0, 30], true)).toBe(true)
   expect(hasDistinctSlideTimes([0, 12], true)).toBe(true)
   expect(hasDistinctSlideTimes([0, 0, 0, 30], true)).toBe(false)
   expect(hasDistinctSlideTimes([0, 0, 0], true)).toBe(false)
 })
