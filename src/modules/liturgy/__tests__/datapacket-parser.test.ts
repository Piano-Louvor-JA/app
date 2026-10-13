import { describe, expect, it } from 'vitest'

import { parseDataPacket } from '../services/datapacket-parser'

const realCategoriasXml = `<?xml version="1.0" standalone="yes"?>  <DATAPACKET Version="2.0"><METADATA><FIELDS><FIELD attrname="ID" fieldtype="string" WIDTH="20"/><FIELD attrname="NOME" fieldtype="string" WIDTH="250"/></FIELDS><PARAMS/></METADATA><ROWDATA><ROW ID="11072026102847075" NOME="Provai e Vede"/></ROWDATA></DATAPACKET>`

describe('parseDataPacket', () => {
  it('arquivo real de categorias: 1 ROW Provai e Vede', () => {
    const rows = parseDataPacket(realCategoriasXml)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ID).toBe('11072026102847075')
    expect(rows[0]!.NOME).toBe('Provai e Vede')
  })

  it('múltiplas rows, atributos ausentes, escapes', () => {
    const xml =
      '<DATAPACKET Version="2.0"><METADATA/><ROWDATA>' +
      '<ROW ID="a1" NOME="Culto Jovem &amp; Louvor" ARQUIVO_INFO="I"/>' +
      '<ROW ID="a2" NOME="Sermão"/>' +
      '</ROWDATA></DATAPACKET>'
    const rows = parseDataPacket(xml)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.NOME).toBe('Culto Jovem & Louvor')
    expect(rows[0]!.ARQUIVO_INFO).toBe('I')
    expect(rows[1]!.ARQUIVO).toBeUndefined()
  })

  it('sem ROWDATA → vazio, sem crash', () => {
    expect(parseDataPacket('<DATAPACKET><METADATA/></DATAPACKET>')).toEqual([])
  })

  it('ROW sem atributos (com espaço): row vazia entra na lista', () => {
    const rows = parseDataPacket(
      '<ROWDATA><ROW /><ROW ID="x"/></ROWDATA>',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({})
    expect(rows[1]).toEqual({ ID: 'x' })
  })
})
