/**
 * Parser de DATAPACKET (Midas/ClientDataset XML) do LouvorJA Delphi.
 * Usado por itensAgendados.xml e itensAgendadosCategorias.xml.
 */

export type DataPacketRow = Record<string, string>

export function parseDataPacket(xml: string): DataPacketRow[] {
  const rows: DataPacketRow[] = []
  const rowdataRe = /<ROWDATA([^>]*)>/i
  const rowdataMatch = rowdataRe.exec(xml)
  if (!rowdataMatch) return rows
  const afterRowdata = xml.slice(rowdataMatch.index + rowdataMatch[0].length)
  const rowRe = /<ROW\s+([^>]*?)\/>/gi
  const attrRe = /([A-Za-z_][A-Za-z0-9_]*)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(afterRowdata))) {
    const row: DataPacketRow = {}
    let a: RegExpExecArray | null
    const attrs = m[1]!
    while ((a = attrRe.exec(attrs))) {
      row[a[1]!.toUpperCase()] = unescapeXml(a[2]!)
    }
    rows.push(row)
  }
  return rows
}

function unescapeXml(v: string): string {
  return v
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
}
