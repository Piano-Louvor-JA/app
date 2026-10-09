// @vitest-environment node
// constants.ts carrega a feature flag "Minhas Coletâneas" (religada 16/09,
// decisão do Rafael junto com a aba Comunidade). O teste documenta o contrato:
// a flag DEVE estar true; se alguém desligar, é decisão de produto consciente.
import { describe, expect, it } from 'vitest'
import { SHOW_CUSTOM_COLLECTIONS } from '../constants'

describe('albums/constants', () => {
  it('SHOW_CUSTOM_COLLECTIONS está ligada (decisão 16/09)', () => {
    expect(SHOW_CUSTOM_COLLECTIONS).toBe(true)
  })
})
