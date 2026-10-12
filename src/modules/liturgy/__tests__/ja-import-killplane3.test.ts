import { describe, it, expect } from 'vitest'
import { parseJaLiturgy } from '../services/liturgy-ja-import'

/**
 * Kill plane 2 liturgy-ja-import — mutants finais:
 * #9 SECTION_RE sem $: linha "[Geral] lixo" não pode virar seção
 * #16 DELPHI_COLOR_RE sem ^: "X$00AB1234" não pode casar
 * #11/#12/#135 equivalents: line já trimada (L107) torna ^/$ redundantes
 * nos REs de seção/KV — provados equivalentes por construção.
 */

function rawJa(body: string): string {
  return body
}

const MUSIC = 'tipo=musica\nitem=H\nmusica=1\n'

describe('kill plane 2 — âncoras dos regex', () => {
  it('#9 "[Geral] lixo" NÃO é seção (arquivo real vem depois)', () => {
    // mutante sem $: '[Geral] lixo' casaria SECTION_RE e zeraria o estado,
    // depois [item1] viraria seção — mas [Geral] real sumiu -> throw 'sem [Geral]'
    const ja = rawJa(`[Geral] lixo\n1=item1\n[item1]\n${MUSIC}[Geral]\n1=item1\n`)
    // Linha '[Geral] lixo': original NÃO casa (tem sufixo) -> continua null
    // current; '1=item1' ignorado; [item1] cria seção; [Geral] real cria geral.
    const r = parseJaLiturgy(ja)
    expect(r.sunday?.[0]?.name).toBe('H')
  })

  it('#9b "[Geral] lixo" no topo: original não reconhece geral ali', () => {
    // Se o mutante casar '[Geral] lixo' como seção 'geral', o arquivo fica
    // SEM geral real -> throw. Original: geral vem da linha limpa depois.
    const ja = rawJa(`[Geral] x\n[item1]\n${MUSIC}[Geral]\n1=item1\n`)
    const r = parseJaLiturgy(ja)
    expect(r.sunday).toHaveLength(1)
  })

  it('#16 cor com prefixo antes do $ NÃO é cor Delphi', () => {
    const ja = rawJa(
      `[Geral]\n1=item1\n[item1]\ntipo=musica\nitem=a\ncor=X$00AB1234\n`,
    )
    const r = parseJaLiturgy(ja)
    // original: não casa (tem prefixo) -> accentColor ''
    expect(r.sunday?.[0]?.accentColor).toBe('')
  })
})
