// @vitest-environment node
// A rota existe em desenvolvimento e em builds de campanha explícitos.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'


const here = path.dirname(fileURLToPath(import.meta.url))

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('diagnostics UI route', () => {
  it.each([
    [true, undefined, true],
    [false, '1', true],
    [false, undefined, false],
    [false, '0', false],
    [false, 'true', false],
  ])('DEV=%s, campanha=%s: rota habilitada=%s', async (dev, campaign, enabled) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('VITE_DIAGNOSTICS_CAMPAIGN', campaign)
    vi.resetModules()
    const { diagnosticsRoutes } = await import('../../src/modules/diagnostics/routes')
    expect(diagnosticsRoutes).toHaveLength(enabled ? 1 : 0)
    if (enabled) {
      expect(diagnosticsRoutes[0].path).toBe('diagnostics')
      expect(diagnosticsRoutes[0].name).toBe('diagnostics')
      expect(typeof diagnosticsRoutes[0].component).toBe('function')
    }
  })

  it('view existe no disco (import não resolvido quebraria o build)', () => {
    const view = path.resolve(here, '../../src/modules/diagnostics/views/DiagnosticsView.vue')
    expect(() => readFileSync(view, 'utf8')).not.toThrow()
  })
})
