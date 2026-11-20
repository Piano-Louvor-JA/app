// edid.mjs — parser EDID stdlib (fabricante/modelo p/ diagnóstico)
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  edidManufacturer,
  edidName,
  parseEdid,
} from '../edid.mjs'

/** EDID 1.4 sintético: header 00 FF.., mfr "BNQ" (BenQ), name descriptor. */
function synthEdid({ manufacturer = 'BNQ', name = 'BenQ GW2270' } = {}) {
  const buf = Buffer.alloc(128)
  // header
  buf.set([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00])
  // manufacturer: 3 letras A=1..Z=26, 5 bits cada, big-endian u16
  const codes = manufacturer.split('').map((c) => c.charCodeAt(0) - 64)
  let u16 = 0
  for (const code of codes) u16 = (u16 << 5) | code
  buf.writeUInt16BE(u16, 8)
  buf.writeUInt16LE(0x1234, 10) // product code
  // descriptor de nome (0xFC) no slot base 54
  buf[54] = 0; buf[55] = 0; buf[56] = 0; buf[57] = 0xfc; buf[58] = 0
  buf.write(name.padEnd(13, '\n').slice(0, 13), 59, 'ascii')
  return buf
}

describe('edid parser', () => {
  it('manufacturer: 3 letras dos bytes 8-9', () => {
    expect(edidManufacturer(synthEdid({ manufacturer: 'BNQ' }))).toBe('BNQ')
    expect(edidManufacturer(synthEdid({ manufacturer: 'SAM' }))).toBe('SAM')
  })

  it('name descriptor 0xFC no slot 54', () => {
    expect(edidName(synthEdid({ name: 'BenQ GW2270' }))).toBe('BenQ GW2270')
  })

  it('parseEdid completo', () => {
    const parsed = parseEdid(synthEdid())
    expect(parsed).toEqual({
      manufacturer: 'BNQ',
      productCode: '1234',
      name: 'BenQ GW2270',
    })
  })

  it('bounds: buffer curto/inválido → null (nunca lança)', () => {
    expect(parseEdid(null)).toBeNull()
    expect(parseEdid(Buffer.alloc(10))).toBeNull()
    expect(edidManufacturer(Buffer.alloc(10))).toBeNull() // bytes 0 → código inválido
    expect(edidName(Buffer.alloc(20))).toBeNull()
  })

  it('name ausente → null (sem descriptor 0xFC)', () => {
    const buf = synthEdid()
    buf[57] = 0xff // não é 0xFC
    expect(edidName(buf)).toBeNull()
    expect(parseEdid(buf)?.name).toBeNull()
  })
})
