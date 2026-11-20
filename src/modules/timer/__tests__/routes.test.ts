// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { timerRoutes } from '../routes'

describe('timerRoutes', () => {
  it('define a rota utilities com view e navKey', () => {
    expect(timerRoutes).toHaveLength(1)
    expect(timerRoutes[0].path).toBe('utilities/timer')
    expect(timerRoutes[0].name).toBe('utilities-timer')
    expect(timerRoutes[0].meta).toEqual({ navKey: 'utilities' })
  })
})
