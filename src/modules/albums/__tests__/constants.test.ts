// @vitest-environment node
// constants.ts carrega a feature flag "Minhas Coletâneas". O teste documenta
// a decisão de produto vigente: desligada em 20/11/2026 porque o recurso não
// está pronto (vai para a aba Comunidade). Religar é decisão consciente.
// TODO(minhas-coletaneas): rever quando a seção voltar.
import { describe, expect, it } from 'vitest'
import { SHOW_CUSTOM_COLLECTIONS } from '../constants'

describe('albums/constants', () => {
  it('SHOW_CUSTOM_COLLECTIONS está desligada (decisão 20/11/2026)', () => {
    expect(SHOW_CUSTOM_COLLECTIONS).toBe(false)
  })
})
