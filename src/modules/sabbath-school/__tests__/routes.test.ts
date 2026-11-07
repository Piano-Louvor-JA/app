// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('../views/SabbathSchoolView.vue', () => ({ default: {} }))

import { sabbathSchoolRoutes } from '../routes'

describe('sabbathSchoolRoutes', () => {
  it('define a rota da Escola Sabatina dentro de Utilitários', () => {
    expect(sabbathSchoolRoutes).toHaveLength(1)
    expect(sabbathSchoolRoutes[0].path).toBe('utilities/sabbath-school')
    expect(sabbathSchoolRoutes[0].name).toBe('utilities-sabbath-school')
    expect(sabbathSchoolRoutes[0].meta).toEqual({ navKey: 'utilities' })
  })
})
