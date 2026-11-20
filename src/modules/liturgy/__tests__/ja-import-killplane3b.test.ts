import { describe, it, expect } from 'vitest'
import { parseJaLiturgy } from '../services/liturgy-ja-import'

/**
 * Kill plane 3b — #9 SECTION_RE sem $:
 * '[Geral] x' com o corpo do geral ANTES de [item1] e sem [Geral] limpo:
 * original: '[Geral] x' não é seção -> geral nunca criada -> THROW
 * mutante: cria geral e absorve o 1=item1 -> NÃO throw -> resultado diff
 */

const MUSIC = 'tipo=musica\nitem=H\nmusica=1\n'

describe('#9 âncora $ do SECTION_RE', () => {
  it('[Geral] com sufixo não inicia geral; sem geral real -> throw', () => {
    const ja = `[Geral] x\n1=item1\n[item1]\n${MUSIC}`
    expect(() => parseJaLiturgy(ja)).toThrow('sem seção [Geral]')
  })

  it('[item1] com sufixo não é seção -> item ignorado -> throw sem itens', () => {
    const ja = `[Geral]\n1=item1\n[item1] x\n${MUSIC}`
    expect(() => parseJaLiturgy(ja)).toThrow()
  })
})
