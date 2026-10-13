// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { countdownRoutes } from '../routes'

describe('countdownRoutes', () => {
  it('define a rota utilities com view e navKey', () => {
    expect(countdownRoutes).toHaveLength(1)
    expect(countdownRoutes[0].path).toBe('utilities/countdown')
    expect(countdownRoutes[0].name).toBe('utilities-countdown')
    expect(countdownRoutes[0].meta).toEqual({ navKey: 'utilities' })
  })
})
