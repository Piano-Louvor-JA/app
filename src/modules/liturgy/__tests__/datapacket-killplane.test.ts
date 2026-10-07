// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { parseDataPacket } from '../services/datapacket-parser'

/**
 * Kill plane datapacket-parser (survivors #9, #27, #29, #31).
 * #9: \s+ -> \s (ROW com 1 espaço exato? \s+ casa 1+; \s casa 1 — difere em múltiplos espaços)
 * #27/#29/#31: unescape de entidades.
 */

describe('parseDataPacket kill plane', () => {
  it('#9: ROW com múltiplos espaços antes dos attrs casa', () => {
    const xml = '<DATAPACKET><ROWDATA><ROW   NOME="A"  ID="1"/></ROWDATA></DATAPACKET>'
    const rows = parseDataPacket(xml)
    expect(rows).toEqual([{ NOME: 'A', ID: '1' }])
  })

  it('#27/#29/#31: entidades XML são desescapadas', () => {
    const xml = [
      '<DATAPACKET><ROWDATA>',
      '<ROW NOME="A &amp; B" DESCR="x &lt;tag&gt; e &quot;aspas&quot;"/>',
      '</ROWDATA></DATAPACKET>',
    ].join('\n')
    const rows = parseDataPacket(xml)
    expect(rows[0]!.NOME).toBe('A & B')
    expect(rows[0]!.DESCR).toBe('x <tag> e "aspas"')
  })

  it('sem ROWDATA -> vazio; sem ROW -> vazio', () => {
    expect(parseDataPacket('<DATAPACKET></DATAPACKET>')).toEqual([])
    expect(parseDataPacket('<ROWDATA></ROWDATA>')).toEqual([])
  })
})
