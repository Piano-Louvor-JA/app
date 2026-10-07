import { describe, expect, it } from 'vitest'
import { hasDistinctSlideTimes } from '../media-slides'

describe('hasDistinctSlideTimes', () => {
  it('import sem tempo_hms não dispara avanço automático', () => {
    expect(hasDistinctSlideTimes([0, 0, 0])).toBe(false)
  })

  it('tempos diferentes seguem a reprodução', () => {
    expect(hasDistinctSlideTimes([0, 12, 40])).toBe(true)
  })
})
