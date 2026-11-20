import { describe, expect, it } from 'vitest'

/**
 * Cobertura de constants — navegação principal, versão do app e chaves.
 */

import { mainNavRoutes } from '@shared/constants/navigation'
import {
  APP_PRODUCT_NAME,
  APP_USER_DATA_DIR,
} from '@shared/constants/app'

describe('mainNavRoutes', () => {
  it('rotas principais com key/to/labelKey únicos', () => {
    const keys = mainNavRoutes.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const route of mainNavRoutes) {
      expect(route.to).toBeTruthy()
      expect(route.labelKey).toBeTruthy()
      expect(route.icon).toBeTruthy()
    }
    expect(keys).toContain('home')
    expect(keys).toContain('albums')
    expect(keys).toContain('liturgy')
    expect(keys).toContain('bible')
    expect(keys).toContain('settings')
  })
})

describe('app constants', () => {
  it('APP_VERSION inicia com v', async () => {
    const { APP_VERSION } = await import('@shared/constants/app')
    expect(APP_VERSION.startsWith('v')).toBe(true)
  })

  it('nome do produto e pasta de dados', () => {
    expect(APP_PRODUCT_NAME).toBe('LouvorJA - PIANO')
    expect(APP_USER_DATA_DIR).toBe('LouvorJA-PIANO')
  })
})
