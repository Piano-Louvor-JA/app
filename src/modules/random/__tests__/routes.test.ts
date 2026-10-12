// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { randomRoutes } from '../routes'

describe('randomRoutes', () => {
  it('define a rota utilities com view e navKey', () => {
    expect(randomRoutes).toHaveLength(1)
    expect(randomRoutes[0].path).toBe('utilities/random')
    expect(randomRoutes[0].name).toBe('utilities-random')
    expect(randomRoutes[0].meta).toEqual({ navKey: 'utilities' })
  })
})
