// @vitest-environment jsdom
// datapacket-parser — parseDataPacket XML Midas/ClientDataset
import { describe, it, expect } from 'vitest'
import { parseDataPacket } from '../datapacket-parser'

describe('parseDataPacket', () => {
  it('XML sem ROWDATA: lista vazia', () => {
    expect(parseDataPacket('<XML><OUTRO/></XML>')).toEqual([])
  })

  it('ROWDATA com rows: extrai atributos em uppercase', () => {
    const xml = `<?xml version="1.0"?>
<DATAPACKET Version="2.0">
<ROWDATA>
<ROW RowType="1" NOME="Hino 1" NUMERO="1"/>
<ROW RowType="1" NOME="Hino 2" NUMERO="2"/>
</ROWDATA>
</DATAPACKET>`
    const rows = parseDataPacket(xml)
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual({ ROWTYPE: '1', NOME: 'Hino 1', NUMERO: '1' })
    expect(rows[1].NOME).toBe('Hino 2')
  })

  it('unescape de entidades XML', () => {
    const xml = `<ROWDATA><ROW TEXTO="A &amp; B &lt;C&gt; &quot;D&quot;"/></ROWDATA>`
    const rows = parseDataPacket(xml)
    expect(rows[0].TEXTO).toBe('A & B <C> "D"')
  })

  it('ROWDATA auto-fechado (vazio): lista vazia', () => {
    expect(parseDataPacket('<ROWDATA/>')).toEqual([])
  })

  it('ROW sem atributos: não casa (precisa de espaço)', () => {
    const xml = '<ROWDATA><ROW/></ROWDATA>'
    expect(parseDataPacket(xml)).toEqual([])
  })
})
