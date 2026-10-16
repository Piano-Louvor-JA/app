// @vitest-environment node
// Rota /#/diagnostics removida: o diagnóstico agora é card em /config/general
// (sempre disponível no desktop). Este teste trava o contrato novo: nenhum
// ambiente registra a rota legada e a view legada não volta ao disco.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'


const here = path.dirname(fileURLToPath(import.meta.url))

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('diagnostics UI route (legada, removida)', () => {
  it.each([
    [true, undefined],
    [false, '1'],
    [false, undefined],
  ])('DEV=%s, campanha=%s: nenhuma rota registrada', async (dev, campaign) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('VITE_DIAGNOSTICS_CAMPAIGN', campaign)
    vi.resetModules()
    const { diagnosticsRoutes } = await import('../../src/modules/diagnostics/routes')
    expect(diagnosticsRoutes).toEqual([])
  })

  it('view legada não existe no disco (rota morta não deve voltar)', () => {
    const view = path.resolve(here, '../../src/modules/diagnostics/views/DiagnosticsView.vue')
    expect(existsSync(view)).toBe(false)
  })
})
