import { describe, expect, it } from 'vitest'

import { diagnosticsRoutes } from '../routes'

// Rota /#/diagnostics removida (card em /config/general a substituiu).
// Array vazio em qualquer ambiente — router continua importando sem quebrar.
describe('diagnosticsRoutes (rota legada removida)', () => {
  it('não registra rota em nenhum ambiente', () => {
    expect(diagnosticsRoutes).toEqual([])
  })
})
