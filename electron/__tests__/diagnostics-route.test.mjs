// @vitest-environment node
// Aceite 7 (SPEC v1.2) — a rota /diagnostics EXISTE no bundle do renderer.
// Regressão do caso "não apareceu essa tela" (SrCaldeira): build sem a UI
// de diagnóstico empacotada não pode repetir. Auditoria ASAR fica no RELEASE.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { diagnosticsRoutes } from '../../src/modules/diagnostics/routes'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('diagnostics UI route', () => {
  it('rota /diagnostics registrada com view lazy (bundle separado sempre emitido)', () => {
    expect(diagnosticsRoutes).toHaveLength(1)
    expect(diagnosticsRoutes[0].path).toBe('diagnostics')
    expect(diagnosticsRoutes[0].name).toBe('diagnostics')
    expect(typeof diagnosticsRoutes[0].component).toBe('function')
  })

  it('view existe no disco (import não resolvido quebraria o build)', () => {
    const view = path.resolve(here, '../../src/modules/diagnostics/views/DiagnosticsView.vue')
    expect(() => readFileSync(view, 'utf8')).not.toThrow()
  })
})
