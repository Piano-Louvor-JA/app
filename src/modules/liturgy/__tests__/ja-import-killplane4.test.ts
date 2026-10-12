import { describe, it, expect } from 'vitest'
import { parseJaLiturgy } from '../services/liturgy-ja-import'

/**
 * Kill plane 4 liturgy-ja-import — regex finais:
 * #24 baseId com índice de 2 dígitos (_i10), #49/#58 extensão no meio do nome.
 */

const MUSIC = 'tipo=musica\nitem=H\nmusica=1\n'

describe('#24 baseId com i de 2 dígitos', () => {
  it('item7_d1_i10 dedupe com base item7', () => {
    // original: baseId('item7_d1_i10') = 'item7' -> seções item7 e item7_d1_i10
    // apontam pro MESMO id -> primeiro no Map vence
    const ja = [
      '[Geral]',
      '1=item7_d1_i10',
      '[item7]',
      MUSIC,
      '[item7_d1_i10]',
      'tipo=musica\nitem=SEGUNDO\nmusica=2\n',
    ].join('\n')
    const r = parseJaLiturgy(ja)
    expect(r.sunday).toHaveLength(1)
    expect(r.sunday?.[0]?.name).toBe('H') // item7 veio primeiro no Map
  })

  it('_i10 no meio não é sufixo', () => {
    const ja = [
      '[Geral]',
      '1=item7_d1_i10_x',
      '[item7_d1_i10_x]',
      MUSIC,
    ].join('\n')
    const r = parseJaLiturgy(ja)
    expect(r.sunday?.[0]?.id).toBe('ja_item7_d1_i10_x')
  })
})

describe('#49/#58 extensão deve estar no FIM do nome', () => {
  it('y.webp.bak não é images; z.pptx.bak não é presentation', () => {
    const ja = [
      '[Geral]',
      '1=i1',
      '2=p1',
      '[i1]',
      'tipo=arquivo\ndir=/f/y.webp.bak\n',
      '[p1]',
      'tipo=arquivo\ndir=/f/z.pptx.bak\n',
    ].join('\n')
    const r = parseJaLiturgy(ja)
    expect(r.sunday?.[0]?.type).toBe('other_files')
    expect(r.monday?.[0]?.type).toBe('other_files')
  })
})
