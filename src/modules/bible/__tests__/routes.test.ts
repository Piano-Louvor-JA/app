// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { bibleRoutes } from '../routes'

describe('bibleRoutes', () => {
  it('define a rota bible com view e navKey', () => {
    expect(bibleRoutes).toHaveLength(1)
    const route = bibleRoutes[0]
    expect(route.path).toBe('bible')
    expect(route.name).toBe('bible')
    expect(route.meta).toEqual({ navKey: 'bible' })
    // component é o BibleView lazy/import direto
    expect(route.component).toBeDefined()
  })
})
