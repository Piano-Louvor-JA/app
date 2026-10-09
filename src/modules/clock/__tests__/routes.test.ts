// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { utilitiesRoutes } from '../routes'

describe('utilitiesRoutes', () => {
  it('define rotas com path, name e navKey esperados', () => {
    expect(utilitiesRoutes.length).toBeGreaterThan(1)
    const paths = utilitiesRoutes.map((r) => r.path)
    expect(paths).toContain('utilities')
    expect(paths).toContain('utilities/clock')
    expect(paths).toContain('utilities/temporizador')
    for (const route of utilitiesRoutes) {
      expect(route.name).toBeTruthy()
      expect(route.meta).toEqual({ navKey: 'utilities' })
    }
  })
})
