import { describe, expect, it } from 'vitest'

import { diagnosticsRoutes } from '../routes'

describe('diagnosticsRoutes (rota dev-only)', () => {
  it('em DEV exporta a rota /diagnostics com lazy import da view', async () => {
    expect(Array.isArray(diagnosticsRoutes)).toBe(true)
    if (!import.meta.env.DEV) return
    expect(diagnosticsRoutes).toHaveLength(1)
    const route = diagnosticsRoutes[0]
    expect(route.path).toBe('diagnostics')
    expect(route.name).toBe('diagnostics')
    expect(route.meta).toMatchObject({ navKey: 'diagnostics' })
    // lazy component: promise de módulo com default
    const component = route.component as () => Promise<{ default: unknown }>
    const mod = await component()
    expect(mod.default).toBeTruthy()
  })

  it('fora de DEV não registra rota (app normal não navega)', () => {
    if (import.meta.env.DEV) return
    expect(diagnosticsRoutes).toEqual([])
  })
})
